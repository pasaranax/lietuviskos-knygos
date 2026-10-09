import { db, fetch, EndpointError } from 'sdk';
import { getSettings } from '../lib/settings.js';
import bookIds from '../lib/book-ids.js';
import books from '../lib/book-data.js';
import { phraseContext, readingContext } from '../lib/learning.js';
import { geminiApiKey } from '../lib/secrets.js';
import { model, createTokenRequest } from '../lib/session.js';
import { reserveCall, updateCall, reserveTokenIssue } from '../lib/quota.js';

export default async function (input, ctx) {
  const userId = ctx.initData?.user?.id;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new EndpointError('Открой читалку в Telegram.', { code: 'AUTH_REQUIRED' });
  let context;
  try {
    if (!bookIds.includes(input?.bookId)) throw new Error('Unknown book');
  } catch {
    throw new EndpointError('Выбери фразу из книги.', { code: 'INVALID_PHRASE' });
  }
  try {
    const book = books[input.bookId];
    if (!book) throw new Error('Book unavailable');
    context = { reading: readingContext(book, input.location),
      selection: input.phraseLocation ? phraseContext(book, input.phraseLocation).phrase : null };
  } catch {
    throw new EndpointError('Не удалось загрузить фразу. Открой книгу ещё раз.', { code: 'BOOK_UNAVAILABLE' });
  }
  const reservation = await reserveCall(db, userId, { maxCallSeconds: 600, dailyCallSeconds: 600, cooldownSeconds: 10 });
  if (!reservation) throw new EndpointError('Разговор уже идёт, ещё не прошло 10 секунд после предыдущего или исчерпаны 10 минут на сегодня.', { code: 'CALL_LIMIT' });
  if (!await reserveTokenIssue(db, userId)) {
    await updateCall(db, userId, reservation.callId, 'end');
    throw new EndpointError('Сегодня уже было 30 подключений. Возвращайся завтра.', { code: 'TOKEN_LIMIT' });
  }
  try {
    const seconds = Math.floor((reservation.deadline - Date.now()) / 1000);
    if (seconds <= 0) throw new Error('Expired reservation');
    const voice = ['egle', 'marius'].includes(input.voice) ? input.voice : (await getSettings(db, userId)).voice;
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST', headers: { 'x-goog-api-key': geminiApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(createTokenRequest(context, seconds, Date.now(), voice)),
    });
    if (!response.ok) throw new Error('Token unavailable');
    const token = await response.json();
    if (typeof token.name !== 'string' || !token.name.startsWith('auth_tokens/')) throw new Error('Invalid token');
    return { token: token.name, model, callId: reservation.callId, maxCallSeconds: seconds };
  } catch {
    await updateCall(db, userId, reservation.callId, 'end');
    throw new EndpointError('Не удалось подключиться. Попробуй ещё раз.', { code: 'GEMINI_UNAVAILABLE' });
  }
}
