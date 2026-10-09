const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function harness(allowed = true) {
  const sent = [], requests = [], states = [], errors = [], sources = [];
  let mic = 0, socket;
  const node = () => ({ connect() {}, disconnect() {} });
  class AudioContext {
    constructor() { this.currentTime = 0; this.state = 'running'; this.audioWorklet = { addModule: async () => {} }; }
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() { return { ...node(), gain: {} }; }
    createMediaStreamSource() { return node(); }
    createBuffer(channels, length, rate) { return { duration: length / rate, copyToChannel() {} }; }
    createBufferSource() { const source = { ...node(), start() {}, stop() {} }; sources.push(source); return source; }
  }
  class Worklet { constructor() { Object.assign(this, node()); this.port = {}; } }
  class Socket {
    constructor() { socket = this; this.readyState = 1; setImmediate(() => this.onopen()); }
    send(json) { const data = JSON.parse(json); sent.push(data); if (data.setup) setImmediate(() => this.message({ setupComplete: {} })); }
    message(data) { return this.onmessage({ data: JSON.stringify(data) }); }
    close() { this.readyState = 3; }
  }
  const ctx = vm.createContext({ window: { AudioContext, Telegram: { WebApp: { initData: 'platform', Serverless: {
    call(name, input, callback) { requests.push({ name, input }); callback(null, name === 'readerCallStatus'
      ? { allowed, remainingSeconds: allowed ? 600 : 0, message: 'На сегодня 10 минут закончились.' }
      : name === 'startReaderCall' ? { token: 'auth_tokens/test', callId: 'a'.repeat(32), model: 'test', maxCallSeconds: 600 }
      : { remainingSeconds: 600 }); }
  } } } }, navigator: { mediaDevices: { getUserMedia: async () => { mic++; return { getTracks: () => [{ stop() {} }] }; } } },
    WebSocket: Socket, AudioWorkletNode: Worklet, btoa, atob, setTimeout, clearTimeout, setInterval, clearInterval, DOMException });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../reader-live.js'), 'utf8'), ctx);
  const voice = new ctx.window.ReaderVoice({ onState: s => states.push(s), onError: e => errors.push(e) });
  return { voice, sent, requests, states, errors, sources, mic: () => mic, socket: () => socket };
}
test('exhausted allowance shows message without microphone, Gemini connection or active circle', async () => {
  const h = harness(false);
  try {
    await h.voice.start({});
    assert.equal(h.mic(), 0);
    assert.equal(h.socket(), undefined);
    assert.deepEqual(h.requests.map(r => r.name), ['readerCallStatus']);
    assert.deepEqual(h.states.filter(s => s !== 'idle'), []);
    assert.match(h.errors[0], /10 минут/);
  } finally { h.voice.stop(); }
});
test('greeting echo stays silent until turn complete and playback ends, then speech onset passes but isolated noise does not', async () => {
  const h = harness();
  try {
    await h.voice.start({});
    const frame = rms => h.voice.call.worklet.port.onmessage({ data: new Int16Array(1600).fill(rms * 32768).buffer });
    const speech = () => h.sent.filter(m => m.realtimeInput?.audio).some(m => Buffer.from(m.realtimeInput.audio.data, 'base64').some(b => b));
    frame(.1); frame(.1);
    assert.equal(speech(), false, 'raw mic must not echo the greeting');
    await h.socket().message({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: Buffer.alloc(4800).toString('base64') } }] }, turnComplete: true } });
    frame(.1); frame(.1);
    assert.equal(speech(), false, 'server completion must wait for local playback');
    h.sources[0].onended();
    frame(.002); frame(.1); frame(0); frame(.002);
    assert.equal(speech(), false, 'one click and quiet background are not a user turn');
    frame(.1); frame(.1);
    assert.equal(speech(), true, 'actual speech must pass after the greeting');
    assert.equal(h.sent.filter(m => m.clientContent?.turnComplete === true).length, 1);
  } finally { h.voice.stop(); }
});
test('changing phrase during greeting queues latest context and does not strand the microphone gate', async () => {
  const h = harness();
  try {
    await h.voice.start({});
    await h.socket().message({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:Buffer.alloc(4800).toString('base64')}}]},turnComplete:true}});
    h.voice.updateContext({reading:'Pirma.'}); h.voice.updateContext({reading:'Antra.'});
    assert.equal(h.sent.filter(m=>m.clientContent?.turnComplete===false).length,0);
    h.sources[0].onended();
    assert.equal(h.voice.call.greetingDone,true);
    const updates=h.sent.filter(m=>m.clientContent?.turnComplete===false);
    assert.equal(updates.length,1); assert.match(updates[0].clientContent.turns[0].parts[0].text,/Antra/);
  } finally { h.voice.stop(); }
});
