import { loadEnvFile } from 'node:process';
import { getFiles, runFunction } from '../node_modules/@tgcloud/cli/src/api/endpoints.js';
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
const identity = await bot('getMe', {});
if (appId !== `app${identity.id}`) throw new Error('Bot token and Serverless app belong to different bots');
// Configure through the managed bot's SDK so the platform and Telegram agree.
const cloud = await getFiles(process.env.TG_ACCESS_TOKEN || process.env.TGCLOUD_TOKEN);
const menuModule = `import { api } from 'sdk';
export default async function ({ url }) {
  const identity = await api.getMe({});
  await api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Книги', web_app: { url } } });
  return { identity, menu: await api.getChatMenuButton({}) };
}`;
const { result } = await runFunction(process.env.TG_ACCESS_TOKEN || process.env.TGCLOUD_TOKEN,
  'endpoints/configureReaderMenu', { ...cloud.canonical_modules, 'endpoints/configureReaderMenu': menuModule }, { url }, {});
if (result.identity.id !== identity.id) throw new Error('Serverless identity differs from bot credentials');
const menu = result.menu;
if (menu.type !== 'web_app' || menu.web_app?.url !== url) throw new Error('Menu verification failed');
console.log(JSON.stringify({ username: identity.username, menuType: menu.type, text: menu.text, url }));
