const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('reader.js', 'utf8');
const handlers = source.slice(source.indexOf('  function resetAudioButton()'), source.indexOf('  function formatChapterDuration'));
function fixture(active) {
  let resolve, reject, stops = 0, plays = 0;
  const state = {activeData:{audio:'phrase.mp3',text:'Lãbas.'}};
  const button = {pressed:'false',setAttribute(name,value){this.pressed=value;}};
  const audio = {paused:true, pause(){this.paused=true;}, hasAttribute(){return !!this.src;}, removeAttribute(){this.src=null;}, load(){},
    play(){plays++;this.paused=false;return Promise.resolve();}};
  const voice = {active, stopReference(){stops++;if(reject)reject(new DOMException('Cancelled','AbortError'));},
    playReference(url,phrase){this.url=url;this.phrase=phrase;return new Promise((r,j)=>{resolve=r;reject=j;});}};
  const error={hidden:true};
  const ctx=vm.createContext({state,voice,phraseAudio:audio,tooltipAudioButton:button,tooltipAudioError:error,positionTooltip(){},
    window:{clearTimeout},document:{querySelectorAll:()=>[audio]}});
  vm.runInContext(handlers,ctx);
  return {ctx,state,voice,button,audio,error,resolve:()=>resolve(),stops:()=>stops,plays:()=>plays};
}
test('Прослушать uses the live reference path and finishes without HTML audio or call stop', async()=>{
  const h=fixture(true);
  h.ctx.playPhraseAudio();
  assert.equal(h.voice.url,'phrase.mp3'); assert.equal(h.voice.phrase.text,'Lãbas.');
  assert.equal(h.plays(),0); assert.equal(h.button.pressed,'true');
  h.resolve(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.button.pressed,'false'); assert.equal(h.voice.active,true);
});
test('repeat click cancels reference and a late completion cannot reset a newer recording', async()=>{
  const h=fixture(true);
  h.ctx.playPhraseAudio();
  h.ctx.playPhraseAudio();
  assert.equal(h.stops(),1); assert.equal(h.button.pressed,'false');
  h.ctx.playPhraseAudio();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.button.pressed,'true'); assert.equal(h.error.hidden,true);
  h.resolve(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.button.pressed,'false');
});
test('outside a call the same button keeps normal phrase playback and cancellation',()=>{
  const h=fixture(false);
  h.ctx.playPhraseAudio(); assert.equal(h.plays(),1); assert.equal(h.audio.src,'phrase.mp3');
  h.ctx.playPhraseAudio(); assert.equal(h.audio.paused,true); assert.equal(h.audio.src,null);
});
