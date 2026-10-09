// Explicit paid smoke check; excluded from npm test and the published site.
import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import vm from 'node:vm';
import { deployedCall } from './deployed-api.mjs';
import { execFileSync } from 'node:child_process';
loadEnvFile('.env');
const scope = vm.createContext({});
vm.runInContext((await readFile('tgcloud/lib/session.js', 'utf8')).replace(/export /g, ''), scope);
vm.runInContext(await readFile('reader-learning.js', 'utf8'), scope);
const book = JSON.parse(await readFile('books/keliaujanti-biblioteka.json', 'utf8'));
const context = { reading: scope.ReaderLearning.readingContext(book, { chapter: 0, block: 0, item: 1 }),
  selection: scope.ReaderLearning.phraseContext(book, { chapter: 0, block: 0, item: 0 }).phrase };
const voice = process.argv.includes('--marius') ? 'marius' : 'egle';
const deployed = process.argv.includes('--deployed');
const tokenRequest = scope.createTokenRequest(context, 90, Date.now(), voice);
let grant;
const response = !deployed && await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
  method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(tokenRequest),
});
if (!deployed && !response.ok) throw new Error(`Token provisioning failed: HTTP ${response.status}`);
grant = deployed ? await deployedCall('startReaderCall', { bookId: 'keliaujanti-biblioteka', location: { chapter: 0, block: 0, item: 1 }, phraseLocation: { chapter: 0, block: 0, item: 0 }, voice }) : null;
const token = deployed ? { name: grant.token } : await response.json();
if (!token.name?.startsWith('auth_tokens/')) throw new Error('Invalid token');
const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', book.chapters[0].blocks[0].items[1].audio,
  '-f', 's16le', '-ar', '16000', '-ac', '1', 'pipe:1'], { maxBuffer: 2 * 1024 * 1024 });
const socket = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token.name)}`);
let turn = 0, bytes = 0, text = '', inputText = '', finished = false;
const timer = setTimeout(() => { socket.close(); console.error('Live check timed out'); process.exitCode = 1; }, 60000);
function sendText(text) {
  socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }));
}
socket.addEventListener('open', () => socket.send(JSON.stringify({ setup: {
  model: tokenRequest.bidiGenerateContentSetup.model, generationConfig: { responseModalities: ['AUDIO'] },
} })));
socket.addEventListener('message', async ({ data }) => {
  try {
    const message = JSON.parse(typeof data === 'string' ? data : await data.text());
    if (message.error) throw new Error('Gemini returned an error');
    if (message.setupComplete) {
      if (grant) await deployedCall('readerCallTime', { callId: grant.callId, action: 'start' });
      sendText('Соединение установлено. Поздоровайся согласно инструкции и жди.');
    }
    const content = message.serverContent;
    if (!content) return;
    text += content.outputTranscription?.text || '';
    inputText += content.inputTranscription?.text || '';
    for (const part of content.modelTurn?.parts || []) if (part.inlineData) bytes += Buffer.from(part.inlineData.data, 'base64').length;
    if (!content.turnComplete) return;
    if (!bytes || !text.trim()) throw new Error('No spoken response or transcription');
    console.log(JSON.stringify({ teacher: voice, deployed, turn: ++turn, audioBytes: bytes, transcript: text.trim().slice(0, 240), inputTranscript: inputText.slice(0, 180) }));
    text = ''; bytes = 0;
    if (turn === 1) sendText('Почему в выбранной фразе ryte, а не rytas? Дай одно короткое объяснение.');
    else if (turn === 2) {
      const update = { reading: scope.ReaderLearning.readingContext(book, { chapter: 0, block: 0, item: 1 }),
        selection: scope.ReaderLearning.phraseContext(book, { chapter: 0, block: 0, item: 1 }).phrase };
      socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'reading_update: ' + JSON.stringify(update) }] }], turnComplete: false } }));
      sendText('Я выбрал другую фразу. Назови ее русский перевод и попроси меня прочитать её для проверки произношения.');
    } else if (turn === 3) {
      // Match a continuously running browser microphone: silence before/after speech lets VAD settle.
      const stream = Buffer.concat([Buffer.alloc(16000), pcm, Buffer.alloc(32000)]);
      for (let start = 0; start < stream.length; start += 3200) {
        if (socket.readyState !== 1) return;
        socket.send(JSON.stringify({ realtimeInput: { audio: { data: stream.subarray(start, start + 3200).toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }));
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    } else {
      if (!inputText.trim()) throw new Error('No input audio transcription');
      finished = true; clearTimeout(timer); socket.close(); console.log('Live greeting, grammar, phrase switch and pronunciation exchange passed.');
    }
  } catch {
    clearTimeout(timer); socket.close(); console.error('Live response check failed'); process.exitCode = 1;
  }
});
socket.addEventListener('error', () => { clearTimeout(timer); console.error('Live connection failed'); process.exitCode = 1; });
socket.addEventListener('close', async ({ code }) => {
  if (grant) await deployedCall('readerCallTime', { callId: grant.callId, action: 'end' }); clearTimeout(timer); if (!finished) { console.error(`Live ended early (${code})`); process.exitCode = 1; } });
