// Real SDK/DB check with a synthetic user; Telegram delivery is captured, not sent.
import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
import { getFiles, runFunction } from '../node_modules/@tgcloud/cli/src/api/endpoints.js';
loadEnvFile('.env');
const modules = (await getFiles(process.env.TG_ACCESS_TOKEN)).canonical_modules;
const statusSource = modules['endpoints/readerCallStatus'].replace('db, api, EndpointError', 'db, EndpointError');
const timeSource = modules['endpoints/readerCallTime'].replace('db, api, EndpointError', 'db, EndpointError');
const injected = `const delivered = []; const api = { sendMessage: async input => { delivered.push(input); } };\n`;
const probe = `import {db} from 'sdk';
import status from './readerCallStatus.js'; import time from './readerCallTime.js';
import {getCallStatus} from '../lib/limit.js';
export default async function(input,ctx) {
 const userId=ctx.initData.user.id, day=new Date().toISOString().slice(0,10);
 await db.run("INSERT INTO voice_time_limits (user_id,day,used_ms,last_started_at,call_id,reserved_ms,call_started_at,activated,lease_until,deadline) VALUES (:id,:day,600000,0,'',0,0,0,0,0) ON CONFLICT(user_id) DO UPDATE SET day=excluded.day,used_ms=600000,call_id='',reserved_ms=0,lease_until=0",{':id':userId,':day':day});
 const first=await status({},ctx), second=await status({},ctx);
 await time({callId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',action:'end'},ctx);
 const owner=await db.get('SELECT user_id FROM reader_voice_access WHERE unlimited=1 LIMIT 1');
 const ownerStatus=owner ? await getCallStatus(db,owner.user_id) : null;
 await db.run('DELETE FROM voice_time_limits WHERE user_id=:id',{':id':userId});
 await db.run('DELETE FROM voice_limit_notifications WHERE user_id=:id',{':id':userId});
 return { first, second, noticeCount: status.deliveries.length + time.deliveries.length, correctRecipient:status.deliveries.every(m=>m.chat_id===userId), ownerUnlimited:ownerStatus?.unlimited===true };
}`;
const altered = { ...modules,
  'endpoints/readerCallStatus': injected + statusSource + '\nexport const deliveries = delivered; defaultExport.deliveries = delivered;',
  'endpoints/readerCallTime': injected + timeSource + '\nexport const deliveries = delivered; defaultExport.deliveries = delivered;',
  'endpoints/limitProbe': probe };
// Give the named exported handler a property without changing its behavior.
for (const name of ['readerCallStatus','readerCallTime']) altered['endpoints/'+name] = altered['endpoints/'+name]
  .replace('export default async function', 'async function defaultExport') + '\nexport default defaultExport;';
const {result} = await runFunction(process.env.TG_ACCESS_TOKEN,'endpoints/limitProbe',altered,{},
  {initData:{user:{id:900000000020,first_name:'Limit smoke'}}});
assert.equal(result.first.allowed,false); assert.equal(result.first.code,'DAILY_LIMIT');
assert.equal(result.second.remainingSeconds,0); assert.equal(result.noticeCount,1); assert.equal(result.correctRecipient,true);
console.log(JSON.stringify({exhaustedBlocked:true,notificationDeduplicated:true,correctRecipient:true,ownerUnlimited:result.ownerUnlimited}));
