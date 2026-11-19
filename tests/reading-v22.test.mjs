import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {libraryApi,readAtLibrary} from '../cloudflare/library.js';

function setup(aiReplies){
 const db=new DatabaseSync(':memory:');
 for(const name of ['schema_v17.sql','schema_v22.sql'])db.exec(readFileSync(new URL(`../cloudflare/${name}`,import.meta.url),'utf8'));
 const DB={prepare(sql){const statement=db.prepare(sql);let params=[];const bound={bind(...a){params=a;return bound},async first(){return statement.get(...params)||null},async all(){return {results:statement.all(...params)}},async run(){const r=statement.run(...params);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};return bound;}};
 const env={DB,WORLD_ADMIN_TOKEN:'secret',SITE_ORIGIN:'https://rollo.test',LIBRARY_DISABLE_AUTO_IMPORT:'true',AI_DECISIONS:'true',AI_THOUGHTS:'true',AI:{async run(){return {response:aiReplies.shift()};}}};
 async function upload(){let request=new Request('https://worker.test/admin/library/upload',{method:'POST',headers:{Origin:'https://rollo.test',Authorization:'Bearer secret','Content-Type':'application/json'},body:JSON.stringify({title:'An owner book',author:'Writer',tags:'railways',text:'The railway locomotive uses wheels on steel rails. The locomotive follows the curved line. '.repeat(45)})});return libraryApi(request,env,new URL(request.url));}
 const s={day:2,hour:11,minute:20,skill:{reading:0}};
 return {db,env,s,upload};
}
test('sourced observation is saved only if its quoted evidence occurs in actual passage',async()=>{
 const a=setup(['-1',JSON.stringify({thought:'I noticed the railway locomotive details.',question:'Why do trains use steel rails?',observation:'This document describes a locomotive following the line.',topic:'railways',evidence:'The locomotive follows the curved line.'})]);
 assert.equal((await a.upload()).status,201);
 assert.equal((await readAtLibrary(a.env,a.s,{stamp:()=> 'Day 2',interests:[]})).read,true);
 const rows=a.db.prepare('SELECT observation,evidence,topic FROM reading_insights').all();
 assert.equal(rows.length,1);assert.equal(rows[0].topic,'railways');
 assert.equal(a.s.readingInsights.length,1);
 assert.ok(a.s.mind.interests.railways.exposures>=1,'reading changes emerging interest profile');
 const out=await libraryApi(new Request('https://worker.test/library/history'),a.env,new URL('https://worker.test/library/history'));
 assert.equal((await out.json()).entries[0].insight_evidence,rows[0].evidence);
});
test('a fabricated quote does not become a learned insight',async()=>{
 const a=setup(['-1',JSON.stringify({thought:'I noticed a railway detail in the chapter.',question:'Why would a railway need signals?',observation:'The train crossed a bridge made from golden glass.',topic:'railways',evidence:'made from golden glass'})]);
 assert.equal((await a.upload()).status,201);
 await readAtLibrary(a.env,a.s,{stamp:()=> 'Day 2',interests:[]});
 assert.equal(a.db.prepare('SELECT COUNT(*) c FROM reading_insights').get().c,0);
 assert.equal(a.db.prepare('SELECT COUNT(*) c FROM reading_history').get().c,1);
 assert.equal(a.s.readingInsights,undefined);
});
test('Rollo can skip a library visit without fabricating history',async()=>{
 const a=setup(['SKIP']);
 assert.equal((await a.upload()).status,201);
 const result=await readAtLibrary(a.env,a.s,{stamp:()=> 'Day 2',interests:[]});
 assert.equal(result.read,false);assert.equal(result.choice,'skip');
 assert.equal(a.db.prepare('SELECT COUNT(*) c FROM reading_history').get().c,0);
 assert.equal(a.s.skill.reading,0);
});
