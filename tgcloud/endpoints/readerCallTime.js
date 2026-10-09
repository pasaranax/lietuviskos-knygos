import { db, api, EndpointError } from 'sdk';
import { updateCall } from '../lib/quota.js';
import { checkCallAllowance } from '../lib/limit.js';

export default async function (input, ctx) {
  const userId = ctx.initData?.user?.id;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new EndpointError('Открой читалку в Telegram.', { code: 'AUTH_REQUIRED' });
  if (!/^[a-f0-9]{32}$/.test(input?.callId ?? '') || !['start', 'heartbeat', 'end'].includes(input?.action)) {
    throw new EndpointError('Неверный разговор.', { code: 'INVALID_CALL' });
  }
  const result = await updateCall(db, userId, input.callId, input.action);
  if (input.action === 'end' || !result) {
    if (!result && input.action !== 'end') await updateCall(db, userId, input.callId, 'end');
    const status = await checkCallAllowance(db, api, userId);
    if (!result && input.action !== 'end') throw new EndpointError(status.message || 'Разговор завершён.', { code: status.code || 'CALL_EXPIRED' });
  }
  if (input.action === 'start' || input.action === 'end') await db.run(
    input.action === 'start' ? 'UPDATE reader_voice_sessions SET started_at = :now WHERE call_id = :callId AND user_id = :userId AND started_at = 0'
      : 'UPDATE reader_voice_sessions SET ended_at = :now WHERE call_id = :callId AND user_id = :userId AND ended_at = 0',
    { ':now': Date.now(), ':callId': input.callId, ':userId': userId });
  return result || { ended: true };
}
