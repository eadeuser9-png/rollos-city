import {blinkHeight,walkPose} from './rollo-animation.js';
import {newMind,upgradeMind,pickDiscovery,experience,curiosityDestination,passTime,refreshInterests,rankedInterests,publicReflection,chooseWander,renewCuriosity} from './mind.js';
import {CITY_PLACES, TIME} from './world-data.js';
import {activityDuration,activityLabel,hideCountdown,advanceWalkingRoute,WALK_UNITS_PER_SIM_MINUTE} from './movement.js';
import {ensureGarden,gardenNewDay,gardenHarvest,maybeResearchGarden} from './garden.js';
import {normalizeSocialEvent,rememberSocialMoment} from './social.js';
(()=>{'use strict';
const $=id=>document.getElementById(id), canvas=$('scene'), g=canvas.getContext('2d');
const WORLD=CITY_PLACES.map(p=>({...p}));
const byId=id=>WORLD.find(p=>p.id===id);const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));const rand=a=>Math.floor(Math.random()*a);
const initial=()=>({version:13,customPlaces:[],day:1,hour:8,minute:0,x:2.1,z:3.9,goal:null,mode:'deciding',timer:0,speed:1,pantry:2,emergencyFood:2,gardenSupply:4,mealsToday:0,lastDailyResetDay:1,hunger:28,energy:76,curiosity:83,barReputation:2,skill:{investigation:0,engineering:0,reading:0,communication:0},topics:[],interests:{},mind:newMind(),visits:{},notes:[],forum:[{id:1,by:'Rollo',body:'A bar, a rooftop garden, and streets I have never explored. I wonder what I will learn here.',when:'Day 1 · 08:00'}],pending:[],thought:'There must be more to this city than what I already know.',lastForum:0,lastSave:Date.now(),actions:0});
let walletDisplay='$0.00',s=initial(),paused=false,remote=false,remoteDesired=!!(window.ROLLO_BACKEND_URL||'').trim(),last=performance.now(),redrawTime=0,screen={w:900,h:600,dpr:1,unit:28,focus:null,zoom:2.9,mode:'follow',panX:0,panY:0},hudTimer=0;
let drawPosition={x:s.x,z:s.z},drawFacing=1,remoteFetchedAt=performance.now(),cloudPositionReady=false;
const followPosition=()=>({x:drawPosition.x,z:drawPosition.z});
const targetPosition=()=>{
 if(remote && s.currentTravel?.route?.length){
  // Visual prediction only: the Worker remains authoritative for all decisions and positions.
  const elapsedMin=Math.min(0.95,Math.max(0,(performance.now()-remoteFetchedAt)/60000));
  const distance=elapsedMin*TIME.simMinutesPerRealMinute*WALK_UNITS_PER_SIM_MINUTE;
  const prediction=advanceWalkingRoute({x:s.x,z:s.z},s.currentTravel.route,distance);
  return {x:prediction.x,z:prediction.z};
 }
 return {x:s.x,z:s.z};
};
const KEY='ferns-city-world-v3';if(!remoteDesired){try{let saved=JSON.parse(localStorage.getItem(KEY));if(saved&&([3,4,5,6,7,8,9,13].includes(saved.version))){s={...initial(),...saved,version:13,mind:upgradeMind(saved.mind)};delete s.coins;delete s.barEarnings;delete s.workMinutesToday;ensureGarden(s);if(saved.version===3)s.lastDailyResetDay=s.day;}}catch(e){}}

function rebuildPlaces(){
 WORLD.splice(0,WORLD.length,...CITY_PLACES.map(p=>({...p})));
 for(const p of s.customPlaces||[]){if(p&&typeof p.id==='string'&&p.id.startsWith('added-')&&typeof p.name==='string'&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&CITY_PLACES.length<30&& !WORLD.some(t=>t.id===p.id))WORLD.push({...p});}
}
rebuildPlaces();
ensureGarden(s);
s.curiosity=Math.max(50,clamp(Number(s.curiosity)||50));
// Existing v6 sessions may have been in an instant action state. Restart that single activity safely.
if(['acting','engaged'].includes(s.mode)){s.mode='deciding';s.timer=0;s.goal=null;s.route=[];}
if(!Number.isFinite(s.minute))s.minute=0;

function stamp(){return `Day ${s.day} · ${String(Math.floor(s.hour)).padStart(2,'0')}:${String(Math.floor(s.minute)).padStart(2,'0')}`}
function note(msg){s.notes.unshift({text:msg,when:stamp()});s.notes=s.notes.slice(0,70)}
function thought(t){s.thought=t}
function addForum(by,body){s.forum.push({id:(s.forum[s.forum.length-1]?.id||0)+1,by,body,when:stamp()});s.forum=s.forum.slice(-35)}
function learn(topic,skill,explanation){s.skill[skill]=(s.skill[skill]||0)+1;if(!s.topics.includes(topic))s.topics.push(topic);note(`Explored ${topic}: ${explanation}`)}
function discovery(place){let d=pickDiscovery(s,place);if(!d)return null;let result=experience(s,d,place);learn(d.topic,d.skill,d.idea);if(result.excited){s.activity=`Fascinated by ${d.topic} · planning a follow-up`;note(`A new spark: ${d.topic} (${result.response}/100).`);}return result;}

function newDay(){refreshInterests(s);s.mealsToday=0;s.lastDailyResetDay=s.day;gardenNewDay(s);note('A new day begins. My rooftop planters are growing enough vegetables for my meals.')}
function advanceHours(hours){s.minute+=hours*60;while(s.minute>=60){s.minute-=60;s.hour++;if(s.hour>=24){s.hour=0;s.day++;newDay()}}}
function choose(){
 if(s.energy<24){travel('home');return}
 if(s.hunger>50){if(s.pantry>0||s.emergencyFood>0){travel('home');return}travel('garden');return}
 if(s.pending.length){travel('forum');return}
 if(s.pantry<2){travel('garden');return}
 let next=curiosityDestination(s,['library','workshop','garden','alley','forum']);if(next){travel(next);return}
 let options=['library','workshop','forum','bar','market','alley','garden','station','pino','grove','park','square',...WORLD.filter(p=>p.id.startsWith('added-')).map(p=>p.id)];travel(chooseWander(s,options));
}
function travel(id){
 const p=byId(id);if(!p)return;
 s.goal=id;s.mode='walking';
 // A simple three-segment street route through the main east/west street.
 // This avoids drawing a diagonal straight through the entire neighborhood.
 s.route=[{x:s.x,z:5.15},{x:p.x,z:5.15},{x:p.x,z:p.z}].filter(v=>Number.isFinite(v.x)&&Number.isFinite(v.z));
 s.activity=`Walking to ${p.name}`;
 thought(({home:'I should check my supplies and rest.',garden:'Food grows on the rooftops. I can feed myself.',library:'The library might give me something new to investigate.',bar:'I might see familiar faces at The Copper Tap.',forum:'I wonder whether anyone has answered my last post.',market:'I might find a real-world object worth learning about.',alley:'I should look for useful things.',workshop:'I could learn to repair something today.'})[p.kind]||`I have not spent much time at ${p.name}.`)
}
function beginActivity(){
 const p=byId(s.goal);if(!p){s.mode='deciding';return}
 const kind=p.kind;
 const eat=(kind==='home'&&s.hunger>=35&&(s.pantry>0||s.emergencyFood>0));
 const duration=eat?activityDuration('garden',s):activityDuration(kind,s);
 s.mode='engaged';s.timer=duration*TIME.realSecondsPerSimMinute;
 s.activity=kind==='home'?(eat?'Preparing a meal':'Sleeping at the apartment'):
  kind==='bar'?'Relaxing and socializing at The Copper Tap':
  kind==='library'?`Reading at ${p.name}`:
  kind==='workshop'?`Investigating at ${p.name}`:activityLabel(kind,p.name);

}
function openBar(){return s.hour>=17&&s.hour<22}
function act(){const p=byId(s.goal);if(!p)return;s.visits[p.id]=(s.visits[p.id]||0)+1;s.actions++;let msg='';
switch(p.id){
case 'home':if(s.hunger>=35&&(s.pantry>0||s.emergencyFood>0)){
 let fromReserve=s.pantry===0;if(fromReserve)s.emergencyFood--;else s.pantry--;
 s.mealsToday++;s.hunger=clamp(s.hunger-55);
 msg=fromReserve?'He used one emergency meal to avoid going hungry.':'He cooked and ate one of his stored meals.';
 thought(fromReserve?'My emergency food is useful, but I should restock my pantry.':'I can feed myself without someone else managing my meals.');
 }else{s.energy=clamp(s.energy+48);msg='He slept at home and recovered energy.';thought('I can explore again after I rest.')}break;
case 'garden':{const harvest=gardenHarvest(s);msg=`He harvested ${harvest.meals} meals from ${harvest.crops.join(', ')}.`;thought('My rooftop garden supplies my food.');const research=maybeResearchGarden(s);if(research){note(`Looked up ${research.crop} care in an OSU Extension guide: ${research.finding}`);thought(`I chose to learn about ${research.crop}: ${research.finding}`);}break;}
case 'market':{msg='He browsed the market looking for interesting real-world objects.';thought('I would only wish for something that matches what I am curious about.');break;}
case 'alley':{discovery('alley');msg='He explored the backstreets and followed an interesting clue.';break;}
case 'bar':{s.barReputation++;s.energy=clamp(s.energy+2);if(Math.random()<.45)discovery('bar');msg='He spent time relaxing and chatting with regulars at The Copper Tap.';thought('It is nice to enjoy the bar without having to work.');break;}
case 'library':{let r=discovery('library');msg=`He investigated ${r?.topic||'a new idea'} at the city library.`;break}
case 'workshop':{let r=discovery('workshop');msg=`He experimented with ${r?.topic||'an old device'} in the repair shop.`;break}
case 'forum':{let incoming=s.pending.shift();if(incoming){
 const event=normalizeSocialEvent(incoming);
 rememberSocialMoment(s,event,event.kind==='photo'?'considered':'ignored',event.kind==='photo'?'Caption only; image pixels not inspected':'No autonomous AI connected in local preview');
 note(event.kind==='photo'?`Noticed a visitor photo caption from ${event.author}.`:`Read ${event.author}'s post without answering.`);
 msg=event.kind==='photo'?'He remembered a visitor photo caption.':'He read a post and chose not to reply.';
 thought(event.kind==='photo'?'A caption is not the same as seeing the picture.':'I do not need to answer every post.');
 }else{msg='He browsed the forum without posting.';thought('I can read and reflect without making a post.');}break;}
default:{let r=discovery(p.kind);msg=`He explored ${p.name}${r?.topic?' and wondered about '+r.topic:''}.`;thought(`There may be more to discover at ${p.name}.`);break;}
}note(msg);s.mode='waiting';s.timer=2.2+Math.random()*1.9;s.activity=msg; s.goal=null;s.route=[];save();}
function tick(dt){
 // 2 sim seconds per real second: 1 sim hour per 30 real minutes; 1 sim day per 12 real hours.
 const simMinutes=dt/TIME.realSecondsPerSimMinute;
 advanceHours(simMinutes/60);passTime(s,dt*.055*(TIME.simMinutesPerRealMinute/30));
 s.hunger=clamp(s.hunger+(simMinutes/60)*4.6);
 s.energy=clamp(s.energy-(simMinutes/60)*2.2);
 renewCuriosity(s,simMinutes);
 if(s.mode==='walking'){
  const p=byId(s.goal);if(!p){s.mode='deciding';return}
  const target=s.route?.[0]||{x:p.x,z:p.z};
  const d=Math.hypot(target.x-s.x,target.z-s.z),step=dt*.92;
  if(d>step){s.x+=(target.x-s.x)/d*step;s.z+=(target.z-s.z)/d*step}
  else {s.x=target.x;s.z=target.z;s.route?.shift();if(!s.route?.length)beginActivity()}
 }else if(s.mode==='engaged'){
  s.timer-=dt;
  if(s.timer<=0)act();
 }else if(s.mode==='waiting'){s.timer-=dt;if(s.timer<=0)s.mode='deciding'}
 else choose();
}
function save(){if(remote)return;try{s.lastSave=Date.now();localStorage.setItem(KEY,JSON.stringify(s))}catch(e){}}
function text(sv){return String(sv??'')}
function el(tag,cls,contents){let e=document.createElement(tag);if(cls)e.className=cls;if(contents!==undefined)e.textContent=text(contents);return e}
function renderForum(){let list=$('messages');list.replaceChildren();for(let p of s.forum.slice(-10)){let wrapper=el('article','post'+(p.by==='You'?' user':''));let head=el('div','posthead');head.append(el('strong','',p.by==='Fern'?'Rollo':p.by),el('span','',p.when));wrapper.append(head,el('p','',p.body));list.append(wrapper);}list.scrollTop=list.scrollHeight}
function renderJournal(){let list=$('journal');list.replaceChildren();for(let n of upgradeMind(s.mind).journal.slice(0,45)){let entry=el('article','entry');let heading=el('div','journal-meta');heading.append(el('small','',n.when),el('span','journal-tag',n.kind==='spark'?'A spark of interest':'Reflection'));entry.append(heading,el('p','',n.text));list.append(entry)}if(!s.mind?.journal?.length)list.textContent='Rollo has not written a reflection yet. Watch him investigate something new.'}
// A visitor-facing, chronological explanation of Rollo's recorded observations.
// The UI derives from saved state, never fabricates a discovery.
function renderSocialMemories(){
 const target=$('socialmemories');if(!target)return;target.replaceChildren();
 const entries=Array.isArray(s.socialMoments)?s.socialMoments.slice(0,12):[];
 if(!entries.length){target.append(el('p','hinttext','No approved visitor contributions remembered yet.'));return;}
 for(const m of entries){
  const box=el('article','learning-item');
  box.append(el('strong','',`${m.author||'Visitor'} · ${m.kind==='photo'?'Photo caption':'Forum post'}`),el('small','',` ${m.when||''} · ${m.decision||'noticed'}`),el('p','',m.excerpt||''));
  target.append(box);
 }
}
function renderLearning(){
 const m=upgradeMind(s.mind),found=m.discoveries||[],active=m.focus,latest=found[0];
 $('learningcount').textContent=`${found.length} recorded observation${found.length===1?'':'s'}`;
 $('scene-teaser').textContent=active?.topic?`On his mind: ${active.topic}`:latest?.topic?`Lately: ${latest.topic}`:'Take a look around North Quay';
 $('learn-topics').textContent=Object.keys(m.interests||{}).length;
 $('learn-projects').textContent=(m.projects||[]).length;
 $('learn-revisions').textContent=Object.values(m.hypotheses||{}).reduce((n,h)=>n+(h.revisions||0),0);
 $('learningtopic').textContent=active?.topic||latest?.topic||'Still looking around';
 $('learningquestion').textContent=latest?.question||'Nothing has caught his eye yet.';
 $('learningnext').textContent=active?`Next: follow this question at the ${active.destination}.`:
    latest?'Next: Rollo may return to this question, or find a new one.':'Next: his first visit to a library, workshop, garden or backstreet.';
 const trail=$('learningtrail');trail.replaceChildren();
 if(!found.length){trail.append(el('p','hinttext','Rollo has not found anything to write about yet.'));return;}
 for(const d of found.slice(0,7)){
  const article=el('article','learning-item');
  const when=el('div','learning-when',d.when||`Day ${d.day} · ${d.place}`);
  const subject=el('strong','',d.topic);
  const observation=el('p','',d.idea);
  const question=el('p','learning-question',d.question);
  article.append(when,subject,observation,question);trail.append(article);
 }
}
function renderSkills(){
 const interestList=$('interests');interestList.replaceChildren();
 const ranked=rankedInterests(s,6);
 if(!ranked.length)interestList.append(el('p','hinttext','He’s still finding his favorites.'));
 for(const item of ranked){interestList.append(el('span','interest-tag',item.topic));}
 const focus=s.mind?.focus;
 $('focus').textContent=focus?`Rollo has been thinking about ${focus.topic}. He might visit the ${focus.destination} next.`:'He’ll find something to do soon.';
 const projects=$('projects');projects.replaceChildren();
 for(const project of s.mind?.projects||[])projects.append(el('p','mini-note',`${project.topic}: ${project.goal}`));
 if(!projects.children.length)projects.append(el('p','hinttext','Nothing on the go just yet.'));
 const theories=$('hypotheses');theories.replaceChildren();
 for(const [topic,belief] of Object.entries(s.mind?.hypotheses||{}).slice(-5))theories.append(el('p','mini-note',`${topic}: ${belief.idea}`));
 if(!theories.children.length)theories.append(el('p','hinttext','No questions written down yet.'));
 const skills=$('skills');skills.replaceChildren();
 for(const [name,experience] of Object.entries(s.skill||{})){if(experience>0)skills.append(el('span','interest-tag',name[0].toUpperCase()+name.slice(1)));}
 if(!skills.children.length)skills.append(el('p','hinttext','He’s just getting started.'));
 const concepts=$('concepts');concepts.replaceChildren();
 for(const topic of s.topics.slice(-20))concepts.append(el('span','concept',topic));
 if(!s.topics.length)concepts.textContent='No notes here yet.';
}

function renderGarden(){
 const garden=ensureGarden(s),target=$('garden-crops');if(!target)return;
 target.replaceChildren();
 const h=el('p','hinttext','On his rooftop: '+garden.beds.map(b=>b.name).join(', ')+'.');target.append(h);
 const last=garden.research?.[0];
 if(last){const p=el('p','hinttext',`One thing he looked up: ${last.finding} `);const a=el('a','',`Source: OSU Extension (${last.crop})`);a.href=last.source;a.target='_blank';a.rel='noopener noreferrer';p.append(a);target.append(p);}
 else target.append(el('p','hinttext','He hasn’t felt like looking up gardening tips yet.'));
}
function renderHUD(){let dt=Math.floor(s.hour),minutes=Math.floor(s.minute);$('daylight').textContent=`Day ${s.day} · ${String(dt).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;$('activity').textContent=hideCountdown(s.activity||'Choosing an activity');$('earnings').textContent=walletDisplay;$('food').textContent=`${s.pantry} meals + ${s.emergencyFood} reserve`;$('barstatus').textContent=`${s.mealsToday} meals eaten today`;renderGarden();$('hungern').textContent=Math.floor(s.hunger)+'%';$('hungerbar').style.width=s.hunger+'%';$('energyn').textContent=Math.floor(s.energy)+'%';$('energybar').style.width=s.energy+'%';$('curiosityn').textContent=Math.floor(s.curiosity)+'%';$('curiositybar').style.width=s.curiosity+'%';$('thought').textContent=s.thought;$('excitementn').textContent=Math.round(s.mind?.excitement||0)+'%';$('excitementbar').style.width=Math.round(s.mind?.excitement||0)+'%';renderForum();renderJournal();renderSkills();renderLearning();renderSocialMemories()}
function fit(){let r=canvas.getBoundingClientRect();screen.w=r.width;screen.h=r.height;screen.dpr=Math.min(window.devicePixelRatio||1,1.5);canvas.width=Math.round(r.width*screen.dpr);canvas.height=Math.round(r.height*screen.dpr);g.setTransform(screen.dpr,0,0,screen.dpr,0,0);screen.unit=Math.min(screen.w/22,screen.h/12.4)}
function iso(x,z,h=0){let u=screen.unit;return {x:screen.w*.52+(x-z)*u*.9,y:screen.h*.53+(x+z-12)*u*.44-h*u}}
function polygon(points,color,stroke=null){g.beginPath();g.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)g.lineTo(points[i].x,points[i].y);g.closePath();g.fillStyle=color;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=1;g.stroke()}}
function disk(x,y,rx,ry,color){g.beginPath();g.ellipse(x,y,Math.max(1,rx),Math.max(1,ry),0,0,2*Math.PI);g.fillStyle=color;g.fill()}
function cityBlock(x,z,w,d,h,front,top,side){let a=iso(x,z,h),b=iso(x+w,z,h),c=iso(x+w,z+d,h),e=iso(x,z+d,h),be=iso(x+w,z,0),ce=iso(x+w,z+d,0),ee=iso(x,z+d,0);polygon([e,c,ce,ee],front);polygon([b,c,ce,be],side);polygon([a,b,c,e],top,'#e2ebdb24');return {a,b,c,e,be,ce,ee}}
function label(x,z,str,dy=0,em=11){const p=iso(x,z,dy),w=g.measureText(str).width+14;g.fillStyle='#35504fdc';g.beginPath();g.roundRect(p.x-w/2,p.y-12,w,21,5);g.fill();g.fillStyle='#f3f1e8';g.font=`600 ${em}px system-ui`;g.textAlign='center';g.fillText(str,p.x,p.y+2);g.textAlign='left'}
function building(p){let u=screen.unit,cols={home:['#9aaca7','#c0cbc0','#78918a'],garden:['#7e9c86','#a7bfa2','#688e77'],library:['#91a4a9','#bcc5c1','#718e91'],bar:['#a26f58','#c18e6b','#865b4c'],forum:['#6f9b9b','#a7c3bd','#548686'],market:['#b4a68b','#cebea2','#9c8e78'],alley:['#788e83','#9daf9d','#6f837b'],workshop:['#87998c','#b4bca7','#6c8175']}[p.kind]||['#82988c','#bbcbbe','#6a8177'];let b=cityBlock(p.x-p.w/2,p.z-p.d/2,p.w,p.d,p.h,...cols);
// Windows and facade features
if(['home','library','bar','workshop'].includes(p.kind)){for(let i=1;i<=3;i++){let t=i/4,xx=b.e.x+(b.c.x-b.e.x)*t,yy=b.e.y+(b.c.y-b.e.y)*t;disk(xx,yy-u*p.h*.48,u*.11,u*.17,p.kind==='bar'?'#f6bd6f':'#a1c5c2');}}
if(p.kind==='garden'){for(let i=0;i<5;i++){let pt=iso(p.x-.6+(i%3)*.5,p.z-.4+Math.floor(i/3)*.5,p.h+.12);disk(pt.x,pt.y,u*.21,u*.14,'#6d926f');disk(pt.x,pt.y-u*.07,u*.10,u*.09,'#bdd0a1')}}
if(p.kind==='bar'){let a=iso(p.x,p.z-.13,p.h+.19);g.font=`bold ${Math.max(9,Math.min(15,u*.43))}px system-ui`;g.fillStyle='#ffd095';g.textAlign='center';g.fillText('COPPER TAP',a.x,a.y);g.textAlign='start';disk(a.x-1,a.y+6,u*.77,u*.04,'#d38f5730')}
if(p.kind==='forum'){let v=iso(p.x,p.z,p.h+.32);g.fillStyle='#bde1d5';g.fillRect(v.x-u*.22,v.y-u*.3,u*.42,u*.36);g.fillStyle='#487e7d';g.fillRect(v.x-u*.15,v.y-u*.23,u*.28,u*.18)}
if(p.kind==='market'){for(let i=0;i<3;i++){let k=iso(p.x-.55+i*.49,p.z+.3,p.h+.12);disk(k.x,k.y,u*.20,u*.09,i%2?'#d7b476':'#9fbd81')}}
if(p.kind==='alley'){for(let i=0;i<3;i++){let k=iso(p.x-.55+i*.5,p.z, .35);disk(k.x,k.y,u*.18,u*.11,i%2?'#8b9b8f':'#708783')}}
if(p.kind==='workshop'){let pt=iso(p.x,p.z,p.h+.2);disk(pt.x,pt.y,u*.2,u*.16,'#bec7b7')}
let hover=screen.focus===p.id;if(hover){let pt=iso(p.x,p.z,p.h+1.1);g.strokeStyle='#f3c18b';g.lineWidth=1.7;g.beginPath();g.ellipse(pt.x,pt.y,u*.44,u*.11,0,0,Math.PI*2);g.stroke()}if(screen.mode!=='follow'&&(screen.w>=530||['bar','garden','library','forum'].includes(p.kind))){g.font=`600 ${Math.max(8,Math.min(12,u*.42))}px system-ui`;label(p.x,p.z,p.name,p.h+.6,Math.max(8,Math.min(12,u*.42)))}}
function lamp(x,z){const u=screen.unit,p=iso(x,z);g.strokeStyle='#6e8579';g.lineWidth=Math.max(2,u*.08);g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x,p.y-u*1.8);g.stroke();disk(p.x,p.y-u*1.86,u*.16,u*.12,'#e1bc80');let grad=g.createRadialGradient(p.x,p.y-u*1.85,2,p.x,p.y-u*1.85,u*1.3);grad.addColorStop(0,'#eac88918');grad.addColorStop(1,'#eac88900');disk(p.x,p.y-u*1.84,u*1.28,u*1.08,grad)}
function tree(x,z){let p=iso(x,z),u=screen.unit;g.strokeStyle='#755e49';g.lineWidth=u*.12;g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x,p.y-u*.8);g.stroke();for(let i=0;i<3;i++)disk(p.x+(i-1)*u*.22,p.y-u*(.85+i%2*.22),u*.33,u*.39,['#678b73','#779a7d','#83a488'][i])}
let cityWalkDistance=0,cityWalking=false,previousCityRollo=null;
function raccoon(){
 if(previousCityRollo){const dist=Math.hypot(drawPosition.x-previousCityRollo.x,drawPosition.z-previousCityRollo.z);cityWalking=dist>.0004;cityWalkDistance+=dist;}previousCityRollo={x:drawPosition.x,z:drawPosition.z};
 // Adult raccoon anatomy, deliberately naturalistic rather than mascot-like.
 // Longer back, small dark eyes, lean muzzle, subdued coat and a ringed tail.
 const {x,y}=iso(drawPosition.x,drawPosition.z),u=screen.unit*1.28,pose=walkPose(cityWalkDistance,cityWalking);
 g.save();g.translate(x,y-pose.bob*u);g.scale(drawFacing,1);g.rotate(Math.sin(performance.now()*.001)*.012);g.lineJoin='round';g.lineCap='round';
 const ellipse=(x,y,rx,ry,col,angle=0)=>{g.beginPath();g.ellipse(x*u,y*u,rx*u,ry*u,angle,0,Math.PI*2);g.fillStyle=col;g.fill()};
 const path=(coords,col)=>{g.beginPath();g.moveTo(coords[0][0]*u,coords[0][1]*u);for(let i=1;i<coords.length;i++)g.lineTo(coords[i][0]*u,coords[i][1]*u);g.closePath();g.fillStyle=col;g.fill()};
 // Shadow and back feet are low contrast, so the body stays recognizable.
 ellipse(0,.045,.77,.16,'#28342c45');
 ellipse(-.36,-.03,.20,.13,'#353835');ellipse(.42,-.02,.18,.12,'#363936');
 // Tail follows the body with charcoal bands, without decorative curls.
 g.strokeStyle='#676962';g.lineWidth=u*.25;g.beginPath();g.moveTo(-u*.46,-u*.43);g.bezierCurveTo(-u*.80,-u*.55,-u*1.07,-u*.43,-u*1.27,-u*.65);g.stroke();
 g.strokeStyle='#292d2b';g.lineWidth=u*.24;
 for(let i=0;i<4;i++){let t=i/3;let tx=-.60-.61*t;let ty=-.47-.13*t;g.beginPath();g.moveTo(u*tx,u*(ty-.085));g.lineTo(u*(tx-.06),u*(ty+.065));g.stroke()}
 // Body: an elongated, low torso with natural muted fur colors.
 ellipse(-.10,-.43,.66,.34,'#62635d',-.045);
 ellipse(-.17,-.30,.50,.17,'#4f524e',-.02);
 ellipse(-.27,-.57,.42,.12,'#818077',-.08);
 // Grounded short legs and dark forepaws.
 ellipse(-.48+pose.swing*.20,-.13,.15,.25,'#4c4d48',.12);ellipse(.22-pose.swing*.20,-.13,.15,.25,'#51524d',-.16);
 ellipse(-.49+pose.swing*.60,.04-Math.max(0,pose.swing)*.24,.19,.10,'#303331');ellipse(.34-pose.swing*.60,.035-Math.max(0,-pose.swing)*.24,.19,.085,'#292d2c');
 // Small ears and elongated head angled toward the right.
 path([[.24,-.70],[.27,-1.00],[.49,-.81]],'#373b38');
 path([[.58,-.68],[.71,-.92],[.76,-.61]],'#393d3a');
 path([[.31,-.73],[.32,-.88],[.45,-.78]],'#9a9187');
 path([[.65,-.70],[.70,-.82],[.71,-.67]],'#998c83');
 ellipse(.49,-.61,.40,.30,'#8a897f',-.04);
 // Long face mask is uneven and matte, not a circular cartoon eye patch.
 path([[.21,-.66],[.35,-.80],[.52,-.76],[.66,-.61],[.59,-.53],[.37,-.56]],'#242a2a');
 path([[.55,-.60],[.64,-.76],[.82,-.69],[.90,-.54],[.76,-.49]],'#292e2c');
 // Modest eyes, with just enough contrast to read at phone size.
 const eyelid=blinkHeight(performance.now());ellipse(.48,-.67,.038,.028*eyelid,'#111917');ellipse(.76,-.63,.034,.026*eyelid,'#151b1a');
 // Narrow pointed snout, nose and pale chin. No smile, no huge eyes.
 path([[.65,-.54],[.90,-.54],[1.04,-.46],[.86,-.39],[.66,-.41]],'#b4aa9b');
 ellipse(1.035,-.47,.066,.038,'#202526');
 path([[.72,-.39],[.89,-.40],[.83,-.34],[.70,-.35]],'#aaa495');
 // Restrained flecks suggest fur without expensive textures.
 g.strokeStyle='#b1ab9d85';g.lineWidth=Math.max(.6,u*.015);
 for(let i=0;i<10;i++){let xx=-.51+i*.085;let yy=-.57+(i%3)*.075;g.beginPath();g.moveTo(xx*u,yy*u);g.lineTo((xx+.05)*u,(yy+.024)*u);g.stroke()}
 g.restore();
}
function cameraInfo(){
 const anchor=screen.mode==='follow'?iso(drawPosition.x,drawPosition.z):iso(6,6);
 const panning=screen.mode==='explore';
 return {zoom:screen.zoom,anchor,center:{x:screen.w*.50+(panning?screen.panX:0),y:screen.h*.62+(panning?screen.panY:0)}};
}
function screenPoint(worldPoint){const c=cameraInfo();return {x:c.center.x+(worldPoint.x-c.anchor.x)*c.zoom,y:c.center.y+(worldPoint.y-c.anchor.y)*c.zoom}}
function paint(){if(window.ROLLO_STREETS_EMBEDDED)return;let w=screen.w,h=screen.h,u=screen.unit;g.clearRect(0,0,w,h);let sky=g.createLinearGradient(0,0,w,h);sky.addColorStop(0,'#b7c8bf');sky.addColorStop(.5,'#a9bfbd');sky.addColorStop(1,'#8da7a7');g.fillStyle=sky;g.fillRect(0,0,w,h)
// Outer downtown towers in silhouette, with lit windows
for(let i=0;i<7;i++){let x=i*w/6-w*.02,hh=60+(i*37)%90;g.fillStyle=i%2?'#879d9b':'#90a9a5';g.fillRect(x, h*.14-hh/3, w*.15,hh);for(let j=0;j<4;j++){g.fillStyle='#c1cbc092';g.fillRect(x+12+(j%2)*22,h*.14-hh/3+12+Math.floor(j/2)*19,5,7)}}
// Transform only the city. The sky and interface stay sharp and stationary.
const camera=cameraInfo();g.save();g.translate(camera.center.x,camera.center.y);g.scale(camera.zoom,camera.zoom);g.translate(-camera.anchor.x,-camera.anchor.y);
let corners=[iso(0,0),iso(12,0),iso(12,12),iso(0,12)];polygon(corners.map(p=>({x:p.x,y:p.y+u*.52})),'#6f857b');polygon(corners,'#91a89a','#a4bbae');
// tiled blocks
for(let x=0;x<12;x++)for(let z=0;z<12;z++){let ps=[iso(x,z),iso(x+1,z),iso(x+1,z+1),iso(x,z+1)];let road=(x>=5&&x<=6)||(z>=4&&z<=5)||(x===1&&z>=7);polygon(ps,road?(((x+z)%3===0)?'#7e9893':'#819b96'):((x+z)%2?'#9bad9e':'#a0b5a5'),'#576f6720');if(road&&x===6&&z%2===0){let v=iso(x+.48,z+.48);disk(v.x,v.y,u*.10,u*.024,'#d7ddc4aa')}}
for(let [x,z] of [[0.7,2.6],[10.5,5],[7.2,11.1]])tree(x,z);
for(let [x,z] of [[5.6,4.4],[6.6,8.4]])lamp(x,z);
const items=[...WORLD.map(p=>({order:p.x+p.z,place:p,draw:()=>building(p)})),{order:drawPosition.x+drawPosition.z+.4,draw:raccoon}];items.sort((a,b)=>a.order-b.order);for(let a of items){
// In follow mode fade an occluding foreground building rather than drawing Rollo on its roof.
const near=a.place&&Math.hypot(a.place.x-drawPosition.x,a.place.z-drawPosition.z)<3.2;
if(screen.mode==='follow'&&near&&a.order>drawPosition.x+drawPosition.z+.4)g.globalAlpha=.26;
a.draw();g.globalAlpha=1;
}
g.restore();
// Mini legend top right
let legend='NORTH QUAY · ONE RESIDENT';g.font='700 10px system-ui';g.textAlign='right';g.fillStyle='#445d59b3';g.fillText(legend,w-18,28);g.textAlign='left';
}
function frame(now){if(now-last<1000/24){requestAnimationFrame(frame);return}let dt=Math.min(.35,(now-last)/1000);last=now;if(!paused&&!remote)tick(dt);const target=targetPosition();const projected=iso(target.x,target.z),at=iso(drawPosition.x,drawPosition.z);if(Math.hypot(projected.x-at.x,projected.y-at.y)>.06&&Math.abs(projected.x-at.x)>.04)drawFacing=projected.x<at.x?-1:1;const smoothing=Math.min(1,dt*2.3);drawPosition.x+=(target.x-drawPosition.x)*smoothing;drawPosition.z+=(target.z-drawPosition.z)*smoothing;paint();if(now-hudTimer>800){renderHUD();hudTimer=now}if(now-redrawTime>7000){save();redrawTime=now}requestAnimationFrame(frame)}
// Camera navigation: Mac left OR right drag; touch one-finger or two-finger drag;
// two-finger pinch / trackpad wheel zoom. The camera never steers Rollo himself.
function updateCameraButtons(){
 $('camera-view').textContent=screen.mode==='follow'?'Explore town':'Follow Rollo';
 $('camera-view').setAttribute('aria-pressed',String(screen.mode!=='follow'));
 $('zoom-level').textContent=`${Math.round(screen.zoom*100)}%`;
 $('zoom-in').disabled=screen.zoom>=4.8;
 $('zoom-out').disabled=screen.zoom<=.8;
}
function changeZoom(value){screen.zoom=clamp(value,.8,4.8);updateCameraButtons()}
function startExplore(){
 if(screen.mode==='explore')return;
 if(screen.mode==='follow'){
  const r=iso(drawPosition.x,drawPosition.z),m=iso(6,6);
  screen.panX=(m.x-r.x)*screen.zoom;
  screen.panY=(m.y-r.y)*screen.zoom;
 }else{screen.panX=0;screen.panY=0;}
 screen.mode='explore';updateCameraButtons();
}
function panCamera(dx,dy){startExplore();screen.panX+=dx;screen.panY+=dy}
$('camera-view').onclick=()=>{
 if(screen.mode==='follow'){screen.mode='overview';screen.zoom=screen.w<550?1.15:1.4;screen.panX=0;screen.panY=0;}
 else{screen.mode='follow';screen.zoom=screen.w<550?2.2:2.5;screen.panX=0;screen.panY=0;}
 updateCameraButtons();
};
$('zoom-in').onclick=()=>changeZoom(screen.zoom*1.28);
$('zoom-out').onclick=()=>changeZoom(screen.zoom/1.28);
canvas.addEventListener('wheel',e=>{e.preventDefault();changeZoom(screen.zoom*(e.deltaY>0?.90:1.1))},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.tabIndex=0;
canvas.addEventListener('keydown',e=>{
 const moves={ArrowLeft:[55,0],ArrowRight:[-55,0],ArrowUp:[0,55],ArrowDown:[0,-55]};
 if(moves[e.key]){e.preventDefault();panCamera(...moves[e.key]);}
 else if(e.key==='Escape'){screen.mode='follow';updateCameraButtons();}
 else if(e.key==='+'||e.key==='='){e.preventDefault();changeZoom(screen.zoom*1.18);}
 else if(e.key==='-'){e.preventDefault();changeZoom(screen.zoom/1.18);}
});
const pointers=new Map();let pinchDistance=0,press=null,usedGesture=false;
const centerOf=arr=>({x:arr.reduce((n,a)=>n+a.x,0)/arr.length,y:arr.reduce((n,a)=>n+a.y,0)/arr.length});
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0 && e.button!==2 && e.pointerType==='mouse')return;
 e.preventDefault();canvas.focus({preventScroll:true});
 canvas.setPointerCapture(e.pointerId);
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1){press={x:e.clientX,y:e.clientY};usedGesture=false}
 else{usedGesture=true;const a=[...pointers.values()];pinchDistance=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}
});
canvas.addEventListener('pointermove',e=>{
 const old=pointers.get(e.pointerId);if(!old)return;
 const previous=[...pointers.values()];
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 const current=[...pointers.values()];
 if(current.length>=2){
  const from=centerOf(previous),to=centerOf(current);
  if(Math.hypot(to.x-from.x,to.y-from.y)>.1)panCamera(to.x-from.x,to.y-from.y);
  const d=Math.hypot(current[0].x-current[1].x,current[0].y-current[1].y);
  if(pinchDistance>5&&d>5)changeZoom(screen.zoom*d/pinchDistance);
  pinchDistance=d;usedGesture=true;
 }else if(press && Math.hypot(e.clientX-press.x,e.clientY-press.y)>7){
  panCamera(e.clientX-old.x,e.clientY-old.y);usedGesture=true;
 }
});
function finishPointer(e){
 if(!pointers.has(e.pointerId))return;
 const current=pointers.get(e.pointerId);pointers.delete(e.pointerId);
 if(pointers.size===0){
  if(!usedGesture&&press&&Math.hypot(current.x-press.x,current.y-press.y)<12){
   const r=canvas.getBoundingClientRect(),cx=current.x-r.left,cy=current.y-r.top;
   const matches=WORLD.map(p=>({p,sp:screenPoint(iso(p.x,p.z,p.h*.7))})).map(a=>({p:a.p,dist:Math.hypot(cx-a.sp.x,cy-a.sp.y)})).sort((a,b)=>a.dist-b.dist);
   if(matches[0]?.dist<Math.max(40,screen.unit*screen.zoom*1.2)){
    const p=matches[0].p;screen.focus=p.id;
    $('scene-teaser').textContent=p.name+': '+p.description;
    setTimeout(()=>{screen.focus=null;$('scene-teaser').textContent='Drag to explore · Two fingers to pan/pinch · Follow Rollo anytime'},3000);
   }
  }
  press=null;pinchDistance=0;usedGesture=false;
 }else{usedGesture=true;if(pointers.size===1)pinchDistance=0;}
}
canvas.addEventListener('pointerup',finishPointer);
canvas.addEventListener('pointercancel',finishPointer);

$('speed').textContent='2:1 time · 12 hr/day';$('speed').disabled=true;$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause'};

function renderPlaces(){
 const node=$('custom-places');if(!node)return;node.replaceChildren();
 const extra=WORLD.filter(p=>p.id.startsWith('added-'));
 if(!extra.length){node.textContent='No added places yet. Start with a small building, then watch Rollo visit it.';return}
 for(const p of extra){const li=document.createElement('li');li.textContent=`${p.name} (${p.kind})`;node.append(li)}
}
$('addplace')?.addEventListener('submit',e=>{
 e.preventDefault();if(remote){alert('The cloud city needs an authenticated server-side place editor; adding local places is disabled in cloud mode.');return}
 const name=$('placename').value.trim().slice(0,36),kind=$('placetype').value,x=Number($('placex').value),z=Number($('placez').value);
 if(name.length<2||!['library','workshop','forum','garden','market','alley'].includes(kind)|| !Number.isFinite(x)||!Number.isFinite(z)||x<.8||x>11.2||z<.8||z>11.2||WORLD.length>=24){alert('Please check the name, type and location. City size is limited to 24 places for phones.');return}
 const p={id:`added-${Date.now().toString(36)}`,name,x,z,kind,w:1.25,d:1.05,h:kind==='alley'?.3:1.1,description:`A new ${kind} location added to Rollo's city.`};
 s.customPlaces=Array.isArray(s.customPlaces)?s.customPlaces:[];s.customPlaces.push(p);rebuildPlaces();renderPlaces();save();$('placename').value='';
 note(`A new place opened: ${name}.`);thought(`Something new is in the city. I should investigate ${name} sometime.`);
});
$('exportplaces')?.addEventListener('click',()=>{
 const data=JSON.stringify([...CITY_PLACES,...(s.customPlaces||[])],null,2);
 const blob=new Blob([data],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='rollo-city-places.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);
});
renderPlaces();

$('replyform').addEventListener('submit',async e=>{
 e.preventDefault();let input=$('reply'),raw=input.value.trim().slice(0,360);if(!raw)return;
 const visitor=window.RolloVisitor;
 if(visitor&&!visitor.canSubmit()){alert(visitor.message());return;}
 if(remote){
  try{
   let name=($('visitorname')?.value||'Visitor').trim();
   let resp=await fetch(window.ROLLO_BACKEND_URL.replace(/\/$/,'')+'/community/forum',{
    method:'POST',headers:{'Content-Type':'application/json',...(visitor?.headers()||{})},
    body:JSON.stringify({name,body:raw,website:($('website-hp')?.value||'')})
   });
   let data=await resp.json();
   if(data.nextAllowedAt)visitor?.storeNext(data.nextAllowedAt);
   visitor?.paint();
   if(!resp.ok)throw Error(data.error||('Server rejected post ('+resp.status+').'));
   input.value='';alert('Message received for moderation. You can interact again after 24 real hours.');
  }catch(err){alert('Could not post: '+err.message)}return;
 }
 // Local demo mode: browser-only preview. This does not reach the shared Cloudflare world.
 addForum('You',raw);s.pending.push({kind:'forum',author:'You',body:raw});thought('Someone wrote to the forum. I may choose whether to engage.');input.value='';save();renderHUD();
 visitor?.storeNext(Date.now()+86400000);visitor?.paint();
});
for(let tab of document.querySelectorAll('.tabs button'))tab.onclick=()=>{for(let b of document.querySelectorAll('.tabs button'))b.setAttribute('aria-selected',String(b===tab));for(let panel of document.querySelectorAll('.tabpanel'))panel.classList.toggle('hidden',panel.id!=='tab-'+tab.dataset.tab)};
$('reset').onclick=()=>{if(!confirm('Delete this device’s saved local world and start again?'))return;if(remote){alert('The shared cloud world cannot be reset here.');return}s=initial();rebuildPlaces();renderPlaces();save();renderHUD()};
$('journalshare').onclick=async()=>{let u=new URL(location.href);u.searchParams.set('tab','journal');try{await navigator.clipboard.writeText(u.toString());$('journalshare').textContent='Link copied';setTimeout(()=>$('journalshare').textContent='Share journal',1700)}catch{prompt('Copy this journal link',u.toString())}};
$('export').onclick=()=>{let blob=new Blob([JSON.stringify(s,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rollo-city-memories.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};
async function loadRemote(){if(!remoteDesired)return;let base=window.ROLLO_BACKEND_URL.trim().replace(/\/$/,'');try{let [r,f,p,w]=await Promise.all([fetch(base+'/state'),fetch(base+'/forum'),fetch(base+'/places'),fetch(base+'/wallet')]);if(!r.ok||!f.ok||!p.ok)throw Error('Backend unavailable');let world=await r.json(),posts=await f.json(),places=await p.json();if(!world||!Array.isArray(posts.posts))throw Error('Invalid backend response');s={...initial(),...world,mind:upgradeMind(world.mind),forum:posts.posts,customPlaces:places.places||[]};delete s.coins;delete s.barEarnings;delete s.workMinutesToday;ensureGarden(s);
 if(w.ok){const financial=await w.json();walletDisplay='$'+(Number(financial?.wallet?.available_cents||0)/100).toFixed(2)}
 remote=true;remoteFetchedAt=performance.now();if(!cloudPositionReady){drawPosition={x:s.x,z:s.z};cloudPositionReady=true;}rebuildPlaces();document.getElementById('builder').hidden=true;renderPlaces();$('connection').textContent='Rollo is here';$('mode_note').textContent='Everyone sees the same Cloudflare city. Only the owner can edit buildings. Visitor forum posts and photos require approval.';$('speed').disabled=true;$('pause').disabled=true;$('reset').disabled=true;renderHUD()}catch(err){remote=false;$('connection').textContent='Can’t reach Rollo';$('mode_note').textContent='Cloud connection unavailable; local preview only. Editing the shared city requires the owner page.';document.getElementById('builder').hidden=true;}}
const requestedTab=new URLSearchParams(window.location.search).get('tab');if(['learning','forum','mind','journal','gallery'].includes(requestedTab))document.querySelector(`[data-tab="${requestedTab}"]`)?.click();
fit();screen.zoom=screen.w<550?2.2:2.5;screen.panX=0;screen.panY=0;$('scene-teaser').textContent='Drag to explore · Two fingers to pan/pinch · Follow Rollo anytime';updateCameraButtons();window.addEventListener('resize',fit);window.addEventListener('pagehide',save);if(remoteDesired){loadRemote();setInterval(loadRemote,20000)}renderHUD();requestAnimationFrame(frame);
})();
