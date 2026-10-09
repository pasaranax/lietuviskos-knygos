// Explicit paid check: deployed tools, reference PCM and provider usage persistence.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {deployedCall} from './deployed-api.mjs';
import {getFiles,runFunction} from '../node_modules/@tgcloud/cli/src/api/endpoints.js';
const userId=900000000034,bookId='keliaujanti-biblioteka',location={chapter:10,block:0,item:0};
const book=JSON.parse(await readFile('books/'+bookId+'.json','utf8'));
const item=book.chapters[0].blocks[0].items[1];
const pcm=execFileSync('ffmpeg',['-v','error','-i',item.audio,'-f','s16le','-ar','16000','-ac','1','pipe:1']);
const learning=vm.createContext({});vm.runInContext(await readFile('reader-learning.js','utf8'),learning);
const grant=await deployedCall('startReaderCall',{bookId,location,phraseLocation:location},userId);
const socket=new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token='+encodeURIComponent(grant.token));
let stage='greeting',historyCalled=false,playCalled=false,recording=false,finished=false,transcript='',sequence=0,heartbeat;
const saves=[],timer=setTimeout(()=>{socket.close();console.error('Tool check timed out');process.exitCode=1;},90000);
function text(value,complete=true){socket.send(JSON.stringify({clientContent:{turns:[{role:'user',parts:[{text:value}]}],turnComplete:complete}}));}
async function reference(){
 recording=true;stage='reference';
 text('reference_audio_start: '+JSON.stringify({text:item.text})+'\nСейчас звучит эталон через «Прослушать», не речь ученика. Слушай молча; не оценивай это как его произношение.',false);
 const started=Date.now();
 for(let offset=0;offset<pcm.length;offset+=3200){
  if(socket.readyState!==1)return;
  await new Promise(resolve=>setTimeout(resolve,100));
  socket.send(JSON.stringify({clientContent:{turns:[{role:'user',parts:[{inlineData:{data:pcm.subarray(offset,offset+3200).toString('base64'),mimeType:'audio/pcm;rate=16000'}}]}],turnComplete:false}}));
 }
 assert.ok(Date.now()-started>=pcm.length/32-100);
 recording=false;
 text('reference_audio_end: Эталонная запись завершена. Можешь коротко предложить разбор грамматики или слов по текущему разговору либо молча ждать. Практику произношения продолжай только по просьбе пользователя. Это не попытка ученика.',false);
}
socket.addEventListener('open',()=>socket.send(JSON.stringify({setup:{model:'models/'+grant.model,generationConfig:{responseModalities:['AUDIO']}}})));
socket.addEventListener('message',async({data})=>{
 try{
  const message=JSON.parse(typeof data==='string'?data:await data.text());
  if(message.error)throw Error('Gemini error');
  if(message.usageMetadata)saves.push(deployedCall('readerCallUsage',{callId:grant.callId,events:[{sequence:++sequence,receivedAt:Date.now(),metadata:message.usageMetadata}]},userId));
  if(message.setupComplete){
   await deployedCall('readerCallTime',{callId:grant.callId,action:'start'},userId);
   heartbeat=setInterval(()=>deployedCall('readerCallTime',{callId:grant.callId,action:'heartbeat'},userId).catch(()=>{}),10000);
   text('Соединение установлено. Поздоровайся согласно инструкции и жди.');
  }
  if(message.toolCallCancellation)console.log(JSON.stringify({cancelledToolIds:message.toolCallCancellation.ids}));
  if(message.toolCall){
   for(const fn of message.toolCall.functionCalls||[]){
    if(fn.name==='get_book_history'){
     const result=await deployedCall('readerBookHistory',{bookId,location},userId);
     assert.equal(result.chapters.length,9);assert.ok(result.chapters.every(c=>c.chapter<9));historyCalled=true;
     socket.send(JSON.stringify({toolResponse:{functionResponses:[{id:fn.id,name:fn.name,response:result}]}}));
    }else{
     assert.equal(fn.name,'play_selected_phrase');assert.equal(playCalled,false);playCalled=true;
     await reference();
     socket.send(JSON.stringify({toolResponse:{functionResponses:[{id:fn.id,name:fn.name,response:{status:'completed',message:'Эталонная запись завершена. Предложи разбор грамматики или слов по текущему разговору либо жди. Практику произношения продолжай только по просьбе пользователя; это не попытка ученика.'}}]}}));
    }
   }
  }
  const content=message.serverContent;
  if(!content)return;
  if(recording&&(content.outputTranscription?.text||content.modelTurn?.parts?.some(p=>p.inlineData)))throw Error('Teacher interrupted reference');
  transcript+=content.outputTranscription?.text||'';
  if(!content.turnComplete||recording)return;
  if(stage==='greeting'){
   assert.match(transcript,/граммат|слов/i);assert.doesNotMatch(transcript,/произн|повтор|потренир|вслух/i);
   console.log('Deployed grammar greeting received.');stage='history';transcript='';
   text('Для ответа нужен сюжет первой главы, его сейчас нет в тексте. Получи сводку через get_book_history и одним предложением скажи, зачем Лина приезжала к Эльзе.');
  }else if(stage==='history'&&historyCalled){
   console.log(JSON.stringify({historyTool:true,futureExcluded:true,transcript:transcript.slice(0,180)}));transcript='';stage='play';
   text('reading_update: '+JSON.stringify({reading:learning.ReaderLearning.readingContext(book,{chapter:0,block:0,item:1}),selection:learning.ReaderLearning.phraseContext(book,{chapter:0,block:0,item:1}).phrase}),false);
   text('Теперь хочу услышать выбранную фразу. Сам включи готовую запись инструментом play_selected_phrase, не читай её своим голосом.');
  }else if(stage==='reference'){
   assert.doesNotMatch(transcript,/повтор|потренир|прочит[а-я]* вслух/i);
   console.log(JSON.stringify({playTool:playCalled,pcmBytes:pcm.length,noPronunciationOffer:true,afterReference:transcript.slice(0,180)}));stage='verify';transcript='';
   text('Что только что звучало: я сам прочитал фразу или это готовая запись? Ответь одной фразой.');
  }else if(stage==='verify'){
   assert.match(transcript,/запис|эталон/i);assert.ok(historyCalled&&playCalled);
   console.log(JSON.stringify({referenceRecognized:true,transcript:transcript.slice(0,180)}));finished=true;socket.close();
  }
 }catch(error){console.error('Tool check failed:',error.message);process.exitCode=1;socket.close();}
});
socket.addEventListener('error',()=>{console.error('Tool socket failed');process.exitCode=1;});
socket.addEventListener('close',async()=>{
 clearTimeout(timer);clearInterval(heartbeat);
 try{
  await Promise.all(saves);
  await deployedCall('readerCallTime',{callId:grant.callId,action:'end'},userId);
  const modules=(await getFiles(process.env.TG_ACCESS_TOKEN)).canonical_modules;
  const probe=`import{db}from'sdk';export default async function(input,ctx){return await db.get('SELECT count(*) count FROM reader_voice_usage u JOIN reader_voice_sessions s ON s.call_id=u.call_id WHERE s.call_id=:callId AND s.user_id=:userId',{':callId':input.callId,':userId':ctx.initData.user.id});}`;
  const result=await runFunction(process.env.TG_ACCESS_TOKEN,'endpoints/usageProbe',{...modules,'endpoints/usageProbe':probe},{callId:grant.callId},{initData:{user:{id:userId,first_name:'Tools smoke'}}});
  assert.ok(sequence>0);assert.equal(result.result.count,sequence);
  console.log(JSON.stringify({providerSnapshots:sequence,savedInDatabase:result.result.count}));
 }catch(error){console.error('Usage check failed:',error.message);process.exitCode=1;}
 if(!finished)process.exitCode=1;
});
