import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {allowCheckoutUrl} from '../cloudflare/shop.js';
import worker from '../cloudflare/worker.js';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const n of ['schema.sql','schema_v10.sql','schema_v12.sql','schema_v13.sql','schema_v17.sql'])sql.exec(readFileSync(new URL('../cloudflare/'+n,import.meta.url),'utf8'));
 sql.prepare('INSERT INTO rollo_creations (title,topic,svg,stamp,created_at) VALUES (?,?,?,?,?)').run('Rooftop City','architecture','<svg xmlns="http://www.w3.org/2000/svg"/>','Day 2 · 15:10',Date.now());
 const DB={prepare(q){const stmt=sql.prepare(q);let args=[];const o={bind(...xs){args=xs;return o},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){const r=stmt.run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};return o;}};
 const env={DB,AI_THOUGHTS:'false',LIBRARY_DISABLE_AUTO_IMPORT:'true',AI_DECISIONS:'false',AI_FORUM_REPLIES:'false',VISITOR_SUBMISSIONS:'false',SITE_ORIGIN:'https://rollo.example',WORLD_ADMIN_TOKEN:'private-owner-token'};
 async function call(path,{method='GET',body,auth=false,origin='https://rollo.example'}={}){const headers={Origin:origin};if(auth)headers.Authorization='Bearer '+env.WORLD_ADMIN_TOKEN;if(body)headers['Content-Type']='application/json';const r=await worker.fetch(new Request('https://server.example'+path,{method,headers,body:body?JSON.stringify(body):undefined}),env);return {status:r.status,data:await r.json()};}
 return {call,DB};
}
test('shop links must be HTTPS URLs from a supported merchant',()=>{
 assert.ok(allowCheckoutUrl('https://buy.stripe.com/test_123'));
 assert.ok(allowCheckoutUrl('https://payhip.com/b/aB12'));
 assert.ok(allowCheckoutUrl('https://gumroad.com/l/myprint'));
 for(const x of ['javascript:alert(1)','http://buy.stripe.com/test','https://buy.stripe.com.evil.test/xyz','https://evil.test','https://attacker:pw@buy.stripe.com/a'])assert.equal(allowCheckoutUrl(x),false,x);
});
test('a visitor cannot add shop listings or read private drafts',async()=>{
 const {call}=fixture();
 assert.equal((await call('/owner/shop')).status,401);
 assert.equal((await call('/owner/shop/1',{method:'POST',body:{status:'active',price_cents:550,checkout_url:'https://buy.stripe.com/test_123'}})).status,401);
 const state=await call('/shop');assert.equal(state.status,200);assert.equal(state.data.listings.length,0);
});
test('owner can publish trusted listings and unlist safely',async()=>{
 const {call}=fixture();
 const data={status:'active',price_cents:850,checkout_url:'https://buy.stripe.com/test_123',description:'Physical art print delivered by seller'};
 assert.equal((await call('/owner/shop/1',{method:'POST',auth:true,origin:'https://attacker.test',body:data})).status,403);
 assert.equal((await call('/owner/shop/1',{method:'POST',auth:true,body:{...data,checkout_url:'https://evil.test'}})).status,400);
 assert.equal((await call('/owner/shop/99',{method:'POST',auth:true,body:data})).status,404);
 assert.equal((await call('/owner/shop/1',{method:'POST',auth:true,body:data})).status,200);
 let listing=(await call('/shop')).data.listings;assert.equal(listing.length,1);assert.equal(listing[0].price_cents,850);
 assert.equal((await call('/owner/shop/1',{method:'POST',auth:true,body:{status:'draft'}})).status,200);
 assert.equal((await call('/shop')).data.listings.length,0);
 assert.equal((await call('/owner/shop',{auth:true})).data.artworks[0].status,'draft');
});
