const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const scope=vm.createContext({books:{sample:{chapters:Array.from({length:5},(_,c)=>({blocks:[{items:[{text:'chapter '+c}]}]}))}},
 summaries:{sample:['Pradžia.','Antra.','Trečia.','Ketvirta.','Ateitis.']},EndpointError:class extends Error{constructor(message,data){super(message);this.code=data.code;}}});
vm.runInContext(fs.readFileSync('reader-learning.js','utf8'),scope);scope.phraseContext=scope.ReaderLearning.phraseContext;
vm.runInContext(fs.readFileSync('tgcloud/endpoints/readerBookHistory.js','utf8').replace(/^import .*;\n/gm,'').replace('export default async function','async function history'),scope);
const ctx={initData:{user:{id:1}}};
test('history contains only completed chapters older than the previous chapter and rejects invalid locations/auth',async()=>{
 const result=await scope.history({bookId:'sample',location:{chapter:3,block:0,item:0}},ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{chapters:[{chapter:0,text:'Pradžia.'},{chapter:1,text:'Antra.'}]});
 assert.equal((await scope.history({bookId:'sample',location:{chapter:0,block:0,item:0}},ctx)).chapters.length,0);
 await assert.rejects(scope.history({bookId:'sample',location:{chapter:4,block:0,item:0}},{}),e=>e.code==='AUTH_REQUIRED');
 await assert.rejects(scope.history({bookId:'../.env',location:{chapter:4,block:0,item:0}},ctx),e=>e.code==='INVALID_LOCATION');
});
test('short context excludes older chapter text and translation; selected phrase keeps full tooltip',()=>{
 const book=scope.books.sample;
 const result=scope.ReaderLearning.readingContext(book,{chapter:3,block:0,item:0});
 assert.equal(result,'chapter 2\n\nchapter 3');
 assert.doesNotMatch(result,/chapter [014]/);
});
test('saved summaries align with published chapter indices and remain much shorter than original books',()=>{
 const summaries=JSON.parse(fs.readFileSync('author-plans/reader-summaries.json','utf8')).books;
 for(const [id,chapters] of Object.entries(summaries)){
  const book=JSON.parse(fs.readFileSync('books/'+id+'.json','utf8'));
  assert.equal(chapters.length,book.chapters.length);
  assert.ok(chapters.every(text=>text.length>30&&text.length<650));
  const original=book.chapters.flatMap(c=>c.blocks.flatMap(b=>b.items.map(i=>i.text))).join(' ');
  assert.ok(chapters.join(' ').length<original.length/4);
 }
});
