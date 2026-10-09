const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function endpoint(fetch, book) {
  class EndpointError extends Error { constructor(message, data) { super(message); this.code = data.code; } }
  const context = vm.createContext({
    fetch, EndpointError, api: {}, checkCallAllowance: async () => ({ allowed: true }), getSettings: async () => ({ voice: 'egle' }), bookIds: ['sample'], books: { sample: book },
    geminiApiKey: 'test-key', db: { run: async()=>({rows:[]}) },
    reserveCall: async () => ({ deadline: Date.now() + 60000, callId: 'a'.repeat(32) }),
    updateCall: async () => ({}), reserveTokenIssue: async () => true,
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'reader-learning.js'), 'utf8'), context);
  context.phraseContext = context.ReaderLearning.phraseContext;
  context.readingContext = context.ReaderLearning.readingContext;
  vm.runInContext(fs.readFileSync(path.join(root, 'tgcloud/lib/session.js'), 'utf8').replace(/export /g, ''), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'tgcloud/endpoints/startReaderCall.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export default async function', 'async function startReaderCall'), context);
  return context.startReaderCall;
}

test('unverified visitors and unknown book paths cannot mint Gemini tokens', async () => {
  const call = endpoint(() => assert.fail('unexpected network request'));
  await assert.rejects(call({ bookId: 'sample' }, {}), error => error.code === 'AUTH_REQUIRED');
  await assert.rejects(call({ bookId: '../.env' }, { initData: { user: { id: 1 } } }), error => error.code === 'INVALID_PHRASE');
});

test('server ignores supplied prompt/text and derives Lithuanian boundary and tooltip from its own book', async () => {
  let tokenRequest;
  const book = { chapters: [{ blocks: [{ items: [
    { text: 'Rytè.', translation: 'Утром.', note: 'rytas — утро; ryte — местный падеж.' },
    { text: 'Sustójo.', translation: 'Остановилась.', note: 'sustoti — остановиться.' },
    { text: 'Paslaptìs.', translation: 'Секрет будущего.', note: 'не передавать' },
  ] }] }] };
  const call = endpoint(async (url, options) => {
    tokenRequest = JSON.parse(options.body);
    return { ok: true, json: async () => ({ name: 'auth_tokens/example' }) };
  }, book);
  const result = await call({ bookId: 'sample', location: { chapter: 0, block: 0, item: 1 },
    phraseLocation: { chapter: 0, block: 0, item: 0 }, systemPrompt: 'EVIL_PROMPT', reading: 'EVIL_TEXT' }, { initData: { user: { id: 1 } } });
  assert.equal(result.token, 'auth_tokens/example');
  const prompt = tokenRequest.bidiGenerateContentSetup.systemInstruction.parts[0].text;
  const sent = JSON.parse(prompt.split('<reading_context>')[1].split('</reading_context>')[0]);
  assert.equal(sent.reading, 'Глава 1\nRytè. Sustójo.');
  assert.equal(sent.selection.text, 'Rytè.');
  assert.equal(sent.selection.translation, 'Утром.');
  assert.equal(sent.selection.note, book.chapters[0].blocks[0].items[0].note);
  assert.doesNotMatch(prompt, /EVIL_PROMPT|EVIL_TEXT|Paslaptìs|Секрет будущего/);
});
