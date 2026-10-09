import { db, api, EndpointError } from 'sdk';
import { checkCallAllowance } from '../lib/limit.js';

export default async function (input, ctx) {
  const userId = ctx.initData?.user?.id;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new EndpointError('Открой читалку в Telegram.', { code: 'AUTH_REQUIRED' });
  return checkCallAllowance(db, api, userId, ctx.initData.user.username);
}
