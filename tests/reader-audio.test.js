"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const book = JSON.parse(fs.readFileSync(path.join(root, "books/jusu-iprastas-uzsakymas.json")));

test("every narrated chapter covers its current text and reviewed cast", () => {
  const narrated = book.chapters.filter((chapter) => chapter.audio);
  assert.ok(narrated.length, "the book has no narration");
  for (const [chapterIndex, chapter] of book.chapters.entries()) {
    if (!chapter.audio) continue;
    verifyChapter(chapter, chapterIndex);
  }
});

function verifyChapter(chapter, chapterIndex) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, path.dirname(chapter.audio), "manifest.json")));
  const items = chapter.blocks.flatMap((block, blockIndex) => block.items.map((item) => ({ item, blockIndex })));
  const casting = manifest.casting || { femaleBlocks: chapterIndex === 0 ? [49, 51] : [], narratorSpans: {} };
  assert.equal(manifest.phrases.length, items.length, `missing phrase recordings in chapter ${chapterIndex + 1}`);
  for (const [index, { item, blockIndex }] of items.entries()) {
    const phrase = manifest.phrases[index];
    const plain = item.text.normalize("NFD").replace(/[\u0300\u0301\u0303]/g, "").normalize("NFC");
    assert.equal(phrase.text, plain, `stale audio in chapter ${chapterIndex + 1}, phrase ${index + 1}`);
    assert.equal(phrase.voice, casting.femaleBlocks.includes(blockIndex + 1) ? "lt-LT-OnaNeural" : "lt-LT-LeonasNeural");
    if (phrase.segments) {
      assert.equal(phrase.segments.map((segment) => segment.text).join(""), phrase.text);
      assert.ok(phrase.segments.some((segment) => segment.voice === "lt-LT-LeonasNeural"));
    }
    assert.equal(item.audio, phrase.audio);
    assert.ok(phrase.end > phrase.start, "empty audio segment");
    assert.ok(phrase.end <= manifest.duration, "segment exceeds chapter duration");
    if (index) assert.equal(phrase.start, manifest.phrases[index - 1].end, "gap in phrase coverage");
  }
  for (const src of [chapter.audio, ...items.map(({ item }) => item.audio)]) {
    assert.match(src, new RegExp(`^assets/audio/jusu-iprastas-uzsakymas/chapter-${chapterIndex + 1}/[^/]+\\.mp3$`));
    assert.ok(fs.statSync(path.join(root, src)).size > 1000, `empty recording: ${src}`);
  }
}
