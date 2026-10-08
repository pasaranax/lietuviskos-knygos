"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const book = JSON.parse(fs.readFileSync(path.join(root, "books/keliaujanti-biblioteka.json")));

test("traveling-library fragment boundaries follow the declared segmentation", () => {
  for (const chapter of book.chapters) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, path.dirname(chapter.audio), "manifest.json")));
    if (manifest.audioSegmentation === "semantic-fragments") {
      assert.equal(manifest.waveformBoundaries.length, manifest.phrases.length - 1);
      for (const [index, boundary] of manifest.waveformBoundaries.entries()) {
        assert.equal(boundary.cutFrame, manifest.phrases[index].endFrame);
        assert.equal(boundary.cutFrame, manifest.phrases[index + 1].startFrame);
        assert.ok(boundary.method.includes("quiet") || boundary.method.includes("waveform"));
        if (boundary.sourcePause) {
          const run = manifest.voiceRuns.find(run => boundary.cutFrame > run.startFrame && boundary.cutFrame < run.startFrame + run.frameCount);
          assert.ok(run, "semantic cut must belong to a recording");
          const sourceFrame = run.sourceStartFrame + boundary.cutFrame - run.startFrame;
          assert.ok(boundary.sourcePause[0] <= sourceFrame && sourceFrame <= boundary.sourcePause[1], "semantic cut must be inside verified quiet");
        }
      }
      continue;
    }
    for (const block of chapter.blocks) {
      for (const item of block.items.slice(0, -1)) {
        assert.match(item.text.trim(), /[.!?,;:—][»“”"]*$/, `${chapter.id}: unsafe cut after ${item.text}`);
      }
    }
  }
});

test("short sentences keep their own audio instead of inheriting the next sentence", () => {
  for (const chapter of book.chapters) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, path.dirname(chapter.audio), "manifest.json")));
    if (manifest.audioSegmentation === "semantic-fragments") continue;
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
    const allItems = chapter.blocks.flatMap(block => block.items);
    const sceneBreaks = allItems.filter(item => item.text === "* * *");
    for (const item of sceneBreaks) assert.ok(!item.audio, `${chapter.id}: narrated scene separator`);
    const items = allItems.filter(item => item.text !== "* * *");
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
      if (manifest.audioSegmentation === "semantic-fragments") {
        assert.deepEqual(phrase.words.map(word => word.word.toLowerCase()), phrase.text.toLowerCase().match(/[\p{L}\p{N}]+/gu));
        for (const word of phrase.words) {
          assert.ok(phrase.startFrame <= word.startFrame && word.startFrame < word.endFrame && word.endFrame <= phrase.endFrame);
        }
      }
      frame = phrase.endFrame;
    }
    assert.equal(frame, manifest.frameCount);
  }
});
