#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const bookId = process.argv[2];

if (!bookId) {
  console.error("USAGE: node scripts/clean-book-items.js <book-id>");
  process.exit(1);
}

const bookPath = path.join(repoRoot, "books", `${bookId}.json`);
const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));
const fillerNote = "Смотри буквальный перевод фразы выше.";

function isPunctuationOnly(value) {
  return /^[\s\p{P}*]+$/u.test(String(value || ""));
}

function isSectionBreak(value) {
  return /^\s*\*{3,}\s*$/.test(String(value || ""));
}

function appendPunctuation(base, punctuation) {
  const cleanBase = String(base || "").replace(/\s+$/u, "");
  return `${cleanBase}${String(punctuation || "").trim()}`;
}

let clearedNotes = 0;
let mergedPunctuation = 0;
let sectionBreaks = 0;

for (const chapter of book.chapters || []) {
  for (const block of chapter.blocks || []) {
    const cleaned = [];
    for (const item of block.items || []) {
      if (String(item.note || "").trim() === fillerNote) {
        item.note = "";
        clearedNotes++;
      }

      if (!isPunctuationOnly(item.text)) {
        cleaned.push(item);
        continue;
      }

      if (isSectionBreak(item.text)) {
        item.translation = "";
        item.note = "";
        cleaned.push(item);
        sectionBreaks++;
        continue;
      }

      const previous = cleaned[cleaned.length - 1];
      if (previous && !isSectionBreak(previous.text)) {
        previous.text = appendPunctuation(previous.text, item.text);
        if (String(item.translation || "").trim() === String(item.text || "").trim()) {
          previous.translation = appendPunctuation(previous.translation, item.translation);
        }
        mergedPunctuation++;
      } else {
        item.translation = "";
        item.note = "";
        cleaned.push(item);
      }
    }
    block.items = cleaned;
  }
}

fs.writeFileSync(bookPath, `${JSON.stringify(book, null, 2)}\n`, "utf8");
console.log(`OK: clearedNotes=${clearedNotes} mergedPunctuation=${mergedPunctuation} sectionBreaks=${sectionBreaks}`);
