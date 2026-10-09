import { cp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadEnvFile } from 'node:process';

try { loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
// Explicit public allowlist keeps credentials, source tooling and author dossiers off the site.
for (const file of ['index.html', 'index.js', 'index.css', 'reader.html', 'reader.js', 'reader.css',
  'reader-learning.js', 'reader-live.js', 'reader-water.js', 'reader-mic-worklet.js', 'reader-telegram.js', 'reader-profile.js', 'books']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
// Refresh asset URLs so Telegram WebViews cannot reuse an older script after deployment.
for (const htmlFile of ['index.html', 'reader.html']) {
  let html = await readFile(`dist/${htmlFile}`, 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="([^"?]+\.(?:js|css))(?:\?[^" ]*)?"/g)].map(match => match[1]).filter(asset => !asset.includes('://'));
  for (const asset of assets) {
    const hash = createHash('sha256').update(await readFile(`dist/${asset}`)).digest('hex').slice(0, 12);
    html = html.replaceAll(new RegExp(`((?:src|href)="${asset.replaceAll('.', '\\.')})(?:\\?[^" ]*)?"`, 'g'), `$1?v=${hash}"`);
  }
  await writeFile(`dist/${htmlFile}`, html);
}
// Keep chapter audio and timelines local; thousands of phrase clips remain on the
// existing public book host to fit Telegram Serverless's 1000-file static limit.
const audioHost = 'https://pasaranax.github.io/lietuviskos-knygos/';
async function copyPublic(file) {
  await mkdir(`dist/${file.substring(0, file.lastIndexOf('/'))}`, { recursive: true });
  await cp(file, `dist/${file}`);
}
const catalog = JSON.parse(await readFile('books/catalog.json', 'utf8'));
// Telegram Serverless canonicalizes .html URLs and drops the query on redirect.
for (const entry of catalog.books) entry.href = `reader?book=${encodeURIComponent(entry.id)}`;
await writeFile('dist/books/catalog.json', JSON.stringify(catalog));
for (const entry of catalog.books) {
  await copyPublic(entry.cover);
  const file = `books/${entry.id}.json`;
  const book = JSON.parse(await readFile(file, 'utf8'));
  for (const chapter of book.chapters) {
    for (const block of chapter.blocks) for (const item of block.items || []) {
      if (item.audio) item.audio = new URL(item.audio, audioHost).href;
    }
    if (!chapter.audio) continue;
    await copyPublic(chapter.audio);
    const manifestPath = chapter.audio.replace(/[^/]+$/, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    for (const cue of manifest.phrases) cue.audio = new URL(cue.audio, audioHost).href;
    await writeFile(`dist/${manifestPath}`, JSON.stringify(manifest));
  }
  await writeFile(`dist/${file}`, JSON.stringify(book));
}
await mkdir('tgcloud/lib', { recursive: true });
const bookData = {};
for (const entry of catalog.books) {
  const book = JSON.parse(await readFile(`books/${entry.id}.json`, 'utf8'));
  bookData[entry.id] = { chapters: book.chapters.map(chapter => ({ blocks: chapter.blocks.map(block => ({
    items: block.items.map(({ text, translation, note }) => ({ text, translation, note }))
  })) })) };
}
// Serverless limits a module to 1 MiB. Split serialized public data into small modules.
await rm('tgcloud/lib/book-data', { recursive: true, force: true });
await mkdir('tgcloud/lib/book-data', { recursive: true });
const serializedBooks = JSON.stringify(bookData), dataImports = [], dataParts = [];
for (let offset = 0; offset < serializedBooks.length; offset += 110000) {
  const index = dataParts.length, name = `part${index}`;
  dataImports.push(`import ${name} from './book-data/${name}.js';`);
  dataParts.push(name);
  await writeFile(`tgcloud/lib/book-data/${name}.js`, `export default ${JSON.stringify(serializedBooks.slice(offset, offset + 110000))};\n`);
}
await writeFile('tgcloud/lib/book-data.js', `// Generated public book data; split for the Serverless module limit.\n${dataImports.join('\n')}\nexport default JSON.parse([${dataParts.join(',')}].join(''));\n`);
const summaries = JSON.parse(await readFile('author-plans/reader-summaries.json', 'utf8')).books;
await writeFile('tgcloud/lib/book-summaries.js', `// Generated reader-safe chapter summaries; server only.\nexport default ${JSON.stringify(summaries)};\n`);
await writeFile('tgcloud/lib/book-ids.js', `// Generated from the public catalog.\nexport default ${JSON.stringify(catalog.books.map(book => book.id))};\n`);
const learning = await readFile('reader-learning.js', 'utf8');
await writeFile('tgcloud/lib/learning.js', `const learningScope = {};\n${learning.replace(
  "})(typeof window === 'undefined' ? globalThis : window);", '})(learningScope);'
)}\nexport const phraseContext = learningScope.ReaderLearning.phraseContext;\nexport const readingContext = learningScope.ReaderLearning.readingContext;\n`);
const appId = (process.env.TG_ACCESS_TOKEN || process.env.TGCLOUD_TOKEN)?.split(':')[0];
await writeFile('tgcloud/lib/config.js', `// Generated; server only.\nexport default ${JSON.stringify({ miniAppUrl: /^app\d+$/.test(appId || '') ? `https://${appId}.tgcloud.ai/` : null })};\n`);
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required in .env');
await writeFile('tgcloud/lib/secrets.js', `// Generated; server only. Never commit.\nexport const geminiApiKey = ${JSON.stringify(process.env.GEMINI_API_KEY)};\n`, { mode: 0o600 });
await chmod('tgcloud/lib/secrets.js', 0o600);
console.log('Mini App built; credentials and author dossiers excluded.');
