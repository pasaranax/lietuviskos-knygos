import { db, EndpointError } from 'sdk';
import { updateCall } from '../lib/quota.js';

export default async function (input, ctx) {
  const userId = ctx.initData?.user?.id;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new EndpointError('Открой читалку в Telegram.', { code: 'AUTH_REQUIRED' });
  if (!/^[a-f0-9]{32}$/.test(input?.callId ?? '') || !['start', 'heartbeat', 'end'].includes(input?.action)) {
    throw new EndpointError('Neteisingas pokalbis.', { code: 'INVALID_CALL' });
  }
  const result = await updateCall(db, userId, input.callId, input.action);
  if (!result && input.action !== 'end') throw new EndpointError('Разговор завершён.', { code: 'CALL_EXPIRED' });
  return result || { ended: true };
}
