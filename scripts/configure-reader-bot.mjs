import { loadEnvFile } from 'node:process';
loadEnvFile('.env');
const appId = (process.env.TG_ACCESS_TOKEN || process.env.TGCLOUD_TOKEN)?.split(':')[0];
const botToken = process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN;
if (!/^app\d+$/.test(appId || '') || !botToken) throw new Error('TG_ACCESS_TOKEN and TG_BOT_TOKEN are required in .env');
const url = `https://${appId}.tgcloud.ai/`;
async function bot(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(`Bot configuration failed: ${method}, status ${response.status}`);
  return result.result;
}
await bot('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Книги', web_app: { url } } });
const menu = await bot('getChatMenuButton', {});
if (menu.type !== 'web_app' || menu.web_app?.url !== url) throw new Error('Menu verification failed');
console.log(JSON.stringify({ menuType: menu.type, text: menu.text, url }));
