// Management smoke runner: executes the exact deployed canonical sources with synthetic users.
// HTTP auth is tested separately; this does not impersonate a Telegram browser session.
import { loadEnvFile } from 'node:process';
import { getFiles, runFunction } from '../node_modules/@tgcloud/cli/src/api/endpoints.js';
loadEnvFile('.env');
export const appUrl = `https://${process.env.TG_ACCESS_TOKEN.split(':')[0]}.tgcloud.ai/`;
let sources;
export async function deployedCall(name, input, userId = 900000000001) {
  sources ||= (await getFiles(process.env.TG_ACCESS_TOKEN)).canonical_modules;
  const result = await runFunction(process.env.TG_ACCESS_TOKEN, `endpoints/${name}`, sources,
    input, { initData: { user: { id: userId, first_name: 'Reader smoke test' } } });
  return result.result;
}
