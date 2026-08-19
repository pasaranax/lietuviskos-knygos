"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function bookItems() {
  const book = JSON.parse(read("books/jokiu-orchideju.json"));
  return book.chapters.flatMap((chapter) =>
    chapter.blocks.flatMap((block) => block.items)
  );
}

function cssRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(escaped + "\\s*\\{([^}]+)\\}"));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test("the first 100 phrases use one grammatical dictionary entry per line", () => {
  const items = bookItems();
  assert.ok(items.length >= 100);

  items.slice(0, 100).forEach((item, index) => {
    const lines = String(item.note || "").split("\n").filter(Boolean);
    assert.ok(lines.length > 0, `phrase ${index + 1} has no dictionary entries`);
    lines.forEach((line) => {
      assert.match(
        line,
        /^\*\*[^*]+\*\* — .+; .+\.$/u,
        `phrase ${index + 1} has an invalid dictionary line: ${line}`
      );
    });
  });
});

test("the tooltip places the dictionary before a smaller plain translation", () => {
  const html = read("reader.html");
  const css = read("reader.css");
  const notePosition = html.indexOf('id="tooltipNote"');
  const translationPosition = html.indexOf('id="tooltipTranslation"');

  assert.ok(notePosition >= 0 && translationPosition >= 0);
  assert.ok(notePosition < translationPosition, "dictionary must precede translation");

  const noteRule = cssRule(css, ".tooltip-note");
  const translationRule = cssRule(css, ".tooltip-translation");
  const noteSize = Number(noteRule.match(/font-size:\s*(\d+)px/)[1]);
  const translationSize = Number(translationRule.match(/font-size:\s*(\d+)px/)[1]);

  assert.match(noteRule, /white-space:\s*pre-line/);
  assert.ok(translationSize < noteSize, "translation must be smaller than dictionary text");
  assert.match(translationRule, /font-weight:\s*400/);
});

test("the shelf renders each book as one link without separate actions", () => {
  const script = read("index.js");
  assert.doesNotMatch(script, /book-actions|book-action|book\.downloads/);
});

test("the retired export has no artifact, generator, catalog field, or guide section", () => {
  const exportName = String.fromCharCode(102, 98, 50);
  const catalog = JSON.parse(read("books/catalog.json"));

  assert.equal(fs.existsSync(path.join(repoRoot, exportName)), false);
  assert.equal(fs.existsSync(path.join(repoRoot, "scripts", "build-book.js")), false);
  catalog.books.forEach((book) => assert.equal(Object.hasOwn(book, "downloads"), false));
  assert.doesNotMatch(read("AGENTS.md"), new RegExp(exportName, "i"));
});
