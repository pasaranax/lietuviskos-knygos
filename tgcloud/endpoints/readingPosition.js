import { db, EndpointError } from 'sdk';
import bookIds from '../lib/book-ids.js';

export default async function (input, ctx) {
  const userId = ctx.initData?.user?.id;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new EndpointError('Открой приложение в Telegram.', { code: 'AUTH_REQUIRED' });
  if (input?.action === 'load') {
    const result = await db.all('SELECT book_id AS bookId, position FROM reading_positions WHERE user_id = :userId', { ':userId': userId });
    return Object.fromEntries(result.map(row => [row.bookId, JSON.parse(row.position)]));
  }
  const p = input?.position;
  if (input?.action !== 'save' || !bookIds.includes(input.bookId) || !p ||
      typeof p.id !== 'string' || !/^chapter-[\w-]+-p-\d+$/.test(p.id) || p.id.length > 100 ||
      !Number.isSafeInteger(p.index) || p.index < 0 || p.index > 100000 ||
      !Number.isSafeInteger(p.offset) || Math.abs(p.offset) > 50000 || (p.text !== undefined && (typeof p.text !== "string" || p.text.length > 120))) {
    throw new EndpointError('Неверное место чтения.', { code: 'INVALID_POSITION' });
  }
  const position = { id: p.id, index: p.index, offset: p.offset, text: p.text || "" };
  await db.run(`INSERT INTO reading_positions (key, user_id, book_id, position, updated_at)
    VALUES (:key, :userId, :bookId, :position, :now)
    ON CONFLICT(key) DO UPDATE SET position = excluded.position, updated_at = excluded.updated_at`, {
    ':key': `${userId}:${input.bookId}`, ':userId': userId, ':bookId': input.bookId,
    ':position': JSON.stringify(position), ':now': Date.now(),
  });
  return { saved: true };
}
