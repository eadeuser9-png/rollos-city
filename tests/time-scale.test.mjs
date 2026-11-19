import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../cloudflare/worker.js';
import {TIME as SERVER_TIME} from '../cloudflare/world-data.js';
import {TIME as CLIENT_TIME} from '../site/world-data.js';

const env=()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v10.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v12.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v13.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v17.sql',import.meta.url),'utf8'));
 return {DB:{prepare(q){const stmt=sqlite.prepare(q);let args=[];const obj={bind(...v){args=v;return obj},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){const r=stmt.run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};return obj}},SITE_ORIGIN:'https://rollo.example',LIBRARY_DISABLE_AUTO_IMPORT:'true',AI_DECISIONS:'false',AI_FORUM_REPLIES:'false',AI_THOUGHTS:'false'};
};
const state=async e=>(await (await worker.fetch(new Request('https://worker.example/state'),e)).json());
const once=async e=>{let work;await worker.scheduled({},e,{waitUntil(p){work=p}});await work};

test('web and cloud share a 12-real-hour Rollo day (2:1)',()=>{
 assert.equal(SERVER_TIME.simMinutesPerRealMinute,2);
 assert.equal(CLIENT_TIME.simMinutesPerRealMinute,2);
 assert.equal(CLIENT_TIME.realSecondsPerSimMinute,30);
 assert.equal(24*60/2,720); // 720 real minutes = 12 hours per simulated day
 assert.equal(120/2,60);   // 2-hour Rollo shift = 60 real minutes
});

test('60 one-minute Cloudflare triggers advance exactly two simulated hours',async()=>{
 const e=env();let a=await state(e);
 for(let i=0;i<60;i++)await once(e);
 let b=await state(e);
 const elapsed=(b.day-a.day)*1440+(b.hour-a.hour)*60+(b.minute-a.minute);
 assert.equal(elapsed,120);
 assert.equal(b.day,1);
 assert.equal(b.hour,10);
 assert.equal(b.minute,0);
 assert.ok(b.hunger<100,'Hunger should not max out just because we slowed the clock');
});
