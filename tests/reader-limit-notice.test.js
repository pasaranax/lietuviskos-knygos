const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function harness() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE reader_voice_sessions(call_id TEXT PRIMARY KEY,user_id INTEGER,started_at INTEGER,ended_at INTEGER)');
  sql.exec(`CREATE TABLE voice_time_limits (user_id INTEGER PRIMARY KEY,day TEXT,used_ms INTEGER,last_started_at INTEGER,call_id TEXT,reserved_ms INTEGER,call_started_at INTEGER,activated INTEGER,lease_until INTEGER,deadline INTEGER);
    CREATE TABLE voice_token_issues (user_id INTEGER PRIMARY KEY,day TEXT,issued INTEGER);
    CREATE TABLE voice_limit_notifications (user_id INTEGER PRIMARY KEY,day TEXT);
    CREATE TABLE reader_voice_access (user_id INTEGER PRIMARY KEY,unlimited INTEGER);`);
  const messages = [];
  const db = { run: async (query, params) => ({ rows: sql.prepare(query).all(params) }),
    get: async (query, params) => sql.prepare(query).get(params) || null,
    all: async (query, params) => sql.prepare(query).all(params) };
  class EndpointError extends Error { constructor(message, options) { super(message); this.code = options.code; } }
  const ctx = vm.createContext({ db, EndpointError, api: { sendMessage: async m => messages.push(m) } });
  const load = (file, name) => {
    if (!fs.existsSync(path.join(__dirname, '..', file))) return;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/^import .*;\n/gm, '')
      .replace('export default async function', 'async function '+name).replace(/export /g, ''), ctx);
  };
  load('tgcloud/lib/quota.js'); load('tgcloud/lib/limit.js'); load('tgcloud/endpoints/readerCallStatus.js', 'status'); load('tgcloud/endpoints/readerCallTime.js', 'time');
  const exhausted = user => sql.prepare('INSERT INTO voice_time_limits VALUES (?,?,600000,0,\'\',0,0,0,0,0)').run(user,new Date().toISOString().slice(0,10));
  return { ctx, db, sql, messages, exhausted };
}
test('exhausted status is specific and bot notification is deduplicated per user/day', async () => {
  const h = harness(); h.exhausted(7);
  assert.equal(typeof h.ctx.status, 'function');
  const who = { initData: { user: { id: 7 } } };
  const result = await h.ctx.status({}, who);
  assert.equal(result.allowed, false); assert.equal(result.code, 'DAILY_LIMIT'); assert.equal(result.remainingSeconds, 0);
  assert.match(result.message, /10 минут/);
  await h.ctx.status({}, who); await h.ctx.time({callId:'a'.repeat(32),action:'end'},who);
  assert.equal(h.messages.length, 1); assert.equal(h.messages[0].chat_id, 7); assert.match(h.messages[0].text, /завтра/);
  const fresh = await h.ctx.status({}, { initData: { user: { id: 8 } } });
  assert.equal(fresh.allowed, true); assert.equal(fresh.remainingSeconds, 600);
  await assert.rejects(h.ctx.status({}, {}), e => e.code === 'AUTH_REQUIRED');
});
test('end of the last connected seconds notifies even when client never checks status again', async () => {
  const h = harness(), now = Date.now(), id = 'b'.repeat(32), who = {initData:{user:{id:9}}};
  h.sql.prepare('INSERT INTO voice_time_limits VALUES (?,?,600000,?,?,?,?,?,?,?)')
    .run(9,new Date().toISOString().slice(0,10),now-2000,id,2000,now-2000,1,now+1000,now);
  await h.ctx.time({callId:id,action:'end'},who);
  assert.equal(h.messages.length,1); assert.equal(h.messages[0].chat_id,9);
  await h.ctx.time({callId:id,action:'end'},who); assert.equal(h.messages.length,1);
});
test('busy reservation and cooldown do not pretend daily time is exhausted', async () => {
  const h = harness(), now = Date.now(), who={initData:{user:{id:12}}};
  const reserved=await h.ctx.reserveCall(h.db,12,{maxCallSeconds:600,dailyCallSeconds:600,cooldownSeconds:10},now);
  let status=await h.ctx.status({},who);
  assert.equal(status.code,'CALL_ACTIVE'); assert.equal(h.messages.length,0);
  await h.ctx.updateCall(h.db,12,reserved.callId,'end',now);
  status=await h.ctx.status({},who); assert.equal(status.code,'COOLDOWN'); assert.equal(h.messages.length,0);
});

test('unlimited access bypasses daily time and token cap only for its server profile', async () => {
  const h=harness(); h.exhausted(7); h.exhausted(8);
  h.sql.prepare('INSERT INTO reader_voice_access VALUES (7,1)').run();
  h.sql.prepare('INSERT INTO voice_token_issues VALUES (?,?,30)').run(7,new Date().toISOString().slice(0,10));
  const status=await h.ctx.status({}, {initData:{user:{id:7}}});
  assert.equal(status.allowed,true); assert.equal(status.unlimited,true); assert.equal(status.remainingSeconds,null); assert.equal(h.messages.length,0);
  assert.equal((await h.ctx.status({}, {initData:{user:{id:8}}})).allowed,false);
});
test('owner enrollment uses signed Telegram username, ignores input and stays bound to first numeric profile', async () => {
 const h=harness(); h.exhausted(7); h.exhausted(8);
 assert.equal((await h.ctx.status({username:'pasaranax'},{initData:{user:{id:8,username:'other'}}})).allowed,false);
 const owner=await h.ctx.status({}, {initData:{user:{id:7,username:'pasaranax'}}});
 assert.equal(owner.unlimited,true); assert.equal(owner.allowed,true);
 assert.equal((await h.ctx.status({}, {initData:{user:{id:7,username:'renamed'}}})).unlimited,true);
 assert.equal((await h.ctx.status({}, {initData:{user:{id:8,username:'pasaranax'}}})).unlimited,false);
});
