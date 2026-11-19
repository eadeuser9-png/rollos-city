import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {creatorApi,maybeInitiateCreatorMessage,_test} from '../cloudflare/creator.js';
import {libraryApi,ownerTextUploadIsValid,readAtLibrary} from '../cloudflare/library.js';

function rig(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of ['schema_v17.sql','schema_v21.sql','schema_v22.sql'])sqlite.exec(readFileSync(new URL('../cloudflare/'+name,import.meta.url),'utf8'));
 const DB={prepare(sql){const q=sqlite.prepare(sql);let args=[];
  const result={bind(...v){args=v;return result},async first(){return q.get(...args)||null},async all(){return {results:q.all(...args)}},async run(){const r=q.run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};
  return result;
 }};
 const env={DB,WORLD_ADMIN_TOKEN:'test-secret',OWNER_TOKEN:'secondary-token',SITE_ORIGIN:'https://rollo.example',LIBRARY_DISABLE_AUTO_IMPORT:'true'};
 async function call(url,body,{token='test-secret',origin='https://rollo.example'}={}){
  const method=body===undefined?'GET':'POST';
  const headers={'Authorization':`Bearer ${token}`,'Origin':origin,'Content-Type':'application/json'};
  const req=new Request('https://worker.example'+url,{method,headers,body:method==='POST'?JSON.stringify(body):undefined});
  const out=url.startsWith('/owner/creator')?await creatorApi(req,env,new URL(req.url),{getState:async()=>({mind:{interests:{}},notes:[],activity:'At home'})}):await libraryApi(req,env,new URL(req.url));
  return {status:out.status,data:await out.json()};
 }
 return {sqlite,env,call};
}
test('owner text uploads accept non-Gutenberg sources and multiple small texts without collisions',async()=>{
 const {sqlite,call}=rig();
 const text='A real open licensed book about transportation. '.repeat(14);
 assert.equal(ownerTextUploadIsValid({title:'Transit systems',text}),true);
 assert.equal(ownerTextUploadIsValid({title:'Transit systems',text:'no'}),false);
 assert.equal(ownerTextUploadIsValid({title:'Transit systems',text:'x'.repeat(1500001)}),false);
 const a=await call('/admin/library/upload',{title:'Transit systems',author:'Other author',tags:'city transit',text});
 const b=await call('/admin/library/upload',{title:'Open lectures',author:'Unknown',tags:'physics',text});
 assert.equal(a.status,201);assert.equal(b.status,201);
 assert.equal(a.data.bookId,-1);assert.equal(b.data.bookId,-2);
 const rows=sqlite.prepare('SELECT id,source_url,book_text FROM library_books WHERE id<0 ORDER BY id DESC').all();
 assert.deepEqual(rows.map(x=>x.id),[-1,-2]);
 assert.equal(rows[0].source_url,'');assert.equal(rows[0].book_text,text);
 const shelf=await call('/library/books');
 assert.equal(shelf.status,200);assert.ok(shelf.data.books.some(x=>x.id===-1&&x.ready===1));
 assert.ok(shelf.data.books.some(x=>x.id===1874));
 assert.ok(!JSON.stringify(shelf.data).includes(text));
});
test('owner books are readable at an independent library visit',async()=>{
 const {env,call}=rig();
 const text='Books that describe bridges, trains and the city are useful. '.repeat(70);
 assert.equal((await call('/admin/library/upload',{title:'A transit book',tags:'city transit',text})).status,201);
 const s={day:1,hour:12,minute:0,skill:{reading:0},thought:'',activity:''};
 const r=await readAtLibrary(env,s,{stamp:()=>'Day 1',interests:[{topic:'city transit'}]});
 assert.equal(r.read,true);assert.equal(r.book,'A transit book');
 assert.equal(s.lastReading.bookId,-1);assert.equal(s.skill.reading,1);
});
test('the owner can message repeatedly; the system does not apply visitor cooldown',async()=>{
 const {sqlite,call}=rig();
 const profile=await call('/owner/creator/profile',{nickname:'Creator',context:'Interested in books'});
 assert.equal(profile.status,200);
 for(let i=0;i<3;i++){
  const r=await call('/owner/creator/messages',{body:`I wanted to share item ${i}.`});
  assert.equal(r.status,201);assert.equal(r.data.choice,'not_available');
 }
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM creator_messages WHERE sender='owner'").get().n,3);
 assert.equal((await call('/owner/creator')).data.messages.length,3);
 assert.equal((await call('/owner/creator')).data.visitorDailyLimitApplies,false);
});
test('public visitors cannot impersonate the creator or upload books',async()=>{
 const {call}=rig();
 assert.equal((await call('/owner/creator',{foo:'bar'},{token:'fake'})).status,401);
 assert.equal((await call('/owner/creator/messages',{body:'Hello'},{token:'fake'})).status,401);
 assert.equal((await call('/admin/library/upload',{title:'Unauthorized',text:'x'.repeat(500)},{token:'fake'})).status,401);
 assert.equal((await call('/owner/creator/messages',{body:'Hello'},{origin:'https://other.example'})).status,403);
 assert.equal((await call('/admin/library/upload',{title:'Wrong origin',text:'x'.repeat(500)},{origin:'https://other.example'})).status,403);
});
test('Rollo may choose to ignore a creator message or reply based on available AI',async()=>{
 const {sqlite,env,call}=rig();
 env.AI={async run(){return {response:JSON.stringify({choice:'ignore',message:''})}}};
 let r=await call('/owner/creator/messages',{body:'hello'});
 assert.equal(r.status,201);assert.equal(r.data.choice,'ignore');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM creator_messages').get().n,1);
 env.AI.run=async()=>({response:JSON.stringify({choice:'reply',message:'I found a question about the library.'})});
 r=await call('/owner/creator/messages',{body:'Have you read anything?'});
 assert.equal(r.data.choice,'reply');
 assert.equal(r.data.reply.sender,'rollo');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM creator_messages').get().n,3);
});
test('Rollo can independently ask the owner a new question without making purchases',async()=>{
 const {sqlite,env}=rig();
 env.AI={async run(){return {response:JSON.stringify({choice:'message',message:'Could you recommend a book about railway signals?'})}}};
 const s={actions:5,mind:{interests:{},discoveries:[]},topics:['railway signals'],notes:[],activity:'Finished reading a chapter',thought:'I have another question.'};
 await maybeInitiateCreatorMessage(env,s,'library');
 assert.equal(sqlite.prepare('SELECT body FROM creator_messages').get().body,'Could you recommend a book about railway signals?');
 assert.equal(s.lastCreatorMessageAction,5);
 await maybeInitiateCreatorMessage(env,s,'library');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM creator_messages').get().n,1);
 assert.equal(_test.parseChoice('{"choice":"skip","message":""}',true).choice,'skip');
});
