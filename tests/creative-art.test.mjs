import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSketch,createRolloArtwork,validateArtPlan,renderArtPlan,parseArtResponse} from '../cloudflare/creative.js';
const valid={title:'The delicate prism',subject:'Light breaks into color',idea:'I wonder where the colors go.',style:'watercolor',palette:'sea',marks:[
  {kind:'prism',x:150,y:150,size:70,tone:1},{kind:'sun',x:350,y:70,size:33},{kind:'wave',x:330,y:220,size:48},
  {kind:'star',x:320,y:155,size:22},{kind:'bird',x:70,y:87,size:24},{kind:'circle',x:210,y:255,size:43},{kind:'spiral',x:410,y:290,size:30}
]};
test('AI-directed design produces its own marks, palette, layout, and title',async()=>{
 const env={AI:{run:async(_model,args)=>{assert.match(args.messages[0].content,/actual drawing/);return {choices:[{message:{content:JSON.stringify(valid)}}]}}}};
 const art=await createRolloArtwork(env,{mind:{discoveries:[]},artHistory:[],day:4},'color and light',221);
 assert.equal(art.source,'ai'); assert.equal(art.aiStatus,'success');
 assert.equal(art.title,'The delicate prism');assert.equal(art.palette,'sea');assert.match(art.svg,/prism|<path/);assert.ok(art.svg.includes('Light breaks into color'));
});
test('different model plans yield different visible compositions',()=>{
 const a=validateArtPlan(valid,'color and light'),b=validateArtPlan({...valid,style:'blueprint',palette:'midnight',marks:valid.marks.map((m,i)=>({...m,x:m.x+20,y:m.y-20}))},'color and light');
 assert.notEqual(renderArtPlan(a),renderArtPlan(b));
});
test('fallback drawings vary across topics and across seeds',()=>{
 const a=makeSketch('color and light',101),b=makeSketch('shapes and balance',101),c=makeSketch('color and light',102);
 assert.notEqual(a.svg,b.svg);assert.notEqual(a.svg,c.svg);
 assert.ok(a.marks.some(m=>m.kind==='prism'));assert.ok(b.marks.some(m=>m.kind==='gear'));
});
test('model failure uses accurate procedural fallback without blocking saving',async()=>{
 const error=await createRolloArtwork({AI:{run:async()=>{throw Error('network broken')}}},{},'local history',44);
 assert.equal(error.source,'procedural');assert.equal(error.aiStatus,'error');
 const invalid=await createRolloArtwork({AI:{run:async()=>({response:'not json'})}},{},'food preservation',45);
 assert.equal(invalid.source,'procedural');assert.equal(invalid.aiStatus,'invalid');
 const disabled=await createRolloArtwork({AI_ARTWORK:'false',AI:{run:async()=>{throw Error('must not call')}}},{},'garden',52);
 assert.equal(disabled.aiStatus,'disabled');
});
test('invalid and injected shapes cannot write arbitrary SVG',()=>{
 const attack={...valid,title:'<script>alert(1)</script>',marks:[{...valid.marks[0],kind:'<image onerror=alert(1)>'},...valid.marks]};
 const cleaned=validateArtPlan(attack,'x');assert.ok(cleaned);
 const svg=renderArtPlan(cleaned);
 assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('onerror'));
 assert.ok(!svg.includes('<image'));
 assert.ok(parseArtResponse('text before\n```json\n'+JSON.stringify(valid)+'\n```','garden'));
});
