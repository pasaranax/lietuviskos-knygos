# Book Processing Guide

## Goal

Add each new Lithuanian book so it appears on `index.html` as a bookshelf card and opens in the shared `reader.html` UI.

The reader is generic. Do not create one-off HTML readers per book.

## Project Structure

- `index.html` - bookshelf shell.
- `index.css` / `index.js` - bookshelf UI and catalog loading.
- `reader.html` - shared reader shell.
- `reader.css` / `reader.js` - shared reader UI, tooltips, settings, progress persistence.
- `books/catalog.json` - list of books shown on the shelf.
- `books/<book-id>.json` - one processed book.
- `assets/<book-id>-cover.jpg` - extracted cover image.

## Data Contract

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

## Pipeline

### 1. Identify Book Metadata

Extract or verify:

- `title`
- `author`
- stable `book-id` in lowercase Latin letters with hyphens
- source language: Lithuanian
- target explanation language: Russian

Use Lithuanian UI strings. If a chapter has no real title, use `Skyrius 1`, `Skyrius 2`, etc.

### 2. Extract Text From PDF

Prefer text extraction, not OCR.

```bash
pdftotext -layout "$PDF" "/tmp/$BOOK_ID.txt"
```

Check the output manually:

- Lithuanian letters must survive: `ą č ę ė į š ų ū ž`.
- Lines must not contain OCR-like substitutions.
- Headers, footers, page numbers and copyright/service text should be removed from book content.
- If text extraction is broken, stop and report that OCR or another source is needed.

### 3. Extract Cover Image

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

### 4. Count Words

Count Lithuanian word tokens from the extracted full text:

```bash
perl -CSD -Mutf8 -0ne '@w=/\p{L}+(?:[\x{2019}\x{0027}-]\p{L}+)*/g; print scalar(@w), qq(\n)' "/tmp/$BOOK_ID.txt"
```

Store only `wordCount` in JSON. The shelf estimates pages automatically as:

```text
estimatedPages = ceil(wordCount / 250)
```

Do not use PDF page count for the shelf.

### 5. Detect Chapters

If the book has a table of contents:

- Use the real chapter titles.
- Preserve chapter order.
- Use stable IDs: `chapter-1`, `chapter-2`, etc.

If there are no chapter titles:

- Use Lithuanian fallback titles: `Skyrius 1`, `Skyrius 2`, etc.
- Use printed chapter labels in `label` when present: `I`, `II`, `III`.

### 6. Add Lithuanian Stress Marks

Use the external stress tool:

```text
https://kalbu.vdu.lt/mokymosi-priemones/kirciuoklis/
```

Rules:

- Send larger chunks, not individual phrases.
- Use whole pages or coherent chunks up to 5000 characters.
- Preserve paragraph boundaries and punctuation.
- After receiving stressed text, compare with the source chunk.
- Do not silently drop sentences or punctuation.
- If the tool changes words unexpectedly, keep the original word and only add stress marks when confident.
- If uncertain about Lithuanian stress, do not guess. Re-run the chunk or flag it.

### 7. Create Frank-Method Phrases

The visible text must be Lithuanian only. Russian translation and notes live only in tooltips.

Phrase segmentation:

- Prefer natural phrase-sized chunks.
- Do not split every word.
- Do not make huge paragraph-sized phrases unless the sentence is short.
- Keep dialogue punctuation inside the phrase.
- Preserve stressed Lithuanian text in `text`.
- Frank-method descriptions use "small fragments" but do not define a universal optimal word count. Use this project's explicit limits.
- Target phrase size: 4-7 words.
- Hard maximum: 8 words or 70 characters, whichever is reached first.
- Use 8 words only when the phrase is a single natural unit and splitting it would make the reading worse.
- Split before the hard maximum at natural boundaries: comma, semicolon, colon, dash, dialogue pause, conjunction, prepositional phrase, or participial phrase.
- Allow 1-3 word phrases only for short dialogue turns, idioms, fixed expressions, and sentence tails that would read unnaturally when merged.
- Avoid whole long sentences in one tooltip. A tooltip must fit on mobile and be readable without scanning a wall of text.

Translation:

- Use literal educational Russian translation.
- Do not use polished literary translation when it hides Lithuanian structure.
- Preserve word order where it helps learning.
- It is acceptable if Russian sounds slightly literal.
- The main `translation` field translates the whole Lithuanian phrase. Do not duplicate this full phrase translation again in `note`.
- Translate exactly the current Lithuanian fragment. If the fragment is syntactically incomplete, the Russian translation must stay fragmentary too; do not complete it into a standalone sentence.
- If a split leaves a verb without its object or an object/prepositional tail without its verb, change the phrase split instead of inventing a complete translation.
- Punctuation is not a phrase. Never create clickable items or notes for standalone `.`, `!`, `?`, `***` or similar technical fragments. Attach punctuation to the neighboring semantic phrase, or keep section breaks as plain text without translation and note.
- Never write filler notes like `Смотри буквальный перевод фразы выше.`. If there is no useful word, idiom or grammar explanation, leave `note` empty.
- A Russian translation should mirror source punctuation where practical: Lithuanian comma/colon/dash usually remains an unfinished Russian fragment, not a final period.
- If a phrase has multiple plausible Russian readings, prefer the literal reading first and add the natural Russian variant only if it clarifies meaning.
- The `translation` field must be Russian. English output is a generation error, not an acceptable fallback.
- Proper names, brands and car models must be transliterated or translated consistently in Russian. Example: `Pekardas / Pekarde / Pekardo` is `Паккард`, not `pecard`, `recard`, `Пекард` or English text.
- If any draft contains English or nonsense, rewrite the phrase or word manually. Do not leave garbage in JSON.
- Do not use Google Translate or any external machine translator for book translation or tooltip notes. Translation must be done by the agent from Lithuanian context.
- Final `translation` and `note` content must be editor-reviewed by the agent: verify meaning from Lithuanian, fix names, cases, idioms, register and Russian wording before considering the book processed.
- For high-risk phrases, idioms, slang, proper nouns and grammar explanations, translate manually from context instead of trusting machine output.
- Translate in context. A word gloss must match the meaning of the word in the current sentence, not the most common dictionary meaning.
- Use surrounding sentence/paragraph context to resolve who acts, what object is meant, tense/aspect, idiom, irony, slang and proper-name references.
- Never translate a Lithuanian word by sending it to a machine translator. Use the sentence and paragraph context.
- Preserve meaningful word forms in Russian because the reader is for language learning. Case, number, tense, aspect, prefixes, participles, diminutives, register and size/color suffixes can change the lesson. Do not flatten them into generic dictionary forms. Example: `staliukas` is `столик`, not generic `стол`; `taurelė` is usually `рюмка`, `стопка` or `бокальчик`, not generic `стакан`; `užstatyti deimantai` is `заложенные бриллианты`, not `построенные бриллианты`.

Notes:

- Explain important words, idioms, cases, participles, word order and fixed expressions.
- Give each vocabulary word in its dictionary form, then translate that dictionary form.
- After the lemma and its translation, show the surface form from the sentence when it differs and explain exactly how it changed: case, number, gender, person, tense, mood, participle type, prefix or suffix.
- Put every vocabulary entry on a separate line. The `note` field stores these line breaks as `\n`.
- The full phrase translation is displayed after the vocabulary entries in smaller, regular-weight text. Do not duplicate it in `note`.
- Do not list every function word automatically. Include a preposition, conjunction, particle or pronoun only when it explains government, a fixed construction or another useful grammar point.
- For vocabulary, include multiple Russian synonyms where useful.
- Do not repeat the Lithuanian source phrase in the tooltip.
- Keep notes compact but useful.
- Default note format is word-level: `**lemma** — перевод начальной формы; **surface form** — объяснение формы в предложении.`
- Use multi-word note entries only for real fixed expressions, phrasal constructions or idioms, not for arbitrary adjacent words.
- For automatic generation, multi-word note entries must come from a known-expression whitelist or from a manual editor decision. Never infer arbitrary 2-4 word chunks just because words stand next to each other.
- Do not create note entries that merely translate a large subphrase already covered by `translation`.
- Prefer only useful vocabulary entries; a function word earns an entry only when its construction needs explanation.
- Bold only the Lithuanian word or fixed expression. Keep Russian translations and explanations in normal weight.
- Vocabulary glosses should normally include 2-4 Russian variants when the word has useful shades of meaning.
- If a gloss is a single vague machine word, enrich it manually or omit it.
- The Russian side of notes must not contain English. Latin text is allowed only inside the bold Lithuanian source term or for an explicitly approved proper name.
- Grammar notes are required for changed forms and when the phrase uses a clear rule: preposition case government, participle, half-participle, negation, comparison, question particle, conditional form or fixed construction.
- Grammar notes must bold the actual Lithuanian marker or form, not the Russian grammar label. Correct: `**pabėgti** — убежать; **pabėgęs** — причастная форма...`; incorrect: `**причастная форма** — ...`.
- Notes must not be generated by blindly translating isolated surface forms. If the isolated word translation is wrong in context, use the contextual meaning.

Example note style:

```text
**užsukti** — заглянуть, зайти, завернуть; **užsuko** — 3-е лицо, прошедшее время.
**užeiga** — закусочная, трактир; **užeigą** — винительный падеж ед. числа после **į**.
**į + galininkas** — в, внутрь; предлог направления **į** требует винительного падежа.
```

### 8. Build JSON

Create:

```text
books/<book-id>.json
```

Then add one entry to:

```text
books/catalog.json
```

Keep `catalog.json` small. Do not duplicate all book text there.

If `translation` or `note` fields are still placeholders, do not run a machine translator. Translate and explain them manually in context.

Manual translation workflow:

- Process book text in small manual chunks, not by whole-chapter automatic translation.
- Edit the canonical book file directly: `books/<book-id>.json`.
- Do not keep a second translation file. The reviewed JSON is the source of truth.
- After each chunk, run JSON validation and structural audits.
- Do not mark a chunk done until `translation` and `note` are checked against the Lithuanian context by the agent.

### 9. Verify

Run:

```bash
node --check index.js
node --check reader.js
node scripts/clean-book-items.js <book-id>
python3 -m json.tool "books/<book-id>.json"
python3 -m json.tool books/catalog.json
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

### 10. Legal And Publishing Check

Do not publish a full copyrighted book to public GitHub Pages unless the user explicitly confirms they have rights or accepts that only a demo/private-safe subset should be published.

GitHub Pages is public by default. Treat full book text as publish-sensitive.

## Reader Architecture

- The supported target is a static web site over HTTP/HTTPS.
- Do not create one-file monolithic readers.
- Do not inline hardcoded book text in HTML.
- Do not add WebView-specific hacks as a required runtime path.
- Reading progress must be stored as an absolute paragraph anchor, paragraph index, offset and short text fingerprint, not as a percentage. If new chapters are appended, the user should reopen at the same paragraph and the visible percent should decrease naturally.
