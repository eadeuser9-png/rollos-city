import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../cloudflare/worker.js';
import {newMind} from '../cloudflare/mind.js';
import {normalizeSocialEvent,evaluateSocialAttention,rememberSocialMoment,validateSocialChoice} from '../cloudflare/social.js';

const schema=n=>readFileSync(new URL(`../cloudflare/${n}`,import.meta.url),'utf8');
function rig(aiResponse=null){
 const sqlite=new DatabaseSync(':memory:');
 for(const n of ['schema.sql','schema_v10.sql','schema_v12.sql','schema_v13.sql','schema_v17.sql','schema_v18.sql','schema_v19.sql'])sqlite.exec(schema(n));
 const DB={prepare(sql){const q=sqlite.prepare(sql);let args=[];const stmt={bind(...values){args=values;return stmt},async first(){return q.get(...args)||null},async all(){return {results:q.all(...args)}},async run(){const result=q.run(...args);return {meta:{changes:result.changes,last_row_id:Number(result.lastInsertRowid)}}}};return stmt;}};
 const env={DB,SITE_ORIGIN:'https://rollo.example',VISITOR_RATE_SECRET:'test-random-secret',OWNER_TOKEN:'owner',WORLD_ADMIN_TOKEN:'admin',AI_FORUM_REPLIES:aiResponse===null?'false':'true',AI:aiResponse===null?undefined:{async run(_model,{messages}){env.lastMessages=messages;return {response:typeof aiResponse==='function'?aiResponse(messages):aiResponse};}}};
 async function api(path,{method='GET',body,headers={}}={}){return worker.fetch(new Request('https://brain.example'+path,{method,body,headers:{Origin:'https://rollo.example',...headers}}),env)}
 async function queueForum({body='Could you investigate why gears move?',author='Sam',kind='forum',visitor='hash-of-browser'}={}){
  const state=await (await api('/state')).json();
  let sourceId=1,contributionId=1;
  if(kind==='forum'){
   const p=sqlite.prepare('INSERT INTO visitor_posts(name,body,status,created_at) VALUES (?,?,?,?)').run(author,body,'approved',Date.now());contributionId=Number(p.lastInsertRowid);
   const f=sqlite.prepare('INSERT INTO forum_posts(author,body,stamp,created_at) VALUES (?,?,?,?)').run(author,body,'Day 1 · 08:00',Date.now());sourceId=Number(f.lastInsertRowid);
  }else{
   const p=sqlite.prepare('INSERT INTO visitor_photos(name,caption,object_key,status,created_at) VALUES (?,?,?,?,?)').run(author,body,'photo-key','approved',Date.now());contributionId=Number(p.lastInsertRowid);sourceId=contributionId;
  }
  sqlite.prepare('INSERT INTO rollo_contributor_links(kind,submission_id,visitor_key) VALUES (?,?,?)').run(kind,contributionId,visitor);
  state.currentTask={action:'forum',kind:'forum',name:'Forum',remainingMin:1};state.pending=[{kind,author,body,sourceId,contributionId}];state.hunger=0;state.energy=75;
  sqlite.prepare('UPDATE world_state SET payload=? WHERE id=1').run(JSON.stringify(state));
  let done;await worker.scheduled({},env,{waitUntil(p){done=p;}});await done;
  return (await (await api('/state')).json());
 }
 return {sqlite,env,api,queueForum};
}
test('social attention uses acquired interests, not fixed topic favorites',()=>{
 const state={day:1,hour:10,minute:3,mind:newMind()};
 const event={kind:'forum',author:'Sam',body:'Have you ever investigated gears and mechanical linkages?'};
 assert.equal(evaluateSocialAttention(state,event).relatedTopics.length,0);
 state.mind.interests['mechanical linkages']={score:78,exposures:5};
 assert.ok(evaluateSocialAttention(state,event).relatedTopics.includes('mechanical linkages'));
 const memory=rememberSocialMoment(state,event,'ignored','not now');assert.equal(memory.decision,'ignored');assert.equal(state.socialMoments[0].author,'Sam');
});
test('only valid opted-in model JSON can cause a public forum response',()=>{
 assert.equal(validateSocialChoice('{"choice":"ignore","reply":"","reason":"not now"}').choice,'ignore');
 assert.equal(validateSocialChoice('{"choice":"reply","reply":"","reason":""}'),null);
 assert.equal(validateSocialChoice('{"choice":"reply","reply":"Visit https://evil.example","reason":""}'),null);
 assert.equal(validateSocialChoice('{"choice":"decline","reply":"This is not something I want to explore.","reason":""}').choice,'decline');
});
test('without AI Rollo records a post but never sends a canned automatic reply',async()=>{
 const {sqlite,queueForum,api}=rig();const s=await queueForum();
 assert.equal(s.socialMoments[0].decision,'ignored');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM forum_posts WHERE author='Rollo'").get().n,0);
 assert.equal(sqlite.prepare('SELECT decision FROM rollo_social_memories LIMIT 1').get().decision,'ignored');
 assert.equal(s.pending.length,0);
 assert.ok(!JSON.stringify(s).includes('hash-of-browser'));
 assert.equal((await (await api('/health')).json()).release,'23-community-book-suggestions');
});
test('an AI can independently ignore a forum post',async()=>{
 const {sqlite,queueForum,env}=rig(JSON.stringify({choice:'ignore',reply:'',reason:'Not in the mood to discuss this'}));
 const state=await queueForum();
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM forum_posts WHERE author='Rollo'").get().n,0);
 assert.equal(state.socialMoments[0].decision,'ignored');
 assert.ok(env.lastMessages[0].content.includes('NOT obligated'));
});
test('an AI can reply in grounded language, and remember returning pseudonymous contributors',async()=>{
 const {sqlite,queueForum,env}=rig(JSON.stringify({choice:'reply',reply:'I want to understand how those gears turn together. Have you tried different sizes?',reason:'Mechanical interest'}));
 const state=await queueForum({visitor:'hashed-browser-1'});
 assert.equal(state.socialMoments[0].decision,'replied');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM forum_posts WHERE author='Rollo'").get().n,1);
 assert.equal(sqlite.prepare('SELECT visitor_key FROM rollo_social_memories LIMIT 1').get().visitor_key,'hashed-browser-1');
 assert.ok(!JSON.stringify(state).includes('hashed-browser-1'));
 await queueForum({body:'Here is another idea about gears',visitor:'hashed-browser-1'});
 assert.ok(env.lastMessages[1].content.includes('personalHistory'));
 assert.ok(env.lastMessages[1].content.includes('I want to understand')===false); // previous contribution, not Rollo's response
 assert.ok(env.lastMessages[1].content.includes('Could you investigate why gears move?'));
});
test('approved photo memory stores caption but never claims to inspect image pixels or post a reply',async()=>{
 const {sqlite,queueForum}=rig(JSON.stringify({choice:'reply',reply:'I see a great squirrel in your image.',reason:'wrong'}));
 const state=await queueForum({kind:'photo',body:'A squirrel beside a tree',visitor:'hashed-photo-browser'});
 assert.equal(state.socialMoments[0].kind,'photo');assert.equal(state.socialMoments[0].decision,'considered');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM forum_posts WHERE author='Rollo'").get().n,0);
 assert.equal(sqlite.prepare('SELECT excerpt FROM rollo_social_memories LIMIT 1').get().excerpt,'A squirrel beside a tree');
 assert.ok(state.thought.includes('not examined'));
});
test('invalid model output does not produce a generic reply',async()=>{
 const {sqlite,queueForum}=rig('Yes absolutely! Thanks for the idea!');
 const state=await queueForum();
 assert.equal(state.socialMoments[0].decision,'ignored');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM forum_posts WHERE author='Rollo'").get().n,0);
});

test('Rollo may create a provisional investigation from a conversation without treating claims as facts',async()=>{
 const {queueForum}=rig(JSON.stringify({choice:'reply',reply:'Gear ratios sound worth exploring. What changes when the gears differ in size?',reason:'A new question',topic:'gear ratios',question:'How does size affect gear speed?'}));
 const state=await queueForum({body:'The ratio of gear teeth changes rotational speed'});
 assert.ok(state.mind.interests['gear ratios'].score>=8);
 assert.equal(state.mind.hypotheses['gear ratios'].confidence,10);
 assert.equal(state.mind.hypotheses['gear ratios'].idea,'How does size affect gear speed?');
 assert.equal(state.socialMoments[0].decision,'replied');
});

test('moderation preserves pseudonymous identity links without exposing keys in public state',async()=>{
 const {sqlite,api,env}=rig();env.VISITOR_SUBMISSIONS='true';
 const visitorId='42a3e15f-8935-4a86-8b1e-e4b74a7a1b8a';
 const submitted=await api('/community/forum',{method:'POST',headers:{'Content-Type':'application/json','X-Rollo-Visitor-Id':visitorId},body:JSON.stringify({name:'Sam',body:'I found a strange shape in the garden.'})});
 assert.equal(submitted.status,202);
 const row=sqlite.prepare('SELECT id FROM visitor_posts LIMIT 1').get();
 const saved=sqlite.prepare("SELECT visitor_key FROM rollo_contributor_links WHERE kind='forum' AND submission_id=?").get(row.id);
 assert.ok(saved.visitor_key.startsWith('v11:'));
 const approved=await api(`/owner/posts/${row.id}/approve`,{method:'POST',headers:{Authorization:'Bearer admin'}});
 assert.equal(approved.status,200);
 const world=await (await api('/state')).json();
 assert.equal(world.pending[0].contributionId,row.id);
 assert.equal(world.pending[0].author,'Sam');
 assert.ok(!JSON.stringify(world).includes(saved.visitor_key));
});
