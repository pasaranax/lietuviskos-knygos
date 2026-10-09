import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
loadEnvFile('.env');
const env = { ...process.env };
env.TGCLOUD_TOKEN = process.env.TG_ACCESS_TOKEN || process.env.TGCLOUD_TOKEN;
delete env.TGCLOUD_DEBUG;
const child = spawn(process.execPath, ['node_modules/@tgcloud/cli/src/cli.js', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', code => process.exit(code ?? 1));
child.on('error', () => { console.error('Could not start Telegram Serverless CLI.'); process.exit(1); });
