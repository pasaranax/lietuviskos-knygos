"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../reader.js"), "utf8");
// Exercise the real playback handlers without a browser or audible media.
const handlers = source.slice(source.indexOf("  function playChapterAudio()"), source.indexOf("  function syncChapterPhrase()"));

function player({ metadata = true } = {}) {
  const phrase = { classList: { remove() {} } };
  const audio = {
    paused: true, ended: false, currentTime: 0, readyState: metadata ? 1 : 0,
    error: null, loads: 0,
    set src(value) { this.source = value; this.loads++; this.error = null; },
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    removeAttribute() { this.source = null; },
    load() { this.currentTime = 0; }
  };
  const state = {
    book: { chapters: [{ id: "one", audio: "one.mp3" }, { id: "two" }] },
    chapterTimelines: { one: [{ start: 390.025, end: 396.0375, phrase }] },
    audioChapterId: null, activePhrase: null, pendingSeek: null, readingPhrase: null
  };
  const context = vm.createContext({
    state, chapterAudio: audio, chapterSelect: { value: "one" },
    chapterAudioError: { hidden: true },
    hideTooltip() { state.activePhrase = null; },
    updateChapterAudioButton() {}
  });
  vm.runInContext(handlers, context);
  return { context, state, audio, phrase, play: () => context.playChapterAudio() };
}

test("chapter playback starts at the selected phrase, before hiding its tooltip", () => {
  const p = player();
  p.state.activePhrase = p.phrase;
  p.play();
  assert.equal(p.audio.currentTime, 390.025);
  assert.equal(p.audio.source, "one.mp3");
  assert.equal(p.audio.paused, false);
  assert.equal(p.state.activePhrase, null);
});

test("pause and resume preserve a selected start while metadata is still loading", () => {
  const p = player({ metadata: false });
  p.state.activePhrase = p.phrase;
  p.play();
  p.play();
  assert.equal(p.audio.paused, true);
  p.play();
  assert.equal(p.state.pendingSeek, 390.025);
  assert.equal(p.audio.loads, 1);
});

test("resume preserves playback position and a new selection overrides it", () => {
  const p = player();
  p.play();
  assert.equal(p.audio.currentTime, 0);
  p.audio.currentTime = 42;
  p.play();
  p.play();
  assert.equal(p.audio.currentTime, 42);
  p.play();
  p.state.activePhrase = p.phrase;
  p.play();
  assert.equal(p.audio.currentTime, 390.025);
});

test("retry after a media error reloads the audio source", () => {
  const p = player();
  p.play();
  p.audio.error = { code: 2 };
  p.context.showChapterAudioError();
  assert.equal(p.context.chapterAudioError.hidden, false);
  p.play();
  assert.equal(p.audio.loads, 2);
  assert.equal(p.context.chapterAudioError.hidden, true);
});

test("changing chapter cancels pending playback and chapters without audio cannot start it", () => {
  const p = player({ metadata: false });
  p.state.activePhrase = p.phrase;
  p.play();
  p.context.stopChapterAudio();
  assert.equal(p.audio.paused, true);
  assert.equal(p.audio.source, null);
  assert.equal(p.state.pendingSeek, null);
  p.context.chapterSelect.value = "two";
  p.play();
  assert.equal(p.audio.paused, true);
});
