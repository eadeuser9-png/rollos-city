import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../cloudflare/worker.js';
const ONE_DAY=86_400_000;
const ID='42a3e15f-8935-4a86-8b1e-e4b74a7a1b8a';
const OTHER='72c0b341-3397-4abd-a949-b6f387c05d53';
function rig(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../cloudflare/schema_v10.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v12.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v13.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v17.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){const q=sqlite.prepare(sql);let args=[];const b={bind(...values){args=values;return b},async first(){return q.get(...args)||null},async all(){return {results:q.all(...args)}},async run(){const r=q.run(...args);return {meta:{changes:r.changes}}}};return b}};
 const PHOTOS={async put(){},async delete(){},async get(){return null}};
 const env={DB,PHOTOS,VISITOR_RATE_SECRET:'unit-test-secret',WORLD_ADMIN_TOKEN:'private',SITE_ORIGIN:'https://rollo.example',VISITOR_SUBMISSIONS:'true'};
 const call=async(path,{method='GET',body,headers={},visitorId=ID}={})=>{
  const h={Origin:'https://rollo.example','X-Rollo-Visitor-Id':visitorId,...headers};
  let res=await worker.fetch(new Request('https://brain.example'+path,{method,headers:h,body}),env);
  return {status:res.status,data:await res.json()};
 };
 const post=async(visitorId=ID)=>call('/community/forum',{method:'POST',visitorId,headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Sam',body:'Could you investigate what old machines do?'})});
 return {sqlite,env,call,post};
}
test('one forum message is allowed and the second is blocked for 24 real hours',async()=>{
 const {post}=rig();const a=await post();assert.equal(a.status,202);assert.ok(a.data.nextAllowedAt>Date.now()+ONE_DAY-2000);
 const b=await post();assert.equal(b.status,429);assert.ok(b.data.retryAfterSeconds>86000);
});
test('forum and photo share the same one interaction per 24h allowance',async()=>{
 const {post,call}=rig();assert.equal((await post()).status,202);
 const result=await call('/community/photos',{method:'POST',headers:{'Content-Type':'image/webp','X-Visitor-Name':'Sam','X-Photo-Caption':'A tiny machine'},body:readFileSync(new URL('./tiny.webp',import.meta.url))});
 assert.equal(result.status,429);
});
test('the limit expires after 24 real hours and is independent of Rollo simulated time',async()=>{
 const {post,sqlite,call}=rig();assert.equal((await post()).status,202);
 sqlite.prepare('UPDATE visitor_limits SET last_at=?').run(Date.now()-ONE_DAY-20);
 assert.equal((await call('/community/limit')).data.allowed,true);
 assert.equal((await post()).status,202);
 assert.equal((await call('/community/limit')).data.allowed,false);
});
test('a separate browser identity has its own allowance and owner actions are not throttled',async()=>{
 const {post,call}=rig();assert.equal((await post()).status,202);assert.equal((await post(OTHER)).status,202);
 const state=await call('/state');assert.equal(state.status,200);
 const places=await call('/places');assert.equal(places.status,200);
});
test('unidentified or improperly configured visitor requests cannot bypass the limit',async()=>{
 const {post,call,env}=rig();
 const missing=await post('bad-id');assert.equal(missing.status,400);
 delete env.VISITOR_RATE_SECRET;
 const unavailable=await post();assert.equal(unavailable.status,503);
});
test('photo submission, if valid, uses the same allowance as subsequent forum submissions',async()=>{
 const {call,post}=rig();
 const r=await call('/community/photos',{method:'POST',headers:{'Content-Type':'image/webp','X-Visitor-Name':'Sam','X-Photo-Caption':'An interesting rock'},body:readFileSync(new URL('./tiny.webp',import.meta.url))});
 assert.equal(r.status,202);
 assert.equal((await post()).status,429);
});
