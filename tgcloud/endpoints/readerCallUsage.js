import { db, EndpointError } from 'sdk';
import { saveUsage } from '../lib/usage.js';
export default async function (input, ctx) {
  const userId = ctx.initData?.user?.id;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new EndpointError('Открой читалку в Telegram.', { code: 'AUTH_REQUIRED' });
  try { return await saveUsage(db, userId, input); }
  catch { throw new EndpointError('Не удалось сохранить расход разговора.', { code: 'INVALID_USAGE' }); }
}
