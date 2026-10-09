const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
function server() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE reading_positions (key TEXT PRIMARY KEY,user_id INTEGER,book_id TEXT,position TEXT,updated_at INTEGER)');
  class EndpointError extends Error { constructor(message, data) { super(message); this.code = data.code; } }
  const ctx = vm.createContext({ bookIds: ['a', 'b'], EndpointError, db: { all: async (query, args) => sql.prepare(query).all(args), run: async (query, args) => { assert.doesNotMatch(query, /^SELECT/i); return { rows: sql.prepare(query).all(args) }; } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../tgcloud/endpoints/readingPosition.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export default async function', 'async function readingPosition'), ctx);
  return ctx.readingPosition;
}
test('profile positions survive a new client and are isolated per Telegram user and book', async () => {
  const call = server();
  const user = id => ({ initData: { user: { id } } });
  const position = { id: 'chapter-1-p-0', index: 0, offset: -68, text: 'Rytè.' };
  await call({ action: 'save', bookId: 'a', position, userId: 2 }, user(1));
  await call({ action: 'save', bookId: 'b', position: { ...position, index: 7 } }, user(1));
  assert.deepEqual(JSON.parse(JSON.stringify(await call({ action: 'load' }, user(1)))), { a: position, b: { ...position, index: 7 } });
  assert.deepEqual(JSON.parse(JSON.stringify(await call({ action: 'load' }, user(2)))), {});
  await assert.rejects(call({ action: 'load' }, {}), error => error.code === 'AUTH_REQUIRED');
  await assert.rejects(call({ action: 'save', bookId: '../.env', position }, user(1)), error => error.code === 'INVALID_POSITION');
});
test('profile client waits for callback and serializes saves so an old request cannot overwrite latest position', async () => {
  const requests = [];
  const ctx = vm.createContext({ window: { Telegram: { WebApp: { initData: 'verified', Serverless: { call: (...args) => args[0] === 'readerSettings' ? args[2](null, { fontSize: 23, fontFamily: 'serif', theme: 'light', language: 'lt', voice: 'egle' }) : requests.push(args) } } } }, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../reader-profile.js'), 'utf8'), ctx);
  const profile = ctx.window.ReaderProfile;
  const load = profile.load();
  requests.shift()[2](null, {});
  await load;
  const a = profile.save('a', { id: 'chapter-1-p-1', index: 1, offset: 0 });
  const b = profile.save('a', { id: 'chapter-1-p-2', index: 2, offset: 0 });
  const c = profile.save('a', { id: 'chapter-1-p-3', index: 3, offset: 0 });
  assert.equal(requests.length, 1);
  requests.shift()[2](null, { saved: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.equal(requests[0][1].position.index, 3);
  requests.shift()[2](null, { saved: true });
  await Promise.all([a, b, c]);
});

test('returning to the acknowledged position while another save is pending still saves latest position', async () => {
  const requests = [];
  const ctx = vm.createContext({ window: { Telegram: { WebApp: { initData: 'verified', Serverless: { call: (...args) => args[0] === 'readerSettings' ? args[2](null, { fontSize: 23, fontFamily: 'serif', theme: 'light', language: 'lt', voice: 'egle' }) : requests.push(args) } } } }, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../reader-profile.js'), 'utf8'), ctx);
  const profile = ctx.window.ReaderProfile;
  const loaded = profile.load(); requests.shift()[2](null, {}); await loaded;
  const a = { id: 'chapter-1-p-1', index: 1, offset: 0 };
  const first = profile.save('a', a); requests.shift()[2](null, {}); await first;
  const second = profile.save('a', { ...a, index: 2 });
  const latest = profile.save('a', a);
  requests.shift()[2](null, {}); await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.equal(requests[0][1].position.index, 1);
  requests.shift()[2](null, {}); await Promise.all([second, latest]);
});

test('a transient failed settings write retries then drains the latest snapshot', async () => {
  const requests = [];
  const defaults = { fontSize: 23, fontFamily: 'serif', theme: 'light', language: 'lt', voice: 'egle' };
  const ctx = vm.createContext({ window: { Telegram: { WebApp: { initData: 'verified', Serverless: {
    call: (name, input, callback) => input.action === 'load' ? callback(null, name === 'readerSettings' ? defaults : {}) : requests.push({ name, input, callback })
  } } } }, setTimeout: (fn, ms) => ms < 10000 ? setTimeout(fn, 0) : setTimeout(fn, ms), clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../reader-profile.js'), 'utf8'), ctx);
  const profile = ctx.window.ReaderProfile; await profile.load();
  const first = profile.saveSetting('theme', 'dark');
  const latest = profile.saveSetting('fontSize', 27);
  requests.shift().callback({ message: 'temporary' });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(requests.length, 1); requests.shift().callback(null, { saved: true });
  await new Promise(setImmediate);
  assert.equal(requests.length, 1); assert.equal(requests[0].input.settings.fontSize, 27);
  assert.equal(requests[0].input.settings.theme, 'dark');
  requests.shift().callback(null, { saved: true }); await Promise.all([first, latest]);
});
