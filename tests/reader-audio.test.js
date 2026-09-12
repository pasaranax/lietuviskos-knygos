"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const book = JSON.parse(fs.readFileSync(path.join(root, "books/jusu-iprastas-uzsakymas.json")));

test("chapter one audio covers the current text and the requested voices", () => {
  const chapter = book.chapters[0];
  assert.ok(chapter.audio, "chapter one has no recording");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, path.dirname(chapter.audio), "manifest.json")));
  const items = chapter.blocks.flatMap((block, blockIndex) => block.items.map((item) => ({ item, blockIndex })));
  assert.equal(manifest.phrases.length, items.length, "missing phrase recordings");
  for (const [index, { item, blockIndex }] of items.entries()) {
    const phrase = manifest.phrases[index];
    const plain = item.text.normalize("NFD").replace(/[\u0300\u0301\u0303]/g, "").normalize("NFC");
    assert.equal(phrase.text, plain, `stale audio at phrase ${index + 1}`);
    assert.equal(phrase.voice, [48, 50].includes(blockIndex) ? "lt-LT-OnaNeural" : "lt-LT-LeonasNeural");
    assert.equal(item.audio, phrase.audio);
    assert.ok(phrase.end > phrase.start, "empty audio segment");
    assert.ok(phrase.end <= manifest.duration, "segment exceeds chapter duration");
    if (index) assert.equal(phrase.start, manifest.phrases[index - 1].end, "gap in phrase coverage");
  }
  for (const src of [chapter.audio, ...items.map(({ item }) => item.audio)]) {
    assert.match(src, /^assets\/audio\/jusu-iprastas-uzsakymas\/chapter-1\/[^/]+\.mp3$/);
    assert.ok(fs.statSync(path.join(root, src)).size > 1000, `empty recording: ${src}`);
  }
});
