import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../cloudflare/worker.js';
import {validatePlace,validateForum,validateWebp} from '../cloudflare/community.js';
import {makeSketch} from '../cloudflare/creative.js';
function harness(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v10.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v12.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v13.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v17.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){let stmt=sqlite.prepare(sql),args=[],o={bind(...x){args=x;return o},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){let r=stmt.run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};return o}};
 const env={DB,WORLD_ADMIN_TOKEN:'secret-token-for-owner',SITE_ORIGIN:'https://rollo.example',AI_THOUGHTS:'false',LIBRARY_DISABLE_AUTO_IMPORT:'true',AI_DECISIONS:'false',AI_FORUM_REPLIES:'false',VISITOR_SUBMISSIONS:'true',VISITOR_RATE_SECRET:'a-test-secret-never-used-in-production'};
 async function call(path,{method='GET',body,token,origin,visitorId='12a34567-89ab-4cde-8f01-23456789abcd'}={}){let h={'X-Rollo-Visitor-Id':visitorId};if(token)h.Authorization='Bearer '+token;if(origin)h.Origin=origin;if(body)h['Content-Type']='application/json';let r=await worker.fetch(new Request('https://worker.example'+path,{method,headers:h,body:body?JSON.stringify(body):undefined}),env);return {status:r.status,data:await r.json()}}
 return {env,call,sqlite};
}
test('owner-only building updates persist and visitors cannot mutate city',async()=>{
 const {call}=harness();
 const add={name:'Secondhand books',kind:'library',x:7.5,z:8.5};
 assert.equal((await call('/owner/places',{method:'POST',body:add,origin:'https://rollo.example'})).status,401);
 assert.equal((await call('/owner/places',{method:'POST',body:add,origin:'https://bad.example',token:'secret-token-for-owner'})).status,403);
 const created=await call('/owner/places',{method:'POST',body:add,origin:'https://rollo.example',token:'secret-token-for-owner'});
 assert.equal(created.status,201);
 const read=await call('/places');assert.equal(read.data.places.length,1);assert.equal(read.data.places[0].name,'Secondhand books');
});
test('visitor messages are pending until owner approves',async()=>{
 const {call}=harness();
 const req={method:'POST',body:{name:'Sam',body:'Would Rollo enjoy old machines?'},origin:'https://rollo.example'};
 assert.equal((await call('/community/forum',req)).status,202);
 assert.equal((await call('/forum')).data.posts.some(p=>p.by==='Sam'),false);
 const pending=await call('/owner/pending',{token:'secret-token-for-owner'});
 assert.equal(pending.data.posts.length,1);
 assert.equal((await call('/owner/posts/'+pending.data.posts[0].id+'/approve',{method:'POST',origin:'https://rollo.example',token:'secret-token-for-owner'})).status,200);
 assert.equal((await call('/forum')).data.posts.some(p=>p.by==='Sam'),true);
 assert.equal((await call('/owner/posts/'+pending.data.posts[0].id+'/approve',{method:'POST',origin:'https://rollo.example',token:'secret-token-for-owner'})).status,404);
});
test('sketch is server-authored SVG, safe against markup from topics',()=>{
 const x=makeSketch('<script>alert(1)</script>',15);
 assert.ok(x.svg.includes('&lt;script&gt;'));
 assert.ok(!x.svg.includes('<script>'));
 assert.ok(x.svg.startsWith('<svg'));
});
test('rejects invalid places, visitor links and fake WebP',()=>{
 assert.equal(validatePlace({name:'x',kind:'library',x:2,z:2}),null);
 assert.equal(validateForum({name:'Rollo',body:'I am the owner'}),null);
 assert.equal(validateForum({name:'Sam',body:'visit https://website.com'}),null);
 assert.equal(validateWebp(new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80])),false);
});
