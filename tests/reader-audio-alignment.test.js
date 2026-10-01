"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const book = JSON.parse(fs.readFileSync(path.join(root, "books/keliaujanti-biblioteka.json")));

test("traveling-library audio is never cut at a bare space", () => {
  for (const chapter of book.chapters) {
    for (const block of chapter.blocks) {
      for (const item of block.items.slice(0, -1)) {
        assert.match(item.text.trim(), /[.!?,;:—][»“”"]*$/, `${chapter.id}: unsafe cut after ${item.text}`);
      }
    }
  }
});

test("short sentences keep their own audio instead of inheriting the next sentence", () => {
  for (const chapter of book.chapters) {
    for (const block of chapter.blocks) {
      for (const item of block.items) {
        const endings = Array.from(item.text.matchAll(/[.!?]+[»“”"]*(?=\s|$)/g));
        assert.ok(!endings.length || endings[0].index + endings[0][0].length === item.text.length,
          `${chapter.id}: joined sentences in ${item.text}`);
      }
    }
  }
});

test("traveling-library clips contain complete speech on the joined PCM timeline", () => {
  for (const chapter of book.chapters) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, path.dirname(chapter.audio), "manifest.json")));
    assert.ok(manifest.voiceRuns?.length, `${chapter.id}: missing recording lengths`);
    let frame = 0;
    for (const run of manifest.voiceRuns) {
      assert.equal(run.startFrame, frame);
      assert.ok(run.frameCount > 0);
      frame += run.frameCount;
    }
    assert.equal(frame, manifest.frameCount);
    assert.equal(manifest.duration, frame / manifest.sampleRate);
    const items = chapter.blocks.flatMap(block => block.items);
    assert.equal(manifest.phrases.length, items.length);
    frame = 0;
    for (const [index, phrase] of manifest.phrases.entries()) {
      assert.equal(phrase.startFrame, frame);
      assert.ok(phrase.endFrame > frame);
      assert.ok(phrase.startFrame <= phrase.speechStartFrame, `${chapter.id}: clipped first word`);
      assert.ok(phrase.speechEndFrame <= phrase.endFrame, `${chapter.id}: clipped last word`);
      assert.ok(phrase.speechStartFrame < phrase.speechEndFrame);
      assert.equal(phrase.start, phrase.startFrame / manifest.sampleRate);
      assert.equal(phrase.end, phrase.endFrame / manifest.sampleRate);
      assert.equal(phrase.text, items[index].text.normalize("NFD").replace(/[\u0300\u0301\u0303]/g, "").normalize("NFC"));
      assert.equal(phrase.audio, items[index].audio);
      frame = phrase.endFrame;
    }
    assert.equal(frame, manifest.frameCount);
  }
});
