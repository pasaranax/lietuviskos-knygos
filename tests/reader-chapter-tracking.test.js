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

test("chapter changes when its heading crosses the viewport center", () => {
  const chapters = [-900, 350, 900].map((top, index) => ({
    id: `chapter-${index + 1}`,
    getBoundingClientRect() { return { top }; }
  }));
  const context = vm.createContext({});
  vm.runInContext(`${helper}\nthis.findChapterAtMarker = findChapterAtMarker;`, context);

  assert.equal(context.findChapterAtMarker(chapters, 300).id, "chapter-1");
  assert.equal(context.findChapterAtMarker(chapters, 400).id, "chapter-2");
});
