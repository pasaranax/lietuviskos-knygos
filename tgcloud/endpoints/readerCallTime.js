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
  return result || { ended: true };
}
