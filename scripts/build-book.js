#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const bookId = process.argv[2] || "jokiu-orchideju";
const bookPath = path.join(repoRoot, "books", `${bookId}.json`);
const outDir = path.join(repoRoot, "fb2");
const zipPath = path.join(outDir, `${bookId}.fb2.zip`);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${bookId}-fb2-`));
const fb2Path = path.join(tempDir, `${bookId}.fb2`);

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textWithLineBreaks(value) {
  return escapeXml(value).replace(/\n/g, "<br/>");
}

function richXml(value) {
  return String(value || "")
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return `<strong>${escapeXml(part.slice(2, -2))}</strong>`;
      }
      return escapeXml(part);
    })
    .join("")
    .replace(/\n/g, "<br/>");
}

function hasTooltip(item) {
  if (!item) return false;
  if (/^[\s\p{P}*]+$/u.test(String(item.text || ""))) return false;
  return Boolean(String(item.translation || "").trim() || String(item.note || "").trim());
}

function paragraphXml(items, noteStart) {
  let noteId = noteStart;
  const noteItems = [];
  const body = items.map((item) => {
    if (!hasTooltip(item)) return textWithLineBreaks(item.text);
    const currentId = `note-${noteId++}`;
    noteItems.push({ id: currentId, item });
    return `${textWithLineBreaks(item.text)}<a l:href="#${currentId}" type="note">&#160;💬&#160;</a>`;
  }).join(" ");
  return { body: `<p>${body}</p>`, nextNoteId: noteId, noteItems };
}

function notesXml(noteItems) {
  const notes = noteItems.map((entry) => {
    const item = entry.item;
    const translation = item.translation ? `<strong>${textWithLineBreaks(item.translation)}</strong>` : "";
    const separator = item.translation && item.note ? "<br/>" : "";
    const note = item.note ? richXml(item.note) : "";
    return `<section id="${entry.id}"><p>${translation}${separator}${note}</p></section>`;
  }).join("\n");
  return { notes };
}

function coverBinary(book) {
  if (!book.cover) return { coverRef: "", binary: "" };
  const coverPath = path.join(repoRoot, book.cover);
  if (!fs.existsSync(coverPath)) return { coverRef: "", binary: "" };
  const id = path.basename(book.cover);
  const ext = path.extname(book.cover).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : "image/jpeg";
  const base64 = fs.readFileSync(coverPath).toString("base64").replace(/(.{76})/g, "$1\n");
  return {
    coverRef: `<coverpage><image l:href="#${escapeXml(id)}"/></coverpage>`,
    binary: `<binary id="${escapeXml(id)}" content-type="${contentType}">\n${base64}\n</binary>`
  };
}

function buildFb2(book) {
  const { coverRef, binary } = coverBinary(book);
  let noteCounter = 1;
  const noteItems = [];
  const chapterXml = book.chapters.map((chapter, chapterIndex) => {
    const title = chapter.title || `Skyrius ${chapterIndex + 1}`;
    const label = chapter.label || title;
    const blocks = chapter.blocks.map((block) => {
      const paragraph = paragraphXml(block.items, noteCounter);
      noteCounter = paragraph.nextNoteId;
      noteItems.push(...paragraph.noteItems);
      return paragraph.body;
    }).join("\n");

    return `<section id="${escapeXml(chapter.id || `chapter-${chapterIndex + 1}`)}">
<title><p>${escapeXml(label)}</p></title>
${blocks}
</section>`;
  }).join("\n");

  const notes = notesXml(noteItems).notes;
  const date = new Date().toISOString().slice(0, 10);

  return `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
<title-info>
<genre>detective</genre>
<author><first-name>${escapeXml(book.author || "")}</first-name></author>
<book-title>${escapeXml(book.title || book.id)}</book-title>
<lang>${escapeXml(book.language || "lt")}</lang>
${coverRef}
</title-info>
<document-info>
<author><nickname>Frank Reader Generator</nickname></author>
<program-used>scripts/build-book.js</program-used>
<date value="${date}">${date}</date>
<id>${escapeXml(book.id || bookId)}-frank-notes</id>
<version>1.0</version>
</document-info>
</description>
<body>
<title>
<p>${escapeXml(book.author || "")}</p>
<p>${escapeXml(book.title || book.id)}</p>
</title>
${chapterXml}
</body>
<body name="notes">
<title><p>Vertimai ir paaiškinimai</p></title>
${notes}
</body>
${binary}
</FictionBook>
`;
}

if (!fs.existsSync(bookPath)) {
  console.error(`ERROR: missing book JSON: ${bookPath}`);
  process.exit(1);
}

const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(fb2Path, buildFb2(book), "utf8");
execFileSync("xmllint", ["--noout", fb2Path], { stdio: "inherit" });
try {
  fs.unlinkSync(zipPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
execFileSync("zip", ["-j", zipPath, fb2Path], { stdio: "inherit" });
fs.rmSync(tempDir, { recursive: true, force: true });
console.log(`OK: ${path.relative(repoRoot, zipPath)}`);
