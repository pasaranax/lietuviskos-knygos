const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({});
const filename = require('node:path').join(__dirname, '../reader-learning.js');
if (fs.existsSync(filename)) vm.runInContext(fs.readFileSync(filename, 'utf8'), context);
const api = context.ReaderLearning || {};
const item = (text) => ({ text, translation: 'перевод ' + text, note: '**слово** — разбор' });
const selected = item('kirčiúota');
const book = { id: 'sample', chapters: [
  { blocks: [{ items: [item('pradžia'), item('kartojama')] }] },
  { blocks: [{ items: [item('kartojama'), selected, item('ateitis')] }] },
  { title: 'slaptas pavadinimas', blocks: [{ items: [item('pabaiga')] }] }
] };

test('assistant sees all preceding text and exact stressed phrase, never later text', () => {
  assert.equal(typeof api.phraseContext, 'function');
  const result = api.phraseContext(book, { chapter: 1, block: 0, item: 1 });
  assert.equal(result.before, 'pradžia kartojama\n\nkartojama');
  assert.equal(result.phrase.text, selected.text);
  assert.equal(result.phrase.note, selected.note);
  assert.equal(result.phrase.translation, selected.translation);
  assert.doesNotMatch(JSON.stringify(result), /ateitis|pabaiga|slaptas/);
});

test('invalid location cannot accidentally send an entire book', () => {
  assert.equal(typeof api.phraseContext, 'function');
  assert.throws(() => api.phraseContext(book, { chapter: 9, block: 0, item: 0 }));
  assert.throws(() => api.phraseContext(book, { chapter: 0, block: 0, item: -1 }));
});

test('reading context includes the last visible phrase and only Lithuanian source, without its tooltip', () => {
  assert.equal(typeof api.readingContext, 'function');
  assert.equal(api.readingContext(book, { chapter: 1, block: 0, item: 1 }), 'pradžia kartojama\n\nkartojama kirčiúota');
  assert.doesNotMatch(api.readingContext(book, { chapter: 1, block: 0, item: 1 }), /перевод|разбор|ateitis|pabaiga/);
});
