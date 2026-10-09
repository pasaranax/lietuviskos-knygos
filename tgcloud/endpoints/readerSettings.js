import { db, EndpointError } from 'sdk';
import { getSettings, validSettings } from '../lib/settings.js';
export default async function (input, ctx) {
  const userId = ctx.initData?.user?.id;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new EndpointError('Открой приложение в Telegram.', { code: 'AUTH_REQUIRED' });
  if (input?.action === 'load') return getSettings(db, userId);
  let settings;
  try { if (input?.action !== 'save') throw new Error(); settings = validSettings(input.settings); }
  catch { throw new EndpointError('Неверные настройки.', { code: 'INVALID_SETTINGS' }); }
  await db.run(`INSERT INTO reader_profiles (user_id, settings, updated_at) VALUES (:userId, :settings, :now)
    ON CONFLICT(user_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`, {
    ':userId': userId, ':settings': JSON.stringify(settings), ':now': Date.now(),
  });
  return { saved: true };
}
