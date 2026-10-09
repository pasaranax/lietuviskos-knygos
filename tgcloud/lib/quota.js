function validUser(userId) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Valid Telegram user required');
}

// Token issuance is a separate hard ceiling. Gemini sockets cannot be revoked
// by our client end/heartbeat messages, so these never refund an issued token.
export async function reserveTokenIssue(db, userId, now = Date.now()) {
  validUser(userId);
  const result = await db.run(`INSERT INTO voice_token_issues (user_id, day, issued)
    VALUES (:userId, :day, 1)
    ON CONFLICT(user_id) DO UPDATE SET day = excluded.day,
      issued = CASE WHEN day = :day THEN issued + 1 ELSE 1 END
    WHERE day != :day OR issued < 30
    RETURNING issued`, { ':userId': userId, ':day': new Date(now).toISOString().slice(0, 10) });
  return result.rows.length > 0;
}

// used_ms includes the active reservation. Settle an expired lease before
// reserving the next call; pending connections consume no conversation time.
const settled = `CASE WHEN day = :day THEN used_ms -
  CASE WHEN call_id != '' THEN reserved_ms -
    CASE WHEN activated = 1 THEN min(reserved_ms, max(0, min(lease_until, deadline) - call_started_at))
    ELSE 0 END
  ELSE 0 END
ELSE 0 END`;
const grant = `min(:maxCallMs, :untilMidnight, :dailyMs - (${settled}))`;

export async function reserveCall(db, userId, config, now = Date.now()) {
  validUser(userId);
  const untilMidnight = 86400000 - (now % 86400000);
  const initialGrant = Math.min(config.maxCallSeconds * 1000, config.dailyCallSeconds * 1000, untilMidnight);
  const result = await db.run(`
    INSERT INTO voice_time_limits
      (user_id, day, used_ms, last_started_at, call_id, reserved_ms,
       call_started_at, activated, lease_until, deadline)
    VALUES (:userId, :day, :initialGrant, :now, lower(hex(randomblob(16))),
      :initialGrant, :now, 0, min(:now + 60000, :now + :initialGrant), :now + :initialGrant)
    ON CONFLICT(user_id) DO UPDATE SET
      day = excluded.day, used_ms = (${settled}) + (${grant}),
      last_started_at = :now, call_id = excluded.call_id, reserved_ms = (${grant}),
      call_started_at = :now, activated = 0,
      lease_until = min(:now + 60000, :now + (${grant})), deadline = :now + (${grant})
    WHERE lease_until <= :now AND last_started_at <= :cooldownBefore
      AND (${settled}) < :dailyMs
    RETURNING call_id AS callId, reserved_ms AS reservedMs, deadline
  `, {
    ':userId': userId, ':day': new Date(now).toISOString().slice(0, 10), ':now': now,
    ':initialGrant': initialGrant, ':maxCallMs': config.maxCallSeconds * 1000,
    ':dailyMs': config.dailyCallSeconds * 1000, ':untilMidnight': untilMidnight,
    ':cooldownBefore': now - config.cooldownSeconds * 1000,
  });
  const row = result.rows[0];
  return row ? { ...row, maxCallSeconds: Math.ceil(row.reservedMs / 1000) } : null;
}

export async function updateCall(db, userId, callId, action, now = Date.now()) {
  validUser(userId);
  if (!/^[a-f0-9]{32}$/.test(callId ?? '') || !['start', 'heartbeat', 'end'].includes(action)) throw new Error('Invalid call update');
  const params = { ':userId': userId, ':callId': callId, ':now': now };
  if (action === 'end') {
    const before = await db.get(`SELECT used_ms AS usedMs, reserved_ms AS reservedMs
      FROM voice_time_limits WHERE user_id = :userId AND call_id = :callId`,
      { ':userId': userId, ':callId': callId });
    if (!before) return null;
    const result = await db.run(`UPDATE voice_time_limits SET
      used_ms = used_ms - reserved_ms + CASE WHEN activated = 1
        THEN min(reserved_ms, max(0, min(:now, lease_until, deadline) - call_started_at)) ELSE 0 END,
      call_id = '', reserved_ms = 0, lease_until = 0
      WHERE user_id = :userId AND call_id = :callId
      RETURNING used_ms AS usedMs, day, activated AS connected`, params);
    const row = result.rows[0];
    return row ? { ...row, spentMs: Math.max(0, row.usedMs - before.usedMs + before.reservedMs) } : null;
  }
  const result = await db.run(`UPDATE voice_time_limits SET
    call_started_at = CASE WHEN activated = 0 THEN :now ELSE call_started_at END,
    activated = 1, lease_until = min(:now + 30000, deadline)
    WHERE user_id = :userId AND call_id = :callId AND lease_until > :now AND deadline > :now
    ${action === 'heartbeat' ? 'AND activated = 1' : ''}
    RETURNING deadline - :now AS remainingMs`, params);
  const row = result.rows[0];
  return row ? { remainingSeconds: Math.ceil(row.remainingMs / 1000) } : null;
}
