const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../tgcloud/lib/quota.js'), 'utf8').replace(/export /g, ''), context);
const limits = { maxCallSeconds: 600, dailyCallSeconds: 1800, cooldownSeconds: 10 };
const now = Date.parse('2026-10-09T10:00:00Z');
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE voice_time_limits (user_id INTEGER PRIMARY KEY, day TEXT NOT NULL,
    used_ms INTEGER NOT NULL, last_started_at INTEGER NOT NULL, call_id TEXT NOT NULL,
    reserved_ms INTEGER NOT NULL, call_started_at INTEGER NOT NULL, activated INTEGER NOT NULL,
    lease_until INTEGER NOT NULL, deadline INTEGER NOT NULL)`);
  return { run: async (sql, params) => ({ rows: sqlite.prepare(sql).all(params) }),
    get: async (sql, params) => sqlite.prepare(sql).get(params) || null };
}

test('active conversation is exclusive per user and pending failures consume no daily allowance', async () => {
  const db = database();
  const call = await context.reserveCall(db, 1, limits, now);
  assert.ok(call);
  assert.equal(await context.reserveCall(db, 1, limits, now + 15000), null);
  assert.ok(await context.reserveCall(db, 2, limits, now + 15000));
  const result = await context.updateCall(db, 1, call.callId, 'end', now + 20000);
  assert.equal(result.spentMs, 0);
  assert.equal(result.usedMs, 0);
  assert.ok(await context.reserveCall(db, 1, limits, now + 21000));
});

test('only connected time is charged, stale call ids cannot end a newer session', async () => {
  const db = database();
  const call = await context.reserveCall(db, 1, limits, now);
  await context.updateCall(db, 1, call.callId, 'start', now + 1000);
  await context.updateCall(db, 1, call.callId, 'heartbeat', now + 20000);
  const ended = await context.updateCall(db, 1, call.callId, 'end', now + 41000);
  assert.equal(ended.spentMs, 40000);
  const next = await context.reserveCall(db, 1, limits, now + 42000);
  assert.ok(next);
  assert.equal(await context.updateCall(db, 1, call.callId, 'end', now + 43000), null);
  assert.ok(await context.updateCall(db, 1, next.callId, 'start', now + 43000));
});

test('disconnected clients stop consuming allowance when heartbeat lease expires', async () => {
  const db = database();
  const call = await context.reserveCall(db, 1, limits, now);
  await context.updateCall(db, 1, call.callId, 'start', now);
  const ended = await context.updateCall(db, 1, call.callId, 'end', now + 600000);
  assert.equal(ended.spentMs, 30000);
});

test('token issuance remains capped even when clients immediately end or never start calls', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE voice_token_issues (user_id INTEGER PRIMARY KEY,day TEXT NOT NULL,issued INTEGER NOT NULL)');
  const db = { run: async (query, args) => ({ rows: sql.prepare(query).all(args) }) };
  for (let i = 0; i < 30; i++) assert.equal(await context.reserveTokenIssue(db, 1, now + i * 10000), true);
  assert.equal(await context.reserveTokenIssue(db, 1, now + 310000), false);
  assert.equal(await context.reserveTokenIssue(db, 2, now), true);
  assert.equal(await context.reserveTokenIssue(db, 1, now + 86400000), true);
});

test('ten-minute daily budget is shared across sessions and resets on the next UTC day', async () => {
  const db = database();
  const cap = { ...limits, dailyCallSeconds: 600 };
  let cursor = now;
  async function spend(seconds) {
    const call = await context.reserveCall(db, 7, cap, cursor);
    assert.ok(call);
    await context.updateCall(db, 7, call.callId, 'start', cursor);
    for (let elapsed = 15000; elapsed < seconds * 1000; elapsed += 15000) {
      assert.ok(await context.updateCall(db, 7, call.callId, 'heartbeat', cursor + elapsed));
    }
    await context.updateCall(db, 7, call.callId, 'end', cursor + seconds * 1000);
    cursor += seconds * 1000 + 11000;
    return call;
  }
  await spend(240);
  const second = await spend(240);
  assert.equal(second.maxCallSeconds, 360);
  const last = await spend(120);
  assert.equal(last.maxCallSeconds, 120);
  assert.equal(await context.reserveCall(db, 7, cap, cursor), null);
  assert.equal((await context.reserveCall(db, 7, cap, now + 86400000)).maxCallSeconds, 600);
});
