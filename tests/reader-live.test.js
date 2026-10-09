const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const filename = require('node:path').join(__dirname, '../reader-live.js');

test('stopping while microphone permission is pending stops late tracks and creates no token', async () => {
  let permit, stopped = 0, requests = 0;
  const states = [];
  class AudioContext {
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const context = vm.createContext({
    window: { AudioContext, Telegram: { WebApp: { initData: 'verified by platform', Serverless: { call(name, input, callback) { if (name === 'readerCallStatus') callback(null, { allowed: true }); else requests++; } } } } },
    navigator: { mediaDevices: { getUserMedia: () => new Promise(resolve => { permit = resolve; }) } },
    setTimeout, clearTimeout, setInterval, clearInterval, DOMException, btoa, atob,
  });
  if (fs.existsSync(filename)) vm.runInContext(fs.readFileSync(filename, 'utf8'), context);
  assert.equal(typeof context.window.ReaderVoice, 'function');
  const voice = new context.window.ReaderVoice({ onState: state => states.push(state) });
  const start = voice.start({ bookId: 'book', location: { chapter: 0, block: 0, item: 0 } });
  await new Promise(setImmediate);
  voice.stop();
  permit({ getTracks: () => [{ stop: () => { stopped++; } }] });
  await start;
  assert.equal(stopped, 1);
  assert.equal(requests, 0);
  assert.equal(voice.active, false);
  assert.equal(states.at(-1), 'idle');
});

test('phrase switches reuse the session, pass a silent context update and stopping releases audio', async () => {
  let microphoneStops = 0, audioClosed = 0;
  const requests = [], sent = [];
  const node = () => ({ connect() {}, disconnect() {} });
  class AudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.audioWorklet = { addModule: async () => {} }; }
    resume() { return Promise.resolve(); }
    close() { audioClosed++; this.state = 'closed'; return Promise.resolve(); }
    createMediaStreamSource() { return node(); }
    createGain() { return { ...node(), gain: {} }; }
  }
  class AudioWorkletNode { constructor() { Object.assign(this, node()); this.port = {}; } }
  class Socket {
    constructor() { this.readyState = 1; setImmediate(() => this.onopen()); }
    send(text) {
      const data = JSON.parse(text); sent.push(data);
      if (data.setup) setImmediate(() => this.onmessage({ data: JSON.stringify({ setupComplete: {} }) }));
    }
    close() { this.readyState = 3; }
  }
  const context = vm.createContext({
    window: { AudioContext, Telegram: { WebApp: { initData: 'platform-auth', Serverless: {
      call(name, input, callback) {
        requests.push({ name, input });
        callback(null, name === 'readerCallStatus' ? { allowed: true } : name === 'startReaderCall' ? {
          token: 'auth_tokens/test', callId: 'a'.repeat(32), model: 'model', maxCallSeconds: 600
        } : { remainingSeconds: 600 });
      }
    } } } },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => microphoneStops++ }] }) } },
    AudioWorkletNode, WebSocket: Socket, setTimeout, clearTimeout, setInterval, clearInterval, DOMException, btoa, atob,
  });
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context);
  const voice = new context.window.ReaderVoice({});
  await voice.start({ bookId: 'book', location: { chapter: 0, block: 0, item: 0 } });
  // This test switches context after the opening greeting has finished.
  voice.call.greetingDone = true;
  voice.updateContext({ reading: 'Lietuvių tekstas.', selection: { text: 'Kita frazė.', translation: 'Другая фраза.', note: 'Разбор' } });
  const update = sent.find(data => data.clientContent?.turnComplete === false);
  assert.ok(update.clientContent.turns[0].parts[0].text.includes('Kita frazė.'));
  assert.ok(update.clientContent.turns[0].parts[0].text.includes('Разбор'));
  assert.equal(requests.filter(request => request.name === 'startReaderCall').length, 1);
  assert.equal(voice.active, true);
  voice.stop();
  assert.equal(microphoneStops, 1);
  assert.equal(audioClosed, 1);
  assert.ok(requests.some(request => request.name === 'readerCallTime' && request.input.action === 'end'));
});

test('circle contracts for user audio, expands for assistant audio and returns to rest on silence', () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(filename, 'utf8'), ctx);
  const states = [], levels = [];
  const voice = new ctx.window.ReaderVoice({ onState: s => states.push(s), onLevel: (level, speaker) => levels.push({ level, speaker }) });
  const call = { ready: true, closed: false };
  voice.meterActivity(call, 0, .05);
  assert.equal(states.at(-1), 'speaking'); assert.equal(levels.at(-1).speaker, 'assistant');
  voice.meterActivity(call, .1, .05);
  assert.equal(states.at(-1), 'user-speaking'); assert.equal(levels.at(-1).speaker, 'user');
  voice.meterActivity(call, 0, 0);
  assert.equal(states.at(-1), 'listening'); assert.equal(levels.at(-1).level, 0);
  call.closed = true;
  const count = states.length; voice.meterActivity(call, .1, .1); assert.equal(states.length, count);
});

test('connected and ended cues use opposite soft note sequences', () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(filename, 'utf8'), ctx);
  const voice = new ctx.window.ReaderVoice({}), notes = [];
  const audio = { state: 'running', currentTime: 1, destination: {},
    createOscillator() { const oscillator = { frequency: {}, connect() {}, disconnect() {}, start() { notes.push(oscillator.frequency.value); }, stop() {} }; return oscillator; },
    createGain: () => ({ connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } })
  };
  assert.equal(voice.cue('start', audio), 320); assert.deepEqual(notes, [523.25, 783.99]);
  notes.length = 0; voice.cue('end', audio); assert.deepEqual(notes, [783.99, 523.25]);
});
