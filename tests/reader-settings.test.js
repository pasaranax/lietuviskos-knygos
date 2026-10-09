const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
test('all settings are stored per verified user and voice is constrained to named teachers', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE reader_profiles (user_id INTEGER PRIMARY KEY,settings TEXT NOT NULL,updated_at INTEGER NOT NULL); CREATE TABLE reader_voice_access (user_id INTEGER PRIMARY KEY,unlimited INTEGER)');
  class EndpointError extends Error { constructor(text, params) { super(text); this.code = params.code; } }
  const ctx = vm.createContext({ EndpointError, db: { run: async (s, p) => ({ rows: sql.prepare(s).all(p) }), get: async (s, p) => sql.prepare(s).get(p) || null } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../tgcloud/lib/settings.js'), 'utf8').replace(/export /g, ''), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../tgcloud/lib/limit.js'), 'utf8').replace(/export /g, ''), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../tgcloud/endpoints/readerSettings.js'), 'utf8').replace(/^import .*;\n/gm, '').replace('export default async function', 'async function settingsEndpoint'), ctx);
  const call = ctx.settingsEndpoint;
  const user = id => ({ initData: { user: { id } } });
  const settings = { fontSize: 27, fontFamily: 'sans', theme: 'dark', language: 'ru', voice: 'marius' };
  await call({ action: 'save', settings, userId: 2 }, user(1));
  assert.deepEqual(JSON.parse(JSON.stringify(await call({ action: 'load' }, user(1)))), settings);
  assert.equal((await call({ action: 'load' }, user(2))).voice, 'egle');
  await assert.rejects(call({ action: 'save', settings: { ...settings, voice: 'arbitrary' } }, user(1)), e => e.code === 'INVALID_SETTINGS');
  await assert.rejects(call({ action: 'load' }, {}), e => e.code === 'AUTH_REQUIRED');
  await call({ action: 'load' }, {initData:{user:{id:7,username:'pasaranax'}}});
  assert.equal(sql.prepare('SELECT unlimited FROM reader_voice_access WHERE user_id=7').get().unlimited,1);
});
