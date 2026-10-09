import { EndpointError } from 'sdk';
import books from '../lib/book-data.js';
import summaries from '../lib/book-summaries.js';
import { phraseContext } from '../lib/learning.js';

export default async function (input, ctx) {
  const userId = ctx.initData?.user?.id;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new EndpointError('Открой читалку в Telegram.', { code: 'AUTH_REQUIRED' });
  const book = books[input?.bookId];
  try { phraseContext(book, input?.location); }
  catch { throw new EndpointError('Выбери место в книге.', { code: 'INVALID_LOCATION' }); }
  return { chapters: (summaries[input.bookId] || []).slice(0, Math.max(0, input.location.chapter - 1))
    .map((text, chapter) => ({ chapter, text })) };
}
