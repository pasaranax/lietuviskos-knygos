# Shared reader integration and delivery

Use this reference when adding a book, updating reader data, verifying a chapter or publishing it. Paths and commands are relative to this repository.

## Goal and architecture

Add each new Lithuanian book so it appears on `index.html` as a bookshelf card and opens in the shared `reader.html` UI.

The reader is generic. Do not create one-off HTML readers per book.

- The supported target is a static web site over HTTP/HTTPS.
- Do not create one-file monolithic readers.
- Do not inline hardcoded book text in HTML.
- Do not add WebView-specific hacks as a required runtime path.
- Reading progress must be stored as an absolute paragraph anchor, paragraph index, offset and short text fingerprint, not as a percentage. If new chapters are appended, the user should reopen at the same paragraph and the visible percent should decrease naturally.

## Project files

- `index.html` - bookshelf shell.
- `index.css` / `index.js` - bookshelf UI and catalog loading.
- `reader.html` - shared reader shell.
- `reader.css` / `reader.js` - shared reader UI, tooltips, settings, progress persistence.
- `books/catalog.json` - list of books shown on the shelf.
- `books/<book-id>.json` - one processed book.
- `assets/<book-id>-cover.jpg` - extracted cover image.

## Data contract

`books/catalog.json` entry:

```json
{
  "id": "book-id",
  "title": "Knygos pavadinimas",
  "author": "Autorius",
  "cover": "assets/book-id-cover.jpg",
  "href": "reader.html?book=book-id",
  "wordCount": 52393
}
```

`books/<book-id>.json`:

```json
{
  "id": "book-id",
  "title": "Knygos pavadinimas",
  "author": "Autorius",
  "language": "lt",
  "translationLanguage": "ru",
  "cover": "assets/book-id-cover.jpg",
  "wordCount": 52393,
  "chapters": [
    {
      "id": "chapter-1",
      "title": "Skyrius 1",
      "label": "I",
      "blocks": [
        {
          "type": "paragraph",
          "items": [
            {
              "text": "Kirčiuotas lietuviškas tekstas.",
              "translation": "Буквальный русский перевод.",
              "note": "**žodis** — перевод начальной формы; **pakitusi forma** — краткое объяснение изменения.\n**kitas žodis** — перевод; грамматическая роль или правило."
            }
          ]
        }
      ]
    }
  ]
}
```

Block `type` is either `paragraph` or `dialogue`.

Use Lithuanian UI strings, stable lowercase Latin book IDs with hyphens, real chapter titles where available, and `Skyrius N` otherwise. Keep original chapter order and printed chapter labels. Original generated works use the agreed generated-work authorship metadata; imported books retain their actual author. Covers must be real suitable images, not blank or title-only pages.

## Build and update canonical data

Create `books/<book-id>.json` and add its shelf entry to `books/catalog.json`. Keep the catalog small; do not duplicate book text there. Store the actual available narrative word count, not the planned final length or PDF page count. The shelf estimates pages as `ceil(wordCount / 250)`.

For language review and manual annotation, read [language-and-reader.md](language-and-reader.md). Appending chapters preserves old chapter/block order and absolute reading anchors. Author dossiers and casting metadata stay out of the reader, catalog and rendered site build; see the skill's book-state rules.

## Verification

Inspect the existing cleaner before running it: it may mutate the book. Compare the result for dropped or merged content. After reviewing the canonical text and annotations, run:

```bash
node --check index.js
node --check reader.js
node scripts/clean-book-items.js <book-id>
python3 -m json.tool "books/<book-id>.json"
python3 -m json.tool books/catalog.json
node --test tests/*.test.js
python3 -m unittest discover -s tests
```

Serve locally:

```bash
python3 -m http.server 17876 --bind 0.0.0.0
```

Open:

```text
http://<LAN-IP>:17876/index.html
```

Browser checks:

- The book appears on the shelf.
- Cover is visible.
- Word count and estimated pages are shown in Lithuanian.
- If progress exists, the shelf shows `Perskaityta N%`.
- The book opens through `reader.html?book=<book-id>`.
- Chapter dropdown shows real title or `Skyrius N`.
- Tooltip appears above the whole phrase.
- Tooltip does not repeat the source phrase.
- Mobile reader has a back button.
- Mobile shelf fits at least two cards per row.

## Publishing scope

Do not publish a full copyrighted book to public GitHub Pages unless the user explicitly confirms they have rights or accepts that only a demo/private-safe subset should be published.

GitHub Pages is public by default. Treat full book text as publish-sensitive.

## Complete chapter delivery

A request to create or continue a chapter includes its complete narration and deployment, unless the user explicitly limits the request to a draft or text only. Finish one chapter at a time: review the text and notes, generate audio, verify it, then deploy that chapter before proceeding to the next. Do not wait for a separate request to add audio or deploy. Honor rights confirmations and publishing authorization already given for the book.

A local-only, no-push or explicitly requested batch scope takes precedence. For narration, use [gemini-narration.md](gemini-narration.md); it owns casting, performance, synthesis and audio verification.

Deploy completed chapters through the established GitHub Pages workflow. Verify a successful deployment and the actual published JSON, manifest and audio files before reporting the chapter available. A local commit, push, successful deployment and verified published content are different results; report the one actually completed.
