import { api } from 'sdk';
import config from '../lib/config.js';

export default async function (message) {
  if (message.chat?.type !== 'private' || !/^\/start(?:@\w+)?(?:\s|$)/i.test(message.text ?? '')) return;
  await api.sendMessage({ chat_id: message.chat.id,
    text: 'Открывай книгу, читай с подсказками и обсуждай литовский с голосовым помощником.',
    reply_markup: { inline_keyboard: [[{ text: 'Открыть книги', web_app: { url: config.miniAppUrl } }]] },
  });
}
