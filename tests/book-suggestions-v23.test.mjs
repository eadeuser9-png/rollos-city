import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {bookSuggestionApi,validateSuggestion} from '../cloudflare/book-suggestions.js';

function setup(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of ['schema_v10.sql','schema_v17.sql','schema_v23.sql']){
  sqlite.exec(readFileSync(new URL(`../cloudflare/${name}`,import.meta.url),'utf8'));
 }
 const DB={prepare(sql){const q=sqlite.prepare(sql);let args=[];const stmt={bind(...items){args=items;return stmt},async first(){return q.get(...args)||null},async all(){return {results:q.all(...args)}},async run(){const r=q.run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};return stmt;}};
 const env={DB,OWNER_TOKEN:'owner-secret',WORLD_ADMIN_TOKEN:'admin-secret',SITE_ORIGIN:'https://rollo.example',VISITOR_SUBMISSIONS:'true',VISITOR_RATE_SECRET:'test-visitor-rate-secret'};
 const makeReq=(path,{method='GET',body,origin='https://rollo.example',token='',visitor='38e3f7a1-53b9-4cf4-941b-d3f68bf667c2'}={})=>new Request('https://brain.example'+path,{method,headers:{Origin:origin,'Content-Type':'application/json','X-Rollo-Visitor-Id':visitor,...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const call=(path,opts={})=>bookSuggestionApi(makeReq(path,opts),env,new URL('https://brain.example'+path));
 return {sqlite,DB,env,call};
}
const nomination={title:'The Railway Children',author:'E. Nesbit',reason:'Rollo seems interested in trains and railway stations.',source_url:'https://example.org/railway'};

test('visitor book suggestions validate titles and refuse insecure or malicious source URLs',()=>{
 assert.equal(validateSuggestion(nomination).title,'The Railway Children');
 assert.equal(validateSuggestion({...nomination,source_url:'http://example.com'}),null);
 assert.equal(validateSuggestion({...nomination,source_url:'https://user:pass@example.com'}),null);
 assert.equal(validateSuggestion({...nomination,source_url:'https://example.com/#private'}),null);
 assert.equal(validateSuggestion({...nomination,title:'A'}),null);
 assert.equal(validateSuggestion({...nomination,reason:''}),null);
});

test('suggestion stays private, requires owner approval, and cannot create a readable book by itself',async()=>{
 const {sqlite,call}=setup();
 const denied=await call('/library/suggestions',{method:'POST',body:nomination,origin:'https://other.example'});
 assert.equal(denied.status,403);
 const created=await call('/library/suggestions',{method:'POST',body:nomination});assert.equal(created.status,202);
 assert.equal((await created.json()).status,'pending');
 assert.equal(sqlite.prepare('SELECT status FROM book_suggestions').get().status,'pending');
 assert.equal((await (await call('/library/suggestions')).json()).approved.length,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM library_books').get().n,0);
 assert.equal((await call('/admin/library/suggestions')).status,401);
 const queue=await call('/admin/library/suggestions',{token:'admin-secret'});
 assert.equal(queue.status,200);const row=(await queue.json()).suggestions[0];
 assert.equal(row.reason,nomination.reason);
 const unauth=await call(`/admin/library/suggestions/${row.id}/approve`,{method:'POST'});assert.equal(unauth.status,401);
 const wrongOrigin=await call(`/admin/library/suggestions/${row.id}/approve`,{method:'POST',token:'admin-secret',origin:'https://other.example'});assert.equal(wrongOrigin.status,403);
 const approved=await call(`/admin/library/suggestions/${row.id}/approve`,{method:'POST',token:'admin-secret'});assert.equal(approved.status,200);
 const list=await call('/library/suggestions');assert.equal((await list.json()).approved[0].readable,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM library_books').get().n,0);
 assert.equal((await call(`/admin/library/suggestions/${row.id}/approve`,{method:'POST',token:'admin-secret'})).status,409);
 sqlite.prepare("INSERT INTO library_books(id,title,author,tags,source_url,book_text,chars,added_at) VALUES(?,?,?,?,?,?,?,?)")
   .run(-1,nomination.title,nomination.author,'trains','',('train '.repeat(1000)),6000,Date.now());
 const ready=(await (await call('/library/suggestions')).json()).approved[0];assert.equal(ready.readable,1);
});

test('book suggestions share existing visitor 24-hour cooldown with other contributions',async()=>{
 const {call,sqlite}=setup();
 const first=await call('/library/suggestions',{method:'POST',body:nomination});assert.equal(first.status,202);
 assert.ok((await first.json()).nextAllowedAt>Date.now());
 const next=await call('/library/suggestions',{method:'POST',body:{...nomination,title:'An Amazing Other Book'}});assert.equal(next.status,429);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM book_suggestions').get().n,1);
 // A different browser ID can submit but does not get any owner privileges.
 const other=await call('/library/suggestions',{method:'POST',body:{...nomination,title:'Another Book About Cities'},visitor:'48e3f7a1-53b9-4cf4-941b-d3f68bf667c2'});
 assert.equal(other.status,202);
});

test('rejected book suggestions are never published and no visitor can approve them',async()=>{
 const {call,sqlite}=setup();
 const created=await call('/library/suggestions',{method:'POST',body:nomination});assert.equal(created.status,202);
 const denied=await call('/admin/library/suggestions/1/reject',{method:'POST',token:'admin-secret'});assert.equal(denied.status,200);
 assert.equal((await (await call('/library/suggestions')).json()).approved.length,0);
 assert.equal(sqlite.prepare('SELECT status FROM book_suggestions').get().status,'rejected');
});
