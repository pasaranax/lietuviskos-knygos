const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function harness(allowed = true, options = {}) {
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
  class OfflineAudioContext {
    constructor(channels, length, rate) { this.sampleRate = rate; }
    async decodeAudioData() { return { sampleRate: this.sampleRate, length: 3201, duration: 3201 / this.sampleRate,
      numberOfChannels: 2, getChannelData: channel => new Float32Array(3201).fill(channel ? .4 : .2) }; }
  }
  const ctx = vm.createContext({ fetch: options.fetch || (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })), AbortController,
    window: { AudioContext, OfflineAudioContext, localStorage: options.storage, Telegram: { WebApp: { initData: 'platform', initDataUnsafe: {user:{id:1}}, Serverless: {
    call(name, input, callback) { requests.push({ name, input });
      if(name==='readerCallUsage' && options.usage) { Promise.resolve(options.usage(input)).then(result=>callback(null,result),error=>callback({message:error.message})); return; }
      if(name==='readerBookHistory' && options.history) { Promise.resolve(options.history(input)).then(result=>callback(null,result)); return; }
      callback(null, name === 'readerCallStatus'
      ? { allowed, remainingSeconds: allowed ? 600 : 0, message: 'На сегодня 10 минут закончились.' }
      : name === 'startReaderCall' ? { token: 'auth_tokens/test', callId: 'a'.repeat(32), model: 'test', maxCallSeconds: 600 }
      : { remainingSeconds: 600 }); }
  } } } }, navigator: { mediaDevices: { getUserMedia: async () => { mic++; return { getTracks: () => [{ stop() {} }] }; } } },
    WebSocket: Socket, AudioWorkletNode: Worklet, btoa, atob, setTimeout, clearTimeout, setInterval, clearInterval, DOMException });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../reader-live.js'), 'utf8'), ctx);
  const voice = new ctx.window.ReaderVoice({ onState: s => states.push(s), onError: e => errors.push(e), onPlaySelected: options.onPlaySelected });
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

async function greet(h) {
  await h.voice.start({});
  await h.socket().message({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:Buffer.alloc(4800).toString('base64')}}]},turnComplete:true}});
  h.sources[0].onended();
}
test('reference is heard through the same call, includes its final sample, and mutes then restores the microphone', async () => {
  const h = harness();
  try {
    await greet(h);
    const call = h.voice.call, oldSocket = h.socket();
    const playback = h.voice.playReference('phrase.mp3', { text: 'Lãbas.' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.voice.referencePlaying(), true);
    assert.equal(h.sent.filter(m=>m.realtimeInput?.audio).length, 0, 'recording must not be uploaded ahead of playback');
    const before = h.sent.length;
    const frame = () => call.worklet.port.onmessage({data:new Int16Array(1600).fill(12000).buffer});
    frame(); frame();
    assert.equal(h.sent.length, before, 'speaker echo must not enter the call as learner speech');
    call.audio.currentTime = .1;
    await new Promise(resolve => setTimeout(resolve, 30));
    h.sources[1].onended();
    await playback;
    const records = h.sent.slice(before).filter(m => m.clientContent?.turns[0].parts[0].inlineData);
    assert.ok(records.every(m=>m.clientContent.turnComplete===false));
    const chunks = records.map(m=>Buffer.from(m.clientContent.turns[0].parts[0].inlineData.data,'base64'));
    assert.equal(Buffer.concat(chunks).length, 3201 * 2, 'no clipped partial frame');
    assert.ok(Math.abs(Buffer.concat(chunks).readInt16LE(0) - .3 * 32767) < 2, 'stereo must be mixed to mono');
    assert.match(h.sent.find(m=>m.clientContent?.turns[0].parts[0].text?.startsWith('reference_audio_start')).clientContent.turns[0].parts[0].text, /Lãbas/);
    assert.equal(h.sent.filter(m=>m.clientContent?.turns[0].parts[0].text?.startsWith('reference_audio_end')).length, 1);
    assert.equal(h.voice.call, call); assert.equal(h.socket(), oldSocket); assert.equal(h.voice.active, true);
    assert.equal(h.requests.filter(r=>r.name==='startReaderCall').length, 1);
    call.audio.currentTime = 1;
    frame(); frame();
    assert.ok(h.sent.at(-1).realtimeInput?.audio, 'learner microphone restored');
  } finally { h.voice.stop(); }
});
test('cancelled pending recording cannot start later; cancelling or ending the call stops playback', async () => {
  let resolveFetch;
  const h = harness(true, {fetch: () => new Promise(resolve => { resolveFetch = resolve; })});
  try {
    await greet(h);
    const playback = h.voice.playReference('old.mp3', {text:'Sena.'});
    const rejected = assert.rejects(playback, {name:'AbortError'});
    await new Promise(resolve => setImmediate(resolve));
    h.voice.stopReference();
    resolveFetch({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
    await rejected;
    assert.equal(h.sources.length,1);
    assert.equal(h.voice.referencePlaying(),false);
    assert.equal(h.voice.active,true);
  } finally { h.voice.stop(); }
  const running=harness();
  await greet(running);
  const playback=running.voice.playReference('phrase.mp3',{});
  await new Promise(resolve=>setImmediate(resolve));
  let stopped=false; running.sources[1].stop=()=>{stopped=true;};
  running.voice.stop();
  await assert.rejects(playback,{name:'AbortError'});
  assert.equal(stopped,true); assert.equal(running.voice.referencePlaying(),false);
});
test('reference waits for a completed greeting rather than interrupting its microphone unlock', async () => {
  const h=harness();
  try {
    await h.voice.start({});
    await assert.rejects(h.voice.playReference('phrase.mp3',{}), /приветств/);
    assert.equal(h.voice.active,true);
    assert.equal(h.voice.referencePlaying(),false);
  } finally {h.voice.stop();}
});

test('history tool uses the current book/reading boundary, never model-supplied identity or future summaries', async()=>{
 let complete;
 const h=harness(true,{history:()=>new Promise(resolve=>{complete=resolve;})});
 try {
  await h.voice.start({bookId:'sample',location:{chapter:10,block:0,item:0}});
  await h.socket().message({toolCall:{functionCalls:[{id:'history1',name:'get_book_history',args:{bookId:'other',chapter:99}}]}});
  const request=h.requests.find(r=>r.name==='readerBookHistory');
  assert.equal(request.input.bookId,'sample'); assert.equal(request.input.location.chapter,10);
  h.voice.updateContext({reading:'Antra.'},{chapter:2,block:0,item:0});
  complete({chapters:[{chapter:0,text:'Pradžia.'},{chapter:8,text:'Future after backwards navigation.'}]});
  await new Promise(resolve=>setImmediate(resolve));
  const response=h.sent.find(m=>m.toolResponse).toolResponse.functionResponses[0];
  assert.deepEqual(response.response.chapters,[{chapter:0,text:'Pradžia.'}]);
  assert.equal(response.id,'history1');
 } finally {h.voice.stop();}
});
test('cancelled history calls do not send late tool responses',async()=>{
 let complete;
 const h=harness(true,{history:()=>new Promise(resolve=>{complete=resolve;})});
 try{
  await h.voice.start({bookId:'sample',location:{chapter:3,block:0,item:0}});
  await h.socket().message({toolCall:{functionCalls:[{id:'cancelled',name:'get_book_history'}]}});
  await h.socket().message({toolCallCancellation:{ids:['cancelled']}});
  complete({chapters:[]}); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.sent.some(m=>m.toolResponse),false);
 }finally{h.voice.stop();}
});

test('teacher playback tool calls the current selection callback once and rejects missing selection',async()=>{
 let plays=0;
 const h=harness(true,{onPlaySelected:()=>{plays++;return Promise.resolve();}});
 try{
  await greet(h);
  await h.socket().message({toolCall:{functionCalls:[{id:'play1',name:'play_selected_phrase',args:{url:'https://evil.invalid/clip'}}]}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(plays,1);
  assert.equal(h.sent.find(m=>m.toolResponse)?.toolResponse.functionResponses[0].response.status,'completed');
  h.voice.onPlaySelected=()=>{throw Error('No selection');};
  await h.socket().message({toolCall:{functionCalls:[{id:'play2',name:'play_selected_phrase'}]}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(h.sent.filter(m=>m.toolResponse).at(-1).toolResponse.functionResponses[0].response.error,/фраз/);
 }finally{h.voice.stop();}
});

test('playback tool waits for the recording and cannot trigger an early teacher response',async()=>{
 let finish;
 const h=harness(true,{onPlaySelected:()=>new Promise(resolve=>{finish=resolve;})});
 try{
  await greet(h);
  await h.socket().message({toolCall:{functionCalls:[{id:'play',name:'play_selected_phrase'}]}});
  assert.equal(h.sent.some(m=>m.toolResponse),false);
  finish();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.sent.find(m=>m.toolResponse).toolResponse.functionResponses[0].response.status,'completed');
 }finally{h.voice.stop();}
});

test('history queued behind playback is filtered again after backwards navigation',async()=>{
 let finish;
 const h=harness(true,{history:()=>({chapters:[{chapter:0,text:'Read.'},{chapter:8,text:'Future after navigation.'}]}),onPlaySelected:()=>new Promise(resolve=>{finish=resolve;})});
 try{
  await greet(h);h.voice.call.location={chapter:10,block:0,item:0};
  await h.socket().message({toolCall:{functionCalls:[{id:'history',name:'get_book_history'},{id:'play',name:'play_selected_phrase'}]}});
  await new Promise(resolve=>setImmediate(resolve));
  h.voice.updateContext({reading:'Earlier.'},{chapter:2,block:0,item:0});
  finish();await new Promise(resolve=>setImmediate(resolve));
  const result=h.sent.find(m=>m.toolResponse).toolResponse.functionResponses.find(r=>r.name==='get_book_history');
  assert.deepEqual(result.response.chapters,[{chapter:0,text:'Read.'}]);
 }finally{h.voice.stop();}
});

test('cancelling a queued playback tool prevents its side effect',async()=>{
 let complete,plays=0;
 const h=harness(true,{history:()=>new Promise(resolve=>{complete=resolve;}),onPlaySelected:()=>{plays++;return Promise.resolve();}});
 try{
  await greet(h);
  await h.socket().message({toolCall:{functionCalls:[{id:'history',name:'get_book_history'},{id:'play',name:'play_selected_phrase'}]}});
  await h.socket().message({toolCallCancellation:{ids:['play']}});
  complete({chapters:[]});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(plays,0);
  assert.ok(h.sent.filter(m=>m.toolResponse).every(m=>m.toolResponse.functionResponses.every(r=>r.id!=='play')));
 }finally{h.voice.stop();}
});

test('cancelling a running playback tool aborts its load and prevents late playback',async()=>{
 let completeFetch;
 const h=harness(true,{fetch:()=>new Promise(resolve=>{completeFetch=resolve;})});
 try{
  await greet(h);
  h.voice.onPlaySelected=()=>h.voice.playReference('phrase.mp3',{});
  await h.socket().message({toolCall:{functionCalls:[{id:'play',name:'play_selected_phrase'}]}});
  await new Promise(resolve=>setImmediate(resolve));
  await h.socket().message({toolCallCancellation:{ids:['play']}});
  completeFetch({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.voice.referencePlaying(),false);
  assert.equal(h.sources.length,1);
  assert.equal(h.sent.some(m=>m.toolResponse),false);
  assert.equal(h.voice.active,true);
 }finally{h.voice.stop();}
});

test('playback started by a tool finishes with only its tool response as the next-turn trigger',async()=>{
 const h=harness();
 try{
  await greet(h);
  h.voice.onPlaySelected=()=>h.voice.playReference('phrase.mp3',{});
  await h.socket().message({toolCall:{functionCalls:[{id:'play',name:'play_selected_phrase'}]}});
  await new Promise(resolve=>setImmediate(resolve));
  h.sources[1].onended();await new Promise(resolve=>setImmediate(resolve));
  const end=h.sent.find(m=>m.clientContent?.turns[0].parts[0].text?.startsWith('reference_audio_end'));
  assert.equal(end.clientContent.turnComplete,false);
  assert.equal(h.sent.find(m=>m.toolResponse).toolResponse.functionResponses[0].response.status,'completed');
 }finally{h.voice.stop();}
});

test('usage snapshots survive call end, serialize pending writes and replay from the outbox',async()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
 const writes=[],ack=[];
 const h=harness(true,{storage,usage:input=>{writes.push(input);return new Promise(resolve=>ack.push(resolve));}});
 await h.voice.start({});
 await h.socket().message({usageMetadata:{promptTokenCount:10}});
 await h.socket().message({usageMetadata:{promptTokenCount:20,responseTokenCount:5}});
 assert.equal(writes.length,1);assert.equal(JSON.parse(data.get('readerVoiceUsage.1'))[0].events.length,2);
 h.voice.stop();ack[0]({saved:1});
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(writes.length,2);assert.equal(writes[1].events[0].sequence,2);
 const restarted=harness(true,{storage});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(restarted.requests.some(r=>r.name==='readerCallUsage'));
 ack[1]({saved:1});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(JSON.parse(data.get('readerVoiceUsage.1')),[]);
 restarted.voice.stop();
});
