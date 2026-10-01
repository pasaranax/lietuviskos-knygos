# Import an existing Lithuanian book

Use this reference for an existing source book, especially a PDF. Preserve its text and chapter order; do not apply the original-fiction drafting loop or rewrite it to A2. Read [language-and-reader.md](language-and-reader.md) for stress marks and contextual Russian annotations, and [reader-delivery.md](reader-delivery.md) for canonical JSON, reader checks and publishing scope.

## Identify metadata

Extract or verify:

- `title`
- `author`
- stable `book-id` in lowercase Latin letters with hyphens
- source language: Lithuanian
- target explanation language: Russian

Use Lithuanian UI strings. If a chapter has no real title, use `Skyrius 1`, `Skyrius 2`, etc.

## Extract text

Prefer text extraction, not OCR.

```bash
pdftotext -layout "$PDF" "/tmp/$BOOK_ID.txt"
```

Check the output manually:

- Lithuanian letters must survive: `ą č ę ė į š ų ū ž`.
- Lines must not contain OCR-like substitutions.
- Headers, footers, page numbers and copyright/service text should be removed from book content.
- If text extraction is broken, stop and report that OCR or another source is needed.

## Extract cover

First inspect embedded images:

```bash
pdfimages -list "$PDF"
```

If page 1 has a real cover image:

```bash
pdfimages -j -f 1 -l 1 "$PDF" "assets/$BOOK_ID-cover"
```

Rename the produced file to:

```text
assets/<book-id>-cover.jpg
```

If no embedded cover exists, render page 1:

```bash
pdftoppm -jpeg -singlefile -f 1 -l 1 -r 180 "$PDF" "assets/$BOOK_ID-cover"
```

Then verify visually that the cover is readable and not a blank/title-only page.

## Count source words

Count Lithuanian word tokens from the extracted full text:

```bash
perl -CSD -Mutf8 -0ne '@w=/\p{L}+(?:[\x{2019}\x{0027}-]\p{L}+)*/g; print scalar(@w), qq(\n)' "/tmp/$BOOK_ID.txt"
```

Use the count for the available narrative text in the canonical JSON; follow [reader-delivery.md](reader-delivery.md) for catalog metadata and shelf page estimates.

## Detect chapters

If the book has a table of contents:

- Use the real chapter titles.
- Preserve chapter order.
- Use stable IDs: `chapter-1`, `chapter-2`, etc.

If there are no chapter titles:

- Use Lithuanian fallback titles: `Skyrius 1`, `Skyrius 2`, etc.
- Use printed chapter labels in `label` when present: `I`, `II`, `III`.

Continue with verified stress marking and small, context-reviewed translation chunks in the canonical book JSON. Do not publish the full source without the rights authorization required in reader-delivery.md.
