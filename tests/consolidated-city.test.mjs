import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CITY_PLACES as cloud} from '../cloudflare/world-data.js';
import {CITY_PLACES as site} from '../site/world-data.js';
import {walkingRoute,advanceWalkingRoute,WALK_UNITS_PER_SIM_MINUTE} from '../cloudflare/movement.js';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('one shared expanded city keeps every original location and new district in sync',()=>{
 assert.deepEqual(cloud,site);
 assert.equal(cloud.length,13);
 for(const id of ['home','garden','library','bar','forum','market','alley','workshop','station','pino','grove','park','square'])assert.ok(cloud.some(p=>p.id===id),id);
 assert.deepEqual(cloud.find(x=>x.id==='bar'),{id:'bar',name:'The Copper Tap',x:3.1,z:6.3,kind:'bar',w:2.4,d:1.75,h:1.8,description:'The Copper Tap is Rollo’s favorite social spot. He relaxes and chats with regulars here. No shifts or wages.'});
});
test('route from the old neighborhood to the new station walks, never teleports',()=>{
 let from={x:2.2,z:2.1},dest=cloud.find(p=>p.id==='station');
 let route=walkingRoute(from,dest),steps=0;
 while(route.length&&steps<70){const a=advanceWalkingRoute(from,route,2*WALK_UNITS_PER_SIM_MINUTE);assert.ok(Math.hypot(a.x-from.x,a.z-from.z)<2*WALK_UNITS_PER_SIM_MINUTE+.001);from=a;route=a.route;steps++;}
 assert.equal(route.length,0);assert.equal(from.x,dest.x);assert.equal(from.z,dest.z);
});
test('new public city has interactive walk/overview/follow controls without steering Rollo',()=>{
 const scene=read('site/streets.js'),html=read('site/streets.html'),home=read('site/index.html');
 for(const x of ['requestAnimationFrame','currentTravel','advanceWalkingRoute','squirrelPos','canvas.addEventListener(\'pointermove\'','pointerdown','WALK_UNITS_PER_SIM_MINUTE','data-walk']) assert.ok((scene+html).includes(x),x);
 assert.match(scene,/independent visitor camera/);assert.match(scene,/const blocked=CITY_PLACES/);
 assert.match(html,/Walk streets/);assert.match(html,/Town overview/);assert.match(html,/Follow Rollo/);
 assert.match(home,/streets\.html\?embed=1/);
});
test('combined project retains creative AI, real book reading, and wallet safeguards',()=>{
 const w=read('cloudflare/worker.js');
 assert.match(w,/createRolloArtwork\(env,s,topic/);
 assert.match(w,/readAtLibrary\(env,s/);
 assert.match(w,/walletApi\(request,env,url\)/);
 assert.match(w,/marketApi\(request,env,url\)/);
 assert.match(read('cloudflare/spending-guard.js'),/REAL_PURCHASES_ENABLED/);
 assert.match(read('cloudflare/schema_v18.sql'),/CREATE TABLE IF NOT EXISTS art_ai_diagnostics/);
 assert.doesNotMatch(w,/earned 8 coins|Worked 2 simulated hours/);
});
