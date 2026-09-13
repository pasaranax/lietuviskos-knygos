"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../reader.js"), "utf8");
const helper = source.slice(
  source.indexOf("  function findChapterAtMarker("),
  source.indexOf("  function updateProgressAndChapter()")
);

function loadHelpers() {
  const context = vm.createContext({});
  vm.runInContext(
    `${helper}\n` +
    "this.findChapterAtMarker = findChapterAtMarker;\n" +
    "this.getChapterPercentAtMarker = typeof getChapterPercentAtMarker === 'function' ? getChapterPercentAtMarker : undefined;",
    context
  );
  return context;
}

test("chapter changes when its heading crosses the viewport center", () => {
  const chapters = [-900, 350, 900].map((top, index) => ({
    id: `chapter-${index + 1}`,
    getBoundingClientRect() { return { top }; }
  }));
  const context = loadHelpers();

  assert.equal(context.findChapterAtMarker(chapters, 300).id, "chapter-1");
  assert.equal(context.findChapterAtMarker(chapters, 400).id, "chapter-2");
});

test("chapter progress uses the same center marker as chapter selection", () => {
  const chapters = [-600, 420, 1300].map((top, index) => ({
    id: `chapter-${index + 1}`,
    getBoundingClientRect() { return { top }; }
  }));
  const context = loadHelpers();

  assert.equal(typeof context.getChapterPercentAtMarker, "function");
  assert.equal(context.getChapterPercentAtMarker(chapters, chapters[0], 400, 1800), 98);
  assert.equal(context.getChapterPercentAtMarker(chapters, chapters[1], 421, 1800), 0);
});
