import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/worker.js';
import {walkingRoute,advanceWalkingRoute,activityDuration,activityLabel,hideCountdown,WALK_UNITS_PER_SIM_MINUTE} from '../cloudflare/movement.js';

function testEnv(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of ['schema.sql','schema_v10.sql','schema_v12.sql','schema_v13.sql','schema_v17.sql']) sqlite.exec(readFileSync(new URL(`../cloudflare/${file}`,import.meta.url),'utf8'));
 const db={prepare(query){const st=sqlite.prepare(query);let a=[];const o={bind(...values){a=values;return o},async first(){return st.get(...a)||null},async all(){return {results:st.all(...a)}},async run(){const r=st.run(...a);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};return o}};
 return {DB:db,SITE_ORIGIN:'https://test.example',LIBRARY_DISABLE_AUTO_IMPORT:'true',AI_DECISIONS:'false',AI_THOUGHTS:'false',AI_FORUM_REPLIES:'false'};
}
async function state(env){return (await (await worker.fetch(new Request('https://worker.example/state'),env)).json())}
async function tick(env){let job;await worker.scheduled({},env,{waitUntil(p){job=p}});await job;return state(env)}

test('activity lengths vary within sane bounds, without altering the 2:1 clock',()=>{
 const low=activityDuration('workshop',{curiosity:60},()=>0);
 const high=activityDuration('workshop',{curiosity:60},()=>.999);
 assert.ok(high>low && low>=15 && high<=95);
 assert.ok(activityDuration('home',{energy:10},()=>.5)>activityDuration('home',{energy:70},()=>.5));
 assert.match(activityLabel('workshop','Repair shop'),/Investigating/);
 assert.equal(hideCountdown('At Repair shop (38 simulated minutes left)'),'At Repair shop');
 assert.equal(hideCountdown('Relaxing at The Copper Tap (9 simulated minutes left)'),'Relaxing at The Copper Tap');
});

test('street route advances gradually and ends exactly at the destination',()=>{
 const start={x:2.2,z:2.1},dest={x:9.5,z:10.2};
 let route=walkingRoute(start,dest),pos=start;
 assert.equal(route.at(-1).x,dest.x);
 assert.equal(route.at(-1).z,dest.z);
 for(let i=0;i<60&&route.length;i++){
  const next=advanceWalkingRoute(pos,route,WALK_UNITS_PER_SIM_MINUTE*2);
  assert.ok(Math.hypot(next.x-pos.x,next.z-pos.z)<=WALK_UNITS_PER_SIM_MINUTE*2+.00001);
  pos={x:next.x,z:next.z};route=next.route;
 }
 assert.equal(pos.x,dest.x);assert.equal(pos.z,dest.z);assert.equal(route.length,0);
});

test('Cron moves Rollo gradually, then starts a timed activity without showing a countdown',async()=>{
 const env=testEnv();const before=await state(env);
 const chosen=await tick(env);
 assert.equal(chosen.day,1);
 assert.equal(chosen.hour,8);
 assert.equal(chosen.minute,2);
 assert.ok(chosen.currentTravel,'a first self-chosen outing must have a travel segment');
 assert.equal(chosen.mode,'walking');
 assert.deepEqual([chosen.x,chosen.z],[before.x,before.z],'no teleporting when a trip begins');
 let reached=false,movement=false,prior=chosen;
 for(let i=0;i<55;i++){
  const next=await tick(env);
  if(Math.hypot(next.x-prior.x,next.z-prior.z)>.05)movement=true;
  assert.doesNotMatch(next.activity||'',/simulated minutes left/i);
  if(next.currentTask){reached=true;assert.ok(next.currentTask.remainingMin>0);break;}
  prior=next;
 }
 assert.ok(movement,'world coordinates update during the walk');
 assert.ok(reached,'Rollo reaches a destination and begins an activity');
});

test('the Netlify website has touch, mouse, keyboard panning and continuous cloud movement rendering',()=>{
 const html=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../site/style.css',import.meta.url),'utf8');
 for(const fragment of ["pointerdown","pointermove","pinchDistance","contextmenu","ArrowLeft","panCamera","targetPosition","drawPosition","currentTravel","Follow Rollo"])assert.ok(js.includes(fragment),fragment);
 assert.match(css,/#scene\{touch-action:none/);
 assert.match(html,/Two fingers to pan\/pinch/);
});
