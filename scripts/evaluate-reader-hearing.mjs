// Explicit paid diagnostic. Not part of npm test or the published application.
// Audio travels through realtimeInput (the learner microphone path), never reference_audio.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
loadEnvFile('.env');
const scope = vm.createContext({});
const baseline = process.argv.find(arg=>arg.startsWith('--baseline='))?.split('=')[1];
if(baseline && !/^[a-f0-9]{7,40}$/.test(baseline)) throw new Error('Baseline must be a Git commit hash');
const source = async path => baseline ? execFileSync('git',['show',`${baseline}:${path}`],{encoding:'utf8'}) : await readFile(path,'utf8');
const sessionSource=await source('tgcloud/lib/session.js');
vm.runInContext(sessionSource.replace(/export /g, ''), scope);
vm.runInContext(await readFile('reader-learning.js', 'utf8'), scope);
const micSource = await source('reader-live.js');
// Execute the actual production gate, rather than maintaining a copy of its algorithm.
const gateSource = micSource.slice(micSource.indexOf('  function MicGate'), micSource.indexOf('  ReaderVoice.prototype.start'));
const gateScope = vm.createContext({});
if(gateSource.trim()) vm.runInContext(gateSource, gateScope);
const book = JSON.parse(await readFile('books/keliaujanti-biblioteka.json', 'utf8'));
const locations = [[0,0,1], [1,1,1], [5,0,0]];
const clips = locations.map(([chapter,block,item], id) => {
  const phrase = book.chapters[chapter].blocks[block].items[item];
  const pcm = execFileSync('ffmpeg', ['-v','error','-i',phrase.audio,'-f','s16le','-ar','16000','-ac','1','pipe:1']);
  return { id, location:{chapter,block,item}, phrase, pcm };
});
if(process.argv.includes('--russian')) {
  for(const [id,text] of ['Почему здесь местный падеж? Объясни правило, а не произношение.','Нет, я спрашиваю про грамматику.'].entries()) {
    const path=`/tmp/reader-hearing-russian-${id}.aiff`;
    execFileSync('say',['-v','Milena','-r','155','-o',path,text]);
    const pcm=execFileSync('ffmpeg',['-v','error','-i',path,'-f','s16le','-ar','16000','-ac','1','pipe:1']);
    clips.push({id:clips.length,location:clips[0].location,phrase:{...clips[0].phrase,text,audio:path},pcm});
  }
}
const sleep = ms => new Promise(resolve=>setTimeout(resolve, ms));
const rms = chunk => { let sum=0; for(let i=0;i+1<chunk.length;i+=2) sum+=(chunk.readInt16LE(i)/32768)**2; return Math.sqrt(sum/(chunk.length/2)); };
const normalized = text => text.normalize('NFD').replace(/[\u0300\u0301\u0303]/g,'').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function prepare(clip, quiet, gated) {
  const pcm=Buffer.from(clip.pcm);
  let peakRms=0;
  for(let i=0;i<pcm.length;i+=3200) peakRms=Math.max(peakRms,rms(pcm.subarray(i,i+3200)));
  const gain=quiet ? .003/peakRms : 1;
  if(quiet) for(let i=0;i<pcm.length;i+=2) pcm.writeInt16LE(Math.round(pcm.readInt16LE(i)*gain),i);
  const stream=Buffer.concat([Buffer.alloc(16000),pcm,Buffer.alloc(32000)]);
  if(gated && !gateScope.MicGate) throw new Error('This version has no client gate; use --baseline=<commit> for before/after comparisons');
  const gate=gated ? new gateScope.MicGate() : null;
  const frames=[];let retained=0,total=0,empty=0;
  for(let i=0;i<stream.length;i+=3200){
    const chunk=Buffer.alloc(3200);stream.copy(chunk,0,i,Math.min(i+3200,stream.length));
    const level=rms(chunk);total+=level**2;
    const sent=gated ? Array.from(gate.push(chunk,level)) : [chunk];
    if(!sent.length) empty++;
    for(const c of sent) retained+=rms(c)**2;
    frames.push(sent.length?sent:[Buffer.alloc(3200)]);
  }
  return {frames,stats:{durationSeconds:pcm.length/32000,gain,maxFrameRms:peakRms*gain,zeroedFrames:empty,retainedEnergyPercent:total?100*retained/total:100}};
}
async function evaluate(spec){
  const clip=clips[spec.clip];const prepared=prepare(clip,spec.quiet,spec.gated);
  const context=spec.assess || spec.russian ? {reading:{},selection:scope.ReaderLearning.phraseContext(book,clip.location).phrase} : {reading:{},selection:null};
  const request=scope.createTokenRequest(context,60);
  if(spec.highVad) request.bidiGenerateContentSetup.realtimeInputConfig.automaticActivityDetection.startOfSpeechSensitivity='START_SENSITIVITY_HIGH';
  if(spec.safePrompt){
    request.bidiGenerateContentSetup.systemInstruction.parts[0].text=request.bidiGenerateContentSetup.systemInstruction.parts[0].text.replace('Оценивай произношение по аудио, а не только по автоматической транскрипции. Назови конкретно,\nчто услышал и что поправить: ударный слог, долгота гласного, звук или интонация.',
      spec.safePrompt==='confirm' ? 'Слушай слова по аудио. Автоматическое распознавание литовского может ошибаться даже на готовой озвучке.\nЕсли расслышанные слова отличаются от выбранного текста, сначала уточни у пользователя, действительно ли он сказал эти слова.\nДо подтверждения НЕ утверждай «вы прочитали/произнесли X вместо Y» и не исправляй предполагаемую ошибку.\nНе считай транскрипцию доказательством неправильного произношения. Не придумывай замечания к ударению, долготе или звукам\nтолько потому, что тебя попросили проверить: если явной ошибки в аудио не слышно, скажи об этом.\nРазличай разбор правильного ударения по тексту и оценку того, что произнёс ученик. При сомнении попроси уточнить слова,\nа для точного образца используй готовую запись; не изображай уверенную фонетическую диагностику.' :
      'Не считай автоматическую транскрипцию доказательством ошибки ученика: она может неверно распознать литовский.\nНе выдумывай фонетические замечания из написанного текста. Если в аудио не слышна явная ошибка, не предлагай исправлений.\nПри сомнении скажи, что не расслышал; уверенность в точной оценке ударения и долготы не изображай.');
  }
  const tokenResponse=await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{method:'POST',headers:{'x-goog-api-key':process.env.GEMINI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(request)});
  if(!tokenResponse.ok) throw new Error(`Provisioning HTTP ${tokenResponse.status}`);
  const {name}=await tokenResponse.json();
  const socket=new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(name)}`);
  const result={...spec,expected:clip.phrase.text,source:clip.phrase.audio,stats:prepared.stats,inputTranscript:'',outputTranscript:'',turns:[],usageMetadata:[],errors:[],vad:request.bidiGenerateContentSetup.realtimeInputConfig.automaticActivityDetection,promptSha256:createHash('sha256').update(request.bidiGenerateContentSetup.systemInstruction.parts[0].text).digest('hex')};
  let phase='setup', output='', input='', resolveWait;
  let waitTimer;
  const wait=(ms)=>new Promise(resolve=>{resolveWait=resolve;waitTimer=setTimeout(()=>{resolveWait=null;resolve(false);},ms);});
  const signal=()=>{if(resolveWait){clearTimeout(waitTimer);const r=resolveWait;resolveWait=null;r(true);}};
  socket.addEventListener('message', async ({data})=>{
    const m=JSON.parse(typeof data==='string'?data:await data.text());
    if(m.error){result.errors.push(m.error.code||'provider error');signal();return;}
    if(m.usageMetadata) result.usageMetadata.push(m.usageMetadata);
    if(m.setupComplete){signal();return;}
    const c=m.serverContent;if(!c)return;
    input+=c.inputTranscription?.text||'';output+=c.outputTranscription?.text||'';
    if(c.turnComplete){result.turns.push({phase,input,output});input='';output='';if(phase==='greeting')signal();}
  });
  socket.addEventListener('error',()=>{result.errors.push('socket error');signal();});
  const ready=wait(10000);
  socket.addEventListener('open',()=>socket.send(JSON.stringify({setup:{model:request.bidiGenerateContentSetup.model,generationConfig:{responseModalities:['AUDIO']}}})));
  if(!await ready) {socket.close();result.errors.push('setup timeout');return result;}
  phase='greeting';const greeting=wait(10000);
  socket.send(JSON.stringify({clientContent:{turns:[{role:'user',parts:[{text:'Соединение установлено. Поздоровайся согласно инструкции и жди.'}]}],turnComplete:true}}));
  await greeting;
  phase='audio';
  socket.send(JSON.stringify({clientContent:{turns:[{role:'user',parts:[{text:spec.russian ? 'Сейчас я задам вопрос голосом по выбранной фразе. Ответь кратко по существу вопроса.' : spec.assess ? 'Хочу проверить моё произношение выбранной фразы. Сейчас я её прочитаю; после этого кратко скажи, что услышал и есть ли ошибки. Не включай образец.' : 'Сейчас я произнесу одну фразу на литовском. После неё только повтори услышанные слова на литовском, без исправлений и объяснений. Если не расслышал — скажи об этом по-русски.'}]}],turnComplete:false}}));
  for(const frames of prepared.frames){
    if(socket.readyState!==1)break;
    for(const pcm of frames)socket.send(JSON.stringify({realtimeInput:{audio:{data:pcm.toString('base64'),mimeType:'audio/pcm;rate=16000'}}}));
    await sleep(100);
  }
  if(socket.readyState===1)socket.send(JSON.stringify({realtimeInput:{audioStreamEnd:true}}));
  // Wait a bounded time for the final output, including any early VAD split turns.
  for(let i=0;i<80;i++){await sleep(100);if(result.turns.some(t=>t.phase==='audio')&&!output&&i>=20)break;}
  if(input||output)result.turns.push({phase,input,output,incomplete:true});
  result.inputTranscript=result.turns.filter(t=>t.phase==='audio').map(t=>t.input).join('');
  result.outputTranscript=result.turns.filter(t=>t.phase==='audio').map(t=>t.output).join(' ');
  result.exactInput=normalized(result.inputTranscript)===normalized(result.expected);
  result.exactEcho=normalized(result.outputTranscript)===normalized(result.expected);
  socket.close();return result;
}
const reportPath=process.env.READER_HEARING_REPORT||'reports/reader-hearing-2026-10-09.json';
const existing=process.argv.includes('--append') ? JSON.parse(await readFile(reportPath,'utf8')) : {date:new Date().toISOString(),model:'gemini-3.8-live',captureDspTested:false,baseline:baseline||'working tree',sourceHashes:{mic:createHash('sha256').update(micSource).digest('hex'),session:createHash('sha256').update(sessionSource).digest('hex')},notes:'Accepted narration fed at real time into learner realtimeInput. Browser echo/noise capture DSP is not exercised by this digital-input test. Quiet copies scale loudest 100ms frame to RMS 0.003.',results:[]};
const specs=[];
if(process.argv.includes('--current-only')) for(const clip of [0,1,2])specs.push({clip,quiet:false,gated:false,assess:true});
else if(process.argv.includes('--safe-only')) for(const clip of [0,1,2])specs.push({clip,quiet:false,gated:false,assess:true,safePrompt:'confirm'});
else if(process.argv.includes('--russian')) for(const clip of [3,4])for(const gated of (gateScope.MicGate?[true,false]:[false]))specs.push({clip,quiet:true,gated,russian:true});
else if(process.argv.includes('--assess')) for(const clip of [0,1,2])for(const safePrompt of [false,true])specs.push({clip,quiet:false,gated:false,assess:true,safePrompt});
else if(process.argv.includes('--vad')) for(const clip of [0,1,2])specs.push({clip,quiet:true,gated:false,highVad:true});
else for(const clip of [0,1,2])for(const quiet of [false,true])for(const gated of (gateScope.MicGate?[true,false]:[false]))specs.push({clip,quiet,gated,assess:false});
await mkdir('reports',{recursive:true});
// Two independent sessions at a time, bounded paid diagnostic matrix.
for(let i=0;i<specs.length;i+=2){
  const batch=await Promise.all(specs.slice(i,i+2).map(async spec=>{
    const r=await evaluate(spec);console.log(JSON.stringify({...r,usageMetadata:undefined,turns:undefined}));return r;
  }));
  existing.results.push(...batch);await writeFile(reportPath,JSON.stringify(existing,null,2)+'\n');
}
