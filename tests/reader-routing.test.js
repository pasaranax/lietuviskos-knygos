"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../reader.js"), "utf8");

test("a missing or empty book parameter returns to the shelf", () => {
  const startup = source.slice(0, source.indexOf("  var storagePrefix")) + "})();";
  for (const search of ["", "?book="]) {
    const destinations = [];
    vm.runInNewContext(startup, {
      URLSearchParams,
      window: { location: { search, replace: (url) => destinations.push(url) } }
    });
    assert.deepEqual(destinations, ["index.html"]);
  }
});

test("an explicit book parameter proceeds without redirecting", () => {
  const startup = source.slice(0, source.indexOf("  var storagePrefix")) + "})();";
  vm.runInNewContext(startup, {
    URLSearchParams,
    window: { location: { search: "?book=jusu-iprastas-uzsakymas", replace: () => assert.fail("unexpected redirect") } }
  });
});

test("a book not found returns to the shelf; existing books still load", async () => {
  const loader = source.slice(source.indexOf("  function loadBook()"), source.indexOf("  function renderBook("));
  for (const status of [404, 200, 500]) {
    const destinations = [];
    const rendered = [];
    const errors = [];
    const book = { title: "Test book", chapters: [] };
    const context = vm.createContext({
      bookId: "requested-book", state: {},
      window: { location: { replace: (url) => destinations.push(url) }, ReaderProfile: { enabled: false } },
      document: { createElement: () => ({}) },
      content: { append: (error) => errors.push(error) },
      fetch: async () => ({ ok: status === 200, status, json: async () => book }),
      renderBook: (value) => rendered.push(value),
      restorePosition() {}, updateProgressAndChapter() {}, loadChapterTimelines() {}
    });
    vm.runInContext(loader + "\nloadBook();", context);
    await new Promise(setImmediate);
    assert.deepEqual(destinations, status === 404 ? ["index.html"] : []);
    assert.deepEqual(rendered, status === 200 ? [book] : []);
    assert.equal(errors.length, status === 500 ? 1 : 0);
  }
});
