"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../reader.js"), "utf8");
const context = vm.createContext({});
const start = source.indexOf("  function interpolateScrollPosition(");
if (start >= 0) vm.runInContext(source.slice(start, source.indexOf("  function positionTooltip(", start)), context);

function tracking() {
  assert.equal(typeof context.getScrollTarget, "function", "continuous audio scroll is missing");
  assert.equal(typeof context.advanceScroll, "function");
  return context;
}

const track = [{time: 0, position: 0}, {time: 4, position: 0}, {time: 8, position: 120}, {time: 12, position: 150}, {time: 20, position: 300}];

test("scroll position and speed stay continuous at phrase boundaries", () => {
  const {getScrollTarget} = tracking();
  for (const point of track.slice(1, -1)) {
    const before = getScrollTarget(track, point.time - 0.001);
    const after = getScrollTarget(track, point.time + 0.001);
    assert.ok(Math.abs(after.position - before.position) < 0.1);
    assert.ok(Math.abs(after.velocity - before.velocity) < 0.1);
  }
  assert.ok(getScrollTarget(track, 3).velocity > 0, "motion starts before the next phrase boundary");
});

test("uniform narration produces uniform scrolling", () => {
  const {getScrollTarget, advanceScroll} = tracking();
  const uniform = [{time: 0, position: 0}, {time: 60, position: 900}];
  let motion = {position: 150, velocity: 15};
  for (let frame = 1; frame <= 600; frame++) {
    const time = 10 + frame / 60;
    motion = advanceScroll(motion.position, motion.velocity, getScrollTarget(uniform, time), 1 / 60);
  }
  assert.ok(Math.abs(motion.position - 300) < 1);
  assert.ok(Math.abs(motion.velocity - 15) < 0.1);
});

test("sync drift changes speed gradually without jumping or scrolling backwards", () => {
  const {advanceScroll} = tracking();
  for (const offset of [-40, 40]) {
    let motion = {position: 150 + offset, velocity: 15};
    for (let frame = 1; frame <= 600; frame++) {
      const target = {position: 150 + frame / 4, velocity: 15};
      const next = advanceScroll(motion.position, motion.velocity, target, 1 / 60);
      assert.ok(next.position >= motion.position);
      assert.ok(Math.abs(next.velocity - motion.velocity) < 1.5);
      assert.ok(next.position - motion.position < 1);
      motion = next;
    }
    assert.ok(Math.abs(motion.position - 300) < 1, `drift did not converge: ${motion.position}`);
  }
});

test("the target remains inside the chapter at its beginning and end", () => {
  const {getScrollTarget} = tracking();
  assert.equal(getScrollTarget(track, -10).position, 0);
  assert.equal(getScrollTarget(track, 30).position, 300);
  assert.equal(getScrollTarget(track, 30).velocity, 0);
});

test("scrolling stops while audio is buffering after a seek", () => {
  let y = 150;
  let scheduled = 0;
  const lifecycle = vm.createContext({
    state: {
      scrollFrame: 1, scrollLastTime: 0, scrollPosition: 150, scrollVelocity: 15,
      scrollTrack: [{time: 0, position: 0}, {time: 60, position: 900}]
    },
    chapterAudio: {paused: false, ended: false, seeking: false, readyState: 2, currentTime: 10},
    document: {documentElement: {scrollHeight: 2000}},
    window: {
      get scrollY() {return y;}, innerHeight: 600,
      scrollTo(x, top) {y = top;},
      requestAnimationFrame() {scheduled++; return 2;},
      cancelAnimationFrame() {}
    }
  });
  vm.runInContext(source.slice(source.indexOf("  function buildScrollTrack()"), source.indexOf("  function positionTooltip(")), lifecycle);
  lifecycle.scrollChapterFrame(1000 / 60);
  assert.equal(y, 150, "buffering audio must not advance the text");
  assert.equal(scheduled, 0);
});

test("a layout change keeps the narrated phrase visible even when it moves far upwards", () => {
  let y = 1000;
  const lifecycle = vm.createContext({
    state: {
      scrollFrame: 1, scrollLastTime: 0, scrollPosition: 1000, scrollVelocity: 15, scrollTrack: null,
      audioChapterId: "one", chapterTimelines: {one: [{start: 8, end: 12, phrase: {}}]}
    },
    chapterAudio: {paused: false, ended: false, seeking: false, readyState: 4, currentTime: 10},
    getViewport() {return {top: 0, height: 600};},
    getPhraseRect() {return {top: -400, height: 20};},
    document: {documentElement: {scrollHeight: 2000}},
    window: {
      get scrollY() {return y;}, innerHeight: 600,
      matchMedia() {return {matches: false};},
      scrollTo(x, top) {y = top;},
      requestAnimationFrame() {return 2;}, cancelAnimationFrame() {}
    }
  });
  vm.runInContext(source.slice(source.indexOf("  function buildScrollTrack()"), source.indexOf("  function positionTooltip(")), lifecycle);
  lifecycle.scrollChapterFrame(1000 / 60);
  assert.ok(Math.abs(y - 310) < 300, "the narrated phrase stayed above the viewport after reflow");
});
