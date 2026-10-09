// Preserve individual provider snapshots; never sum cumulative snapshots blindly.
export async function saveUsage(db, userId, input, now = Date.now()) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !/^[a-f0-9]{32}$/.test(input?.callId || '')) throw new Error('Invalid call');
  const session = await db.get('SELECT user_id FROM reader_voice_sessions WHERE call_id = :callId', { ':callId': input.callId });
  if (session?.user_id !== userId) throw new Error('Invalid call');
  if (!Array.isArray(input.events) || !input.events.length || input.events.length > 20) throw new Error('Invalid events');
  function valid(value, depth = 0) {
    if (depth > 4) return false;
    if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0;
    if (typeof value === 'string') return /^[A-Z_]{1,64}$/.test(value);
    if (Array.isArray(value)) return value.length <= 16 && value.every(item => valid(item, depth + 1));
    if (value && typeof value === 'object') return Object.entries(value).length <= 32 && Object.entries(value).every(([key, item]) => /^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(key) && valid(item, depth + 1));
    return false;
  }
  // Validate the complete batch before inserting anything.
  for (const event of input.events) {
    if (!Number.isInteger(event.sequence) || event.sequence < 1 || event.sequence > 10000 || !Number.isSafeInteger(event.receivedAt)
      || !event.metadata || !valid(event.metadata) || JSON.stringify(event.metadata).length > 8192) throw new Error('Invalid usage');
  }
  for (const event of input.events) await db.run(`INSERT INTO reader_voice_usage
    (key, call_id, sequence, received_at, saved_at, metadata) VALUES (:key, :callId, :sequence, :receivedAt, :now, :metadata)
    ON CONFLICT(key) DO NOTHING`, { ':key': input.callId + ':' + event.sequence, ':callId': input.callId,
    ':sequence': event.sequence, ':receivedAt': event.receivedAt, ':now': now, ':metadata': JSON.stringify(event.metadata) });
  return { saved: input.events.length };
}
