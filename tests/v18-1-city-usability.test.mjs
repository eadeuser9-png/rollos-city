import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {newMind, experience, renewCuriosity} from '../cloudflare/mind.js';
import worker from '../cloudflare/worker.js';

function envAndDb(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
 const adapter={prepare(sql){const st=db.prepare(sql);let args=[];const query={bind(...values){args=values;return query},async first(){return st.get(...args)||null},async all(){return {results:st.all(...args)}},async run(){const r=st.run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};return query}};
 return {db,env:{DB:adapter,SITE_ORIGIN:'https://rollo.example'}};
}

test('a discovery no longer consumes large amounts of curiosity',()=>{
 const s={day:1,hour:10,minute:20,actions:4,curiosity:74,mind:newMind()};
 const d={topic:'gears',link:'workshop',idea:'A gear spun.',question:'Could it spin another gear?'};
 const result=experience(s,d,'workshop',()=>.99);
 assert.ok(result.excited);
 assert.ok(s.curiosity>=74,`curiosity should not plunge after discovering gears; got ${s.curiosity}`);
 assert.equal(s.mind.curiosityTrait,92);
});

test('an older depleted curiosity meter recovers toward the stable trait without locking at 100',()=>{
 const s={mind:newMind(),curiosity:7};
 const a=renewCuriosity(s,2);assert.ok(a>=50);
 const b=renewCuriosity(s,30);assert.ok(b>65&&b<95);
 const c=renewCuriosity(s,120);assert.ok(c>=b&&c<=92);
 assert.equal(s.mind.curiosityTrait,92);
});

test('loading an existing state rebases only the legacy curiosity resource',async()=>{
 const {db,env}=envAndDb();
 const old={version:13,day:4,hour:12,minute:30,x:5,z:10,curiosity:7,mind:newMind(),notes:[{text:'I remember the station',when:'Day 3'}]};
 db.prepare('INSERT INTO world_state(id,payload,updated_at) VALUES(1,?,1)').run(JSON.stringify(old));
 const result=await worker.fetch(new Request('https://example.org/state'),env);
 const world=await result.json();
 assert.ok(world.curiosity>=50);
 assert.equal(world.day,4);
 assert.deepEqual(world.notes,old.notes);
 assert.equal(world.x,5);
});

test('the streets show named buildings and an accessible places directory',()=>{
 const js=readFileSync(new URL('../site/streets.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../site/streets.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../site/streets.css',import.meta.url),'utf8');
 assert.match(html,/id="town-places"/);
 assert.match(html,/id="town-place-list"/);
 assert.match(js,/NEIGHBORHOOD_BUILDINGS/);
 assert.match(js,/plaque\(p\.x,p\.z,p\.name/);
 assert.match(js,/maxLabels/);
 assert.match(js,/button\.addEventListener\('click'/);
 assert.match(js,/cameraLookAt\(dest\.x/);
 assert.match(css,/\.town-roster\{position:absolute;top:130px/);
 assert.ok(html.indexOf('<aside class="town-roster"')>html.indexOf('</div>\n<aside class="town-roster"'));
});
