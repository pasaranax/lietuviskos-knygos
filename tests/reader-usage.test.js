const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const scope=vm.createContext({});vm.runInContext(fs.readFileSync('tgcloud/lib/usage.js','utf8').replace(/export /g,''),scope);
test('full modality/cache usage is persisted idempotently only for the owner, even after a call ended',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE reader_voice_sessions(call_id TEXT PRIMARY KEY,user_id INTEGER);CREATE TABLE reader_voice_usage(key TEXT PRIMARY KEY,call_id TEXT,sequence INTEGER,received_at INTEGER,saved_at INTEGER,metadata TEXT)');
 const id='a'.repeat(32);sql.prepare('INSERT INTO reader_voice_sessions VALUES (?,?)').run(id,1);
 const db={get:async(s,p)=>sql.prepare(s).get(p),run:async(s,p)=>sql.prepare(s).run(p)};
 const metadata={promptTokenCount:1000,responseTokenCount:500,totalTokenCount:1500,cachedContentTokenCount:100,
  promptTokensDetails:[{modality:'AUDIO',tokenCount:700},{modality:'TEXT',tokenCount:300}],responseTokensDetails:[{modality:'AUDIO',tokenCount:500}],cacheTokensDetails:[{modality:'TEXT',tokenCount:100}]};
 const input={callId:id,events:[{sequence:1,receivedAt:123,metadata}]};
 await scope.saveUsage(db,1,input,456);await scope.saveUsage(db,1,input,789);
 const rows=sql.prepare('SELECT * FROM reader_voice_usage').all();assert.equal(rows.length,1);assert.deepEqual(JSON.parse(rows[0].metadata),metadata);assert.equal(rows[0].saved_at,456);
 await assert.rejects(scope.saveUsage(db,2,input));
 await assert.rejects(scope.saveUsage(db,1,{...input,events:[{sequence:2,receivedAt:123,metadata:{promptTokenCount:-1}}]}));
 assert.equal(sql.prepare('SELECT count(*) n FROM reader_voice_usage').get().n,1);
 sql.close();
});
