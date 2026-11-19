import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {printStore} from '../cloudflare/print-store.js';
const src=fs.readFileSync(new URL('../site/streets.js',import.meta.url),'utf8');
test('street Rollo has real stride and blink tied to movement',()=>{
 assert.match(src,/blinkHeight\(performance\.now\(\)\)/);
 assert.match(src,/walkDistance\+=moved/);
 assert.match(src,/rolloMoving=moved>/);
});
test('catalog routes reject unauthorized mutations without accessing database',async()=>{
 const r=await printStore(new Request('https://example.workers.dev/owner/print-store/42/sync',{method:'POST'}),{WORLD_ADMIN_TOKEN:'secret',SITE_ORIGIN:'https://example.netlify.app'},new URL('https://example.workers.dev/owner/print-store/42/sync'));
 assert.equal(r.status,401);
});
test('product sync stays disabled without explicit opt-in',async()=>{
 const env={WORLD_ADMIN_TOKEN:'secret',SITE_ORIGIN:'https://example.netlify.app',DB:{prepare(sql){return {bind(){return {first:async()=>({id:2,title:'Test art',topic:'shapes'})}}}}}};
 const req=new Request('https://example.workers.dev/owner/print-store/2/sync',{method:'POST',headers:{Authorization:'Bearer secret',Origin:env.SITE_ORIGIN}});
 const r=await printStore(req,env,new URL(req.url));assert.equal(r.status,403);
 assert.match((await r.json()).error,/disabled/);
});
test('mobile street UI reserves badge-safe bottom and text wrap',()=>{
 const css=fs.readFileSync(new URL('../site/streets.css',import.meta.url),'utf8');
 assert.match(css,/Netlify floating UI/);
 assert.match(css,/overflow-wrap:anywhere/);
});
