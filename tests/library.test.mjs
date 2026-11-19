import test from 'node:test';import assert from 'node:assert/strict';
import {STARTER_BOOKS,findReadableStart,bookScore,clipPassage,ownerImportIsValid,libraryApi} from '../cloudflare/library.js';
test('four real Project Gutenberg starter titles with independent mirror URLs',()=>{
 assert.deepEqual(STARTER_BOOKS.map(b=>b.id),[1874,11,55,36]);
 assert.ok(STARTER_BOOKS.every(b=>/^[a-zA-Z0-9-]+_\d+$/.test(b.repo)&&b.file===`${b.id}.txt`));
});
test('reading starts after Project Gutenberg preface when present',()=>{
 const passage='Project Gutenberg filler\n*** START OF THE PROJECT GUTENBERG EBOOK ABC ***\nCHAPTER ONE\n';
 assert.equal(passage.slice(findReadableStart(passage)).trim(),'CHAPTER ONE');
 assert.equal(findReadableStart('Chapter I'),'0'*1);
});
test('reading picks relevant book topics rather than random fixed topic',()=>{
 const interests=[{topic:'city transit'},{topic:'mechanical linkages'}];
 assert.ok(bookScore(STARTER_BOOKS[0],interests,{sessions:0})>bookScore(STARTER_BOOKS[1],interests,{sessions:0}));
 assert.equal(bookScore(STARTER_BOOKS[0],interests,{finished_at:123}),-999);
});
test('passages advance by exact consumed characters',()=>{
 const data=('hello world here I am reading now. ').repeat(190);
 let position=0;const fragments=[];
 while(position<data.length){const part=clipPassage(data,position,300);assert.ok(part.end>position);fragments.push(part.text);position=part.end;}
 assert.equal(fragments.join(''),data);
});
test('import requires real text length and size, book metadata',()=>{
 const basic={id:1874,title:'The Railway Children',author:'E. Nesbit',text:'passage '.repeat(900)};
 assert.equal(ownerImportIsValid(basic),true);
 assert.equal(ownerImportIsValid({...basic,id:'../../etc'}),false);
 assert.equal(ownerImportIsValid({...basic,text:'a'.repeat(1500001)}),false);
 assert.equal(ownerImportIsValid({...basic,text:'too short'}),false);
});
test('search endpoint rejects too-short text without a network request',async()=>{
 const r=await libraryApi(new Request('https://example.com/library/search?q=a'),{},new URL('https://example.com/library/search?q=a'));
 assert.equal(r.status,400);assert.match(await r.text(),/at least two/);
});
test('owner endpoint must reject missing token',async()=>{
 const r=await libraryApi(new Request('https://example.com/admin/library/import',{method:'POST'}),{OWNER_TOKEN:'secret'},new URL('https://example.com/admin/library/import'));
 assert.equal(r.status,401);
});

test('a full imported Gutenberg text can be read across visits with real persistent history',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {readFileSync}=await import('node:fs');
 const {readAtLibrary}=await import('../cloudflare/library.js');
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../cloudflare/schema_v17.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../cloudflare/schema_v22.sql',import.meta.url),'utf8'));
 const DB={prepare(q){const stmt=sqlite.prepare(q);let args=[];const x={bind(...v){args=v;return x},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){const result=stmt.run(...args);return {meta:{changes:result.changes,last_row_id:Number(result.lastInsertRowid)}}}};return x;}};
 const env={DB,OWNER_TOKEN:'abc',LIBRARY_DISABLE_AUTO_IMPORT:'true',AI_DECISIONS:'false',AI_THOUGHTS:'false'};
 const original='*** START OF THE PROJECT GUTENBERG EBOOK THE RAILWAY CHILDREN ***\n'+('The engine moved gently along the railway tracks, passing towns and hills. ').repeat(220);
 const imported=await libraryApi(new Request('https://worker.example/admin/library/import',{method:'POST',headers:{Authorization:'Bearer abc','Content-Type':'application/json'},body:JSON.stringify({id:1874,title:'The Railway Children',author:'E. Nesbit',tags:'railway,city transit',text:original})}),env,new URL('https://worker.example/admin/library/import'));
 assert.equal(imported.status,201);
 const s={day:2,hour:14,minute:36,skill:{reading:0},activity:'',thought:''};
 const options={stamp:()=>'Day 2 · 14:36',interests:[{topic:'city transit'}]};
 const first=await readAtLibrary(env,s,options);assert.equal(first.read,true);assert.equal(first.book,'The Railway Children');
 const firstOffset=s.lastReading.position;assert.ok(firstOffset>1000);assert.equal(s.skill.reading,1);
 const second=await readAtLibrary(env,s,options);assert.equal(second.read,true);assert.ok(s.lastReading.position>firstOffset);assert.equal(s.skill.reading,2);
 const h=await libraryApi(new Request('https://worker.example/library/history'),env,new URL('https://worker.example/library/history'));
 assert.equal(h.status,200);const history=(await h.json()).entries;assert.equal(history.length,2);
 assert.equal(history[0].offset_start,history[1].offset_end);
 assert.equal(history[1].thought_source,'basic');assert.match(history[1].excerpt,/engine moved/);
 const shelfResponse=await libraryApi(new Request('https://worker.example/library/books'),env,new URL('https://worker.example/library/books'));
 const all=(await shelfResponse.json()).books;
 assert.ok(all.some(b=>b.id===1874&&b.sessions===2&&b.position>0));
});
