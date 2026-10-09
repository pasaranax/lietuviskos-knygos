import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { appUrl, deployedCall } from './deployed-api.mjs';
import { getFiles, getWebhook, getMigrationStatus } from '../node_modules/@tgcloud/cli/src/api/endpoints.js';
const cloud = await getFiles(process.env.TG_ACCESS_TOKEN);
const webhook = await getWebhook(process.env.TG_ACCESS_TOKEN);
assert.equal(webhook.in_sync, true);
assert.equal((await getMigrationStatus(process.env.TG_ACCESS_TOKEN)).db_changes.length, 0);
for (const file of ['index.html','reader.html','reader.js','reader-live.js','reader-water.js','reader-profile.js','reader.css','books/catalog.json']) {
  const response = await fetch(appUrl + file);
  assert.equal(response.status, 200);
  const hash = data => createHash('sha256').update(data).digest('hex');
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(await readFile('dist/' + file)), file);
}
for (const name of ['startReaderCall','readingPosition','readerSettings']) {
  const response = await fetch(appUrl + 'api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 401);
}
for (const file of ['.env','tgcloud/lib/secrets.js','author-plans']) assert.equal((await fetch(appUrl + file)).status, 404);
const bookId = 'keliaujanti-biblioteka';
const catalog = await (await fetch(appUrl + 'books/catalog.json')).json();
for (const entry of catalog.books) {
  const response = await fetch(appUrl + entry.href);
  assert.equal(new URL(response.url).searchParams.get('book'), entry.id);
  assert.match(await response.text(), /id="content"/);
}
const position = { id: 'chapter-2-p-17', index: 57, offset: -68, text: '' };
await deployedCall('readingPosition', { action: 'save', bookId, position });
assert.deepEqual((await deployedCall('readingPosition', { action: 'load' }))[bookId], position);
assert.equal((await deployedCall('readingPosition', { action: 'load' }, 900000000002))[bookId], undefined);
const settings = { fontSize: 27, fontFamily: 'sans', theme: 'dark', language: 'ru', voice: 'marius' };
await deployedCall('readerSettings', { action: 'save', settings });
assert.deepEqual(await deployedCall('readerSettings', { action: 'load' }), settings);
assert.equal((await deployedCall('readerSettings', { action: 'load' }, 900000000002)).voice, 'egle');
const book = await (await fetch(appUrl + `books/${bookId}.json`)).json();
assert.equal((await fetch(appUrl + book.chapters[0].audio, { method: 'HEAD' })).status, 200);
const manifest = await (await fetch(appUrl + book.chapters[0].audio.replace(/[^/]+$/, 'manifest.json'))).json();
assert.equal(manifest.phrases[0].audio, book.chapters[0].blocks[0].items[0].audio);
assert.equal((await fetch(manifest.phrases[0].audio, { method: 'HEAD' })).status, 200);
console.log(JSON.stringify({ revision: cloud.revision, webhookInSync: true, schemaInSync: true,
  staticHashMatches: 8, unauthenticatedRejected: 3, privateFilesAbsent: 3, profileReadbackAndIsolation: true, settingsReadbackAndIsolation: true, chapterAndPhraseAudio: true }));
