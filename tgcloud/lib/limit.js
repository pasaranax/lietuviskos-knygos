export const dailyLimitMessage = 'На сегодня 10 минут голосового помощника закончились. Возвращайся завтра.';

export async function ensureVoiceAccess(db, userId, username) {
  if (typeof username !== 'string' || username.toLowerCase() !== 'pasaranax') return;
  // Only the first verified owner profile can claim this grant. A later rename
  // keeps the numeric binding; reusing the username does not grant another ID.
  await db.run(`INSERT INTO reader_voice_access (user_id, unlimited)
    SELECT :userId, 1 WHERE NOT EXISTS (SELECT 1 FROM reader_voice_access WHERE unlimited = 1)
    ON CONFLICT(user_id) DO NOTHING`, { ':userId': userId });
}

export async function getCallStatus(db, userId, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const access = await db.get('SELECT unlimited FROM reader_voice_access WHERE user_id = :userId', { ':userId': userId });
  const unlimited = access?.unlimited === 1;
  const row = await db.get('SELECT * FROM voice_time_limits WHERE user_id = :userId', { ':userId': userId });
  let spent = 0;
  if (row?.day === day) {
    spent = row.used_ms;
    if (row.call_id) spent -= row.reserved_ms - (row.activated
      ? Math.min(row.reserved_ms, Math.max(0, Math.min(now, row.lease_until, row.deadline) - row.call_started_at)) : 0);
  }
  const remainingSeconds = unlimited ? null : Math.max(0, Math.floor((600000 - spent) / 1000));
  const result = (code, message) => ({ allowed: false, remainingSeconds, unlimited, code, message });
  if (!unlimited && !remainingSeconds) return result('DAILY_LIMIT', dailyLimitMessage);
  if (row?.call_id && row.lease_until > now) return result('CALL_ACTIVE', 'Разговор уже идёт. Сначала заверши его.');
  if (row && row.last_started_at > now - 10000) return result('COOLDOWN', 'Между разговорами нужно подождать 10 секунд.');
  const issued = await db.get('SELECT day, issued FROM voice_token_issues WHERE user_id = :userId', { ':userId': userId });
  if (!unlimited && issued?.day === day && issued.issued >= 30) return result('TOKEN_LIMIT', 'Сегодня уже было 30 подключений. Возвращайся завтра.');
  return { allowed: true, remainingSeconds, unlimited };
}

export async function notifyDailyLimit(db, api, userId, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const claim = await db.run(`INSERT INTO voice_limit_notifications (user_id, day) VALUES (:userId, :day)
    ON CONFLICT(user_id) DO UPDATE SET day = excluded.day WHERE day != :day RETURNING user_id`,
    { ':userId': userId, ':day': day });
  if (!claim.rows.length) return;
  try {
    await api.sendMessage({ chat_id: userId, text: dailyLimitMessage });
  } catch {
    // Delivery failure must not block quota enforcement; allow a later retry.
    await db.run('DELETE FROM voice_limit_notifications WHERE user_id = :userId AND day = :day', { ':userId': userId, ':day': day });
  }
}

export async function checkCallAllowance(db, api, userId, username) {
  await ensureVoiceAccess(db, userId, username);
  const status = await getCallStatus(db, userId);
  if (status.code === 'DAILY_LIMIT') await notifyDailyLimit(db, api, userId);
  return status;
}
