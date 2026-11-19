import {blinkHeight,walkPose} from './rollo-animation.js';
import {CITY_PLACES, TIME} from './world-data.js';
import {advanceWalkingRoute, WALK_UNITS_PER_SIM_MINUTE} from './movement.js';

// North Quay's independent visitor camera. It NEVER sends navigation commands to Rollo.
// No external graphics library, network analytics, or external media dependencies.
const embedded=new URLSearchParams(location.search).has('embed');
if(embedded)document.body.classList.add('embedded');
const canvas=document.querySelector('#town-canvas'),ctx=canvas.getContext('2d',{alpha:false});
const $=id=>document.getElementById(id), clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const W=26,D=26,BASE=window.ROLLO_BACKEND_URL?.trim().replace(/\/$/,'')||'';
const mesh=[];let dpr=1,fw=1000,fh=650,drawables=[];
const P=(x,y,z)=>[x,y,z],add=(verts,c,outline=null)=>mesh.push({v:verts,c,outline});
const quad=(a,b,c,d,color,edge)=>add([a,b,c,d],color,edge);
const rect=(x,z,w,d,y,c)=>quad(P(x,y,z),P(x+w,y,z),P(x+w,y,z+d),P(x,y,z+d),c);
const wall=(x1,y1,z1,x2,y2,z2,h,color)=>quad(P(x1,y1,z1),P(x2,y2,z2),P(x2,y2+h,z2),P(x1,y1+h,z1),color);
function box(x,z,w,d,h,front,side,roof,y=0){
 const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2;
 rect(x0,z0,w,d,y+h,roof);
 quad(P(x0,y,z1),P(x1,y,z1),P(x1,y+h,z1),P(x0,y+h,z1),front);
 quad(P(x0,y,z0),P(x0,y,z1),P(x0,y+h,z1),P(x0,y+h,z0),side);
 quad(P(x1,y,z1),P(x1,y,z0),P(x1,y+h,z0),side);
 quad(P(x1,y,z0),P(x0,y,z0),P(x0,y+h,z0),P(x1,y+h,z0),front);
 return {x0,x1,z0,z1,y,h};
}
function pitchedRoof(b,shade1,shade2,rise=.55){
 const {x0,x1,z0,z1,y,h}=b,ym=y+h;
 quad(P(x0-.16,ym,z0-.19),P(x1+.16,ym,z0-.19),P(x1+.16,ym+rise,(z0+z1)/2),P(x0-.16,ym+rise,(z0+z1)/2),shade1);
 quad(P(x0-.16,ym+rise,(z0+z1)/2),P(x1+.16,ym+rise,(z0+z1)/2),P(x1+.16,ym,z1+.19),P(x0-.16,ym,z1+.19),shade2);
 quad(P(x0-.16,ym,z0-.19),P(x0-.16,ym+rise,(z0+z1)/2),P(x0-.16,ym,z1+.19),P(x0-.16,ym,z1+.19),'#9b998a');
}
function lamp(x,z){box(x,z,.09,.09,2.4,'#5e6c64','#5a6761','#7c7462');box(x,z,.4,.4,.22,'#e0b974','#a58a60','#f7d78c',2.38)}
function planter(x,z){const b=box(x,z,.66,.4,.26,'#b37d62','#986b55','#785641');
 for(const ox of [-.20,0,.19]){
  const gx=x+ox;add([P(gx, .25,z),P(gx-.14,.52,z-.1),P(gx+.06,.64,z),P(gx+.11,.40,z+.12)],ox===0?'#648f67':'#83a66f');
 }
}
function canopy(x,z,r=1,tone='#6e9576'){
 const y=.76+r*.48;
 box(x,z,.14,.14,y,'#705a48','#665444','#7e654a');
 const top=y+1.6*r;
 for(let i=0;i<6;i++){
  const a=i*Math.PI/3,b=(i+1)*Math.PI/3;
  add([P(x,top,z),P(x+Math.cos(a)*r,y,z+Math.sin(a)*r),P(x+Math.cos(b)*r,y,z+Math.sin(b)*r)],i%2?tone:'#84a987');
 }
 add(Array.from({length:6},(_,i)=>P(x+Math.cos(i*Math.PI/3)*r,y,z+Math.sin(i*Math.PI/3)*r)),'#698d73');
}
function doorAndWindows(b,kind){
 const {x0,x1,z0,z1,y,h}=b;
 const frontZ=z1+.008,winY=y+Math.min(.95,h*.48),w=.38;
 for(const xx of [x0+w*.85,x1-w*.85]){
  quad(P(xx-.2,winY,frontZ),P(xx+.2,winY,frontZ),P(xx+.2,winY+.48,frontZ),P(xx-.2,winY+.48,frontZ),'#466f75');
  wall(xx,winY+.20,frontZ+.012,xx,winY+.22,frontZ+.012,.27,'#f6e9c0');
  box(xx,frontZ+.07,.43,.10,.06,'#e8ddd0','#bbcab6','#ebdfd2',winY-.03);
 }
 const doorX=(x0+x1)/2;
 quad(P(doorX-.24,y,frontZ+.018),P(doorX+.24,y,frontZ+.018),P(doorX+.24,y+.90,frontZ+.018),P(doorX-.24,y+.90,frontZ+.018),kind==='bar'?'#653b2b':'#6c6252');
 if(kind==='bar'||kind==='market'){
  const awningY=y+1.25;
  quad(P(x0-.08,awningY,frontZ+.04),P(x1+.08,awningY,frontZ+.04),P(x1+.08,awningY-.27,frontZ+.5),P(x0-.08,awningY-.27,frontZ+.5),kind==='bar'?'#b96d50':'#d4af7d');
 }
}
const NEIGHBORHOOD_BUILDINGS=[
 {id:'willow-cottage',name:'Willow Cottage',x:14.7,z:2.3,w:2.4,d:1.8,h:2.25,kind:'home'},
 {id:'lantern-shop',name:'Lantern Shop',x:17.7,z:2.4,w:2.3,d:1.8,h:1.9,kind:'market'},
 {id:'quay-cottage',name:'Quay Cottage',x:21.8,z:2.3,w:2.7,d:1.9,h:2.4,kind:'home'},
 {id:'east-reading-room',name:'East Reading Room',x:23.7,z:7.9,w:2.2,d:1.7,h:2.3,kind:'library'},
 {id:'green-door-house',name:'Green Door House',x:21.4,z:10.4,w:2.35,d:1.85,h:2.0,kind:'home'},
 {id:'canal-house',name:'Canal House',x:3,z:16.15,w:2.1,d:1.7,h:2.5,kind:'home'},
 {id:'little-boutique',name:'Little Boutique',x:6,z:16.3,w:2.2,d:1.8,h:1.95,kind:'market'},
 {id:'painter-cottage',name:'Painter’s Cottage',x:9.35,z:15.25,w:2.1,d:1.65,h:2.35,kind:'home'},
 {id:'clock-workshop',name:'Clock Workshop',x:15.55,z:15.5,w:2.0,d:1.7,h:2.1,kind:'workshop'},
 {id:'grove-house',name:'Grove House',x:22.7,z:15.25,w:2.2,d:2,h:2.3,kind:'home'},
 {id:'railway-cottage',name:'Railway Cottage',x:2.7,z:23.9,w:2.2,d:1.7,h:2.2,kind:'home'},
 {id:'station-stall',name:'Station Stall',x:6,z:23.9,w:2.15,d:1.8,h:1.9,kind:'market'}
];
const shades={
 home:['#b6bd9f','#91a28c','#e2c4a2','#c68a70'],garden:['#aec8a5','#8fb49d','#d7dbc0','#a27868'],
 library:['#bec9bf','#98b6b0','#ece3c6','#718c91'],bar:['#ba8e72','#95725b','#e6ba8f','#a35f50'],
 forum:['#c0c5aa','#7a9e97','#e0e2c9','#7f9293'],market:['#d8c29c','#ad9d80','#ebdbc0','#a88768'],
 alley:['#afb5a4','#8d998b','#e3d9be','#987d72'],workshop:['#adb6a9','#808e85','#e1cfb5','#9d6d5e'],
 station:['#c8c1ab','#968f84','#dfd0b5','#6e8b88']};
function house(p,decoration=false){
 const kind=p.kind==='square'?'market':p.kind;
 const cols=shades[kind]||['#bbbba5','#929d8d','#e0c6aa','#9d786a'];
 const b=box(p.x,p.z,p.w||1.9,p.d||1.5,p.h||2.2,cols[0],cols[1],cols[2]);
 pitchedRoof(b,cols[3],cols[2],kind==='library'?.77:.58);
 doorAndWindows(b,kind);
 if(kind==='garden')for(let k=0;k<6;k++)planter(p.x-.55+(k%3)*.52,p.z-.40+Math.floor(k/3)*.55);
 if(kind==='bar'||kind==='library'||kind==='station'){
  box(p.x,p.z+p.d/2+.07,p.w*.78,.14,.20,'#a57e60','#886a58','#c49c7b',p.h*.72);
 }
 if(decoration && p.h>1.9){box(p.x+p.w*.25,p.z-.2,.22,.28,.55,'#806f66','#766356','#92796b',p.h)}
}
function plaque(x,z,text,y=2.65){labelPoints.push({x,z,y,text});}
let labelPoints=[];
function createWorld(){
 mesh.length=0;labelPoints=[];
 // Grass plots with subtle checker variation.
 for(let x=-1;x<26;x+=2)for(let z=-1;z<26;z+=2){const index=(Math.floor(x/2)*11+Math.floor(z/2)*7)&3;rect(x,z,2,2,-.08,['#8eaa90','#94ae93','#9eb89a','#90a88c'][index]);}
 // Roads run between homes and extend into the new eastern district.
 for(const z of [5.15,13.0,20.35]){
  rect(-.5,z-1,27,2,-.014,'#b8b9aa');rect(-.5,z-.72,27,1.44,.005,'#7d8881');
  for(let x=.4;x<26;x+=2.15)rect(x,z-.035,.90,.07,.016,'#d9d7c0');
 }
 for(const x of [7.0,12.45,19.0]){
  rect(x-1,-.4,2,25,-.014,'#b8b9aa');rect(x-.73,-.4,1.46,25,.009,'#818c83');
  for(let z=.6;z<23;z+=2.2)rect(x-.033,z,.065,.85,.02,'#d4d4bf');
 }
 // Pebble square, canal, and rail yard.
 rect(13.75,8.75,5.5,3.6,.022,'#bdbaa9');
 for(let z=9;z<12;z+=.50)for(let x=13.9;x<19;x+=.7)rect(x,z,.57,.36,.027,(Math.floor(x*2)+Math.floor(z*3))%2?'#c6c5b3':'#aea99b');
 rect(8.3,17.5,7.8,1.1,.01,'#719c9f');rect(8.3,17.5,7.8,.16,.025,'#9cc7c1');
 // Footbridge over the canal.
 rect(12.15,17.26,2.2,1.55,.12,'#c7ab83');
 for(let i=0;i<6;i++)box(12.25+i*.37,17.35,.13,.15,.33,'#93745b','#93745b','#93745b',.12);
 rect(8.0,22.4,18,2.1,.015,'#b5ada2');
 for(let x=8.4;x<26;x+=.45)rect(x,22.56,.15,1.42,.04,'#7a5948');
 for(const z of [22.86,23.69])rect(8.1,z,17.9,.095,.08,'#586663');
 // A parked vintage two-car train, visible but not an AI-controlled vehicle.
 const carA=box(23.2,23.28,2.8,1.20,1.60,'#c29069','#99765e','#d4bc8f',.12);
 const carB=box(19.9,23.28,2.8,1.2,1.60,'#769a8c','#59796f','#c4d1b8',.12);
 for(const b of [carA,carB])for(let xx=b.x0+.44;xx<b.x1-.2;xx+=.50)
  quad(P(xx, .95,b.z1+.015),P(xx+.32,.95,b.z1+.015),P(xx+.32,1.35,b.z1+.015),P(xx,1.35,b.z1+.015),'#bbd3d3');
 // Original North Quay, in original coordinates.
 for(const p of CITY_PLACES){
  if(['statue','grove','park','square'].includes(p.kind))continue;
  if(p.kind==='alley'){rect(p.x-.8,p.z-.5,1.6,1,.045,'#9fae9b');plaque(p.x,p.z,p.name,1.35);continue;}
  house({...p,h:p.kind==='station'?2.1:p.h+(.15)},p.kind==='home');
  plaque(p.x,p.z,p.name,Math.max(1.45,p.h+.85));
 }
 // Additional buildings are atmospheric scenery, not autonomous resident businesses.
 // Names are visible on the canvas and in the Places directory; only CITY_PLACES
 // are Rollo destinations in his cloud simulation.
 NEIGHBORHOOD_BUILDINGS.forEach((p,i)=>{
  house(p,i%4===0);
  plaque(p.x,p.z,p.name,Math.max(1.7,p.h+.85));
 });
 // Flower boxes and leafy trees to make the town feel lived in.
 for(const [x,z] of [[1.0,4.1],[10.5,3.9],[23.9,4.5],[11.3,10.2],[2.0,13.9],[9.6,18.2],[16.7,17.2],[21.6,18.1],[24.7,14.1],[17.5,13.95],[22.1,20.1],[1.2,24.9]])canopy(x,z,(x%2?0.8:.95));
 for(const [x,z] of [[11.7,4.15],[15.4,7.1],[23.3,12.25],[8.7,21.1],[2.0,11.8],[17.0,19.1]])lamp(x,z);
 for(const [x,z] of [[3,4.08],[13.1,4.35],[18,7.6],[22.2,12.0],[14.0,18.65]])planter(x,z);
 // Pino, an explicitly stylized bird statue on a tall stone plinth.
 box(16.4,10.7,1.15,1.15,1.13,'#a49a89','#8a857d','#c8bda9');
 box(16.4,10.7,.79,.79,.21,'#ccbba0','#aa9682','#d3c5ae',1.10);
 add([P(16.05,1.55,10.7),P(16.45,2.37,10.7),P(16.78,1.55,10.7)],'#c9a66c');
 add([P(16.38,1.79,10.65),P(16.92,2.08,10.68),P(16.48,1.58,10.63)],'#ab8458');
 add([P(16.72,1.99,10.70),P(17.00,1.88,10.72),P(16.76,1.81,10.70)],'#ddc58f');
 labelPoints.push({x:16.4,z:10.7,y:2.8,text:'Pino the bird'});
 // The squirrel's home is independent of Rollo and always remains in the grove.
 for(const [x,z] of [[17.7,15.5],[19.7,14.6],[19.75,16.6]])canopy(x,z,.68,'#7c9a71');
 labelPoints.push({x:18.5,z:15.4,y:2.3,text:'Squirrel Grove'});
 labelPoints.push({x:12.7,z:19.9,y:1.6,text:'Canal Walk'});
 labelPoints.push({x:15.2,z:5.5,y:1.8,text:'Old Town Square'});
}
createWorld();

const camera={x:6.4,y:2.48,z:9.2,yaw:1.45,pitch:-.065,mode:'street',zoom:1};
let walkDistance=0,rolloMoving=false;
let rollo={x:3.1,z:6.2},state={mode:'waiting',day:1,hour:8,minute:0,activity:'Exploring North Quay',thought:'I wonder what is around the next corner.'},lastRemote=0,cloudPositionReady=false;
let selected=null,mouse={down:false,pointers:new Map(),pinch:0},keys=new Set(),frameAt=performance.now(),stateStatus='Preview town',fetching=false;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function face(p){
 const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
 const dx=p[0]-camera.x,dy=p[1]-camera.y,dz=p[2]-camera.z;
 return {depth:dx*sy*cp+dy*sp+dz*cy*cp,
   h:dx*cy-dz*sy,
   v:dy*cp-sp*(dx*sy+dz*cy)};
}
function project(p){const v=face(p);if(v.depth<.12)return null;
 const focal=Math.min(fw*1.05,fh*1.65)*camera.zoom;
 return {x:fw/2+(v.h/v.depth)*focal,y:fh*.54-(v.v/v.depth)*focal,depth:v.depth};}
function clipNear(vs){let out=[];for(let i=0;i<vs.length;i++){
 const a=vs[i],b=vs[(i+1)%vs.length],A=a.depth>.12,B=b.depth>.12;
 if(A)out.push(a);
 if(A!==B){const t=(.12-a.depth)/(b.depth-a.depth);out.push({depth:.12,h:a.h+(b.h-a.h)*t,v:a.v+(b.v-a.v)*t});}
 }return out;}
function drawFace(shape){const cs=clipNear(shape.v.map(face));if(cs.length<3)return;
 const focal=Math.min(fw*1.05,fh*1.65)*camera.zoom;
 ctx.beginPath();cs.forEach((p,i)=>{const x=fw/2+p.h/p.depth*focal,y=fh*.54-p.v/p.depth*focal;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
 ctx.closePath();ctx.fillStyle=shape.c;ctx.fill();if(shape.outline){ctx.strokeStyle=shape.outline;ctx.lineWidth=.7;ctx.stroke();}
}
function drawBadge(x,y,text,accent){ctx.save();ctx.font='600 13px system-ui';const width=Math.min(190,ctx.measureText(text).width+19);x=clamp(x,width/2+7,fw-width/2-7);
 ctx.fillStyle='#203e38dc';ctx.beginPath();ctx.roundRect(x-width/2,y-24,width,25,8);ctx.fill();ctx.strokeStyle=accent?'#f2cf91':'#9abca9';ctx.lineWidth=.8;ctx.stroke();ctx.fillStyle='#fff9ed';ctx.textAlign='center';ctx.fillText(text,x,y-7);ctx.restore();}
function shadow(pt,r=1){const p=project([pt.x,.05,pt.z]);if(!p)return;
 const rad=Math.min(65,Math.max(4,r*160/p.depth));ctx.save();ctx.globalAlpha=.3;ctx.fillStyle='#2e443e';ctx.beginPath();ctx.ellipse(p.x,p.y,rad,rad*.22,0,0,Math.PI*2);ctx.fill();ctx.restore();}
function drawRaccoon(){shadow(rollo,1.02);const p=project([rollo.x,.04,rollo.z]);if(!p)return;
 const u=clamp(184/p.depth,11,142),pose=walkPose(walkDistance,rolloMoving);ctx.save();ctx.translate(p.x,p.y-pose.bob*u);ctx.scale(u,u);
 const ellipse=(x,y,rx,ry,c)=>{ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill()};
 // Body and alternating tail rings. The small raccoon has natural proportions.
 ctx.strokeStyle='#686862';ctx.lineWidth=.21;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-.45,-.43);ctx.bezierCurveTo(-.8,-.57,-.95,-.49,-1.27,-.7);ctx.stroke();
 for(let i=0;i<4;i++){ctx.strokeStyle=i%2?'#3b3e38':'#242c2a';ctx.lineWidth=.2;ctx.beginPath();ctx.moveTo(-.62-i*.17,-.50-i*.04);ctx.lineTo(-.65-i*.17,-.34-i*.04);ctx.stroke()}
 ellipse(-.12,-.42,.62,.34,'#65655d');ellipse(-.08,-.28,.48,.16,'#535650');
 for(const [i,x] of [-.45,.35].entries()){const stride=(i===0?1:-1)*pose.swing;ellipse(x+stride*.18,-.15,.16,.24,'#484b44');ellipse(x+stride*.6,.03-Math.max(0,stride)*.20,.19,.11,'#30342e')}
 ellipse(.39,-.60,.33,.29,'#8e8c82');
 ctx.fillStyle='#393e37';ctx.beginPath();ctx.moveTo(.16,-.71);ctx.lineTo(.21,-1);ctx.lineTo(.37,-.79);ctx.fill();ctx.beginPath();ctx.moveTo(.54,-.73);ctx.lineTo(.67,-.92);ctx.lineTo(.69,-.59);ctx.fill();
 ellipse(.33,-.66,.16,.12,'#303634');ellipse(.60,-.62,.15,.12,'#303634');const eye=blinkHeight(performance.now());ellipse(.44,-.67,.037,.030*eye,'#111714');ellipse(.69,-.63,.037,.028*eye,'#131917');
 ellipse(.77,-.47,.27,.12,'#b4aa9a');ellipse(.98,-.46,.065,.042,'#1a2323');
 ctx.restore();
 const badge=project([rollo.x,1.58,rollo.z]);if(badge)drawBadge(badge.x,badge.y,'Rollo',true);
}
function squirrelPos(_t){const t=Date.now();return {x:18.48+Math.sin(t/3600)*.65,z:15.33+Math.cos(t/4600)*.51}}
function drawSquirrel(t){const s=squirrelPos(t);shadow(s,.30);const p=project([s.x,.18,s.z]);if(!p)return;const u=clamp(82/p.depth,3,40);
 ctx.save();ctx.translate(p.x,p.y);ctx.scale(u,u);ctx.fillStyle='#925f40';ctx.beginPath();ctx.ellipse(0,-.30,.28,.28,0,0,Math.PI*2);ctx.fill();
 ctx.beginPath();ctx.ellipse(.20,-.60,.17,.18,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#8b5335';ctx.lineWidth=.18;ctx.beginPath();ctx.moveTo(-.12,-.39);ctx.bezierCurveTo(-.45,-.7,-.53,-.16,-.28,-.86);ctx.stroke();
 ctx.fillStyle='#4a3227';ctx.beginPath();ctx.arc(.30,-.65,.034,0,Math.PI*2);ctx.fill();ctx.restore();
}
function render(now){
 if(fw<10||fh<10)return;
 const sky=ctx.createLinearGradient(0,0,0,fh);sky.addColorStop(0,'#a5cbd0');sky.addColorStop(.49,'#e2dcc0');sky.addColorStop(1,'#a1b79b');ctx.fillStyle=sky;ctx.fillRect(0,0,fw,fh);
 // Soft, distant hills behind the modeled town.
 ctx.fillStyle='#9cb7a488';ctx.beginPath();ctx.moveTo(0,fh*.57);for(let x=0;x<=fw;x+=20)ctx.lineTo(x,fh*(.51+.035*Math.sin(x/80)));ctx.lineTo(fw,fh);ctx.lineTo(0,fh);ctx.fill();
 const draws=[];
 for(const shape of mesh){const depths=shape.v.map(face),visible=depths.some(p=>p.depth>.12);if(visible)draws.push({depth:depths.reduce((s,v)=>s+v.depth,0)/depths.length,shape});}
 for(const item of [{type:'rollo',pt:rollo},{type:'squirrel',pt:squirrelPos(now)}]){
  const a=face([item.pt.x,.3,item.pt.z]);if(a.depth>.12)draws.push({depth:a.depth,type:item.type});
 }
 draws.sort((a,b)=>b.depth-a.depth);
 for(const el of draws){if(el.shape)drawFace(el.shape);else if(el.type==='rollo')drawRaccoon();else drawSquirrel(now);}
 // Permanent building labels: names are discoverable without needing to be a few
 // feet away. Nearest labels win when buildings overlap in the projection.
 const maxLabels=camera.mode==='overview'?(fw<640?11:17):(fw<640?7:11);
 const labels=labelPoints.map(label=>({...label,projected:project([label.x,label.y,label.z])}))
   .filter(label=>label.projected&&label.projected.depth<(camera.mode==='overview'?60:25)
    &&label.projected.x>45&&label.projected.x<fw-45&&label.projected.y>52&&label.projected.y<fh-70)
   .sort((a,b)=>a.projected.depth-b.projected.depth);
 const shown=[];
 for(const label of labels){
  const pt=label.projected;
  if(shown.some(q=>Math.hypot(pt.x-q.x,pt.y-q.y)<(fw<640?88:104)))continue;
  shown.push(pt);drawBadge(pt.x,pt.y,label.text,false);
  if(shown.length>=maxLabels)break;
 }
 // The lower left stamp is in a HUD instead of baked into the world art.
}
function cameraLookAt(x,y,z){const dx=x-camera.x,dy=y-camera.y,dz=z-camera.z;camera.yaw=Math.atan2(dx,dz);camera.pitch=Math.atan2(dy,Math.hypot(dx,dz));}
function follow(){camera.mode='follow';camera.x=rollo.x-4.0;camera.z=rollo.z+5.2;camera.y=3.25;cameraLookAt(rollo.x,1.0,rollo.z);updateButtons();}
function street(){camera.mode='street';camera.x=12.45;camera.z=6.7;camera.y=3.45;camera.yaw=.80;camera.pitch=fw<650?-.43:-.27;updateButtons();}
function overview(){camera.mode='overview';camera.x=12;camera.z=33;camera.y=15;cameraLookAt(13,0,11);updateButtons();}
// Directory of every named landmark and scenic building. The directory controls
// the visitor camera only; it cannot command Rollo to go anywhere.
const destinationList=[...CITY_PLACES.map(p=>({...p,scenic:false})),...NEIGHBORHOOD_BUILDINGS.map(p=>({...p,scenic:true}))];
const placeList=$('town-place-list');
for(const dest of destinationList){
 const button=document.createElement('button');button.type='button';
 button.className='place-option';button.textContent=dest.name;
 const category=dest.scenic?'Scenery':dest.kind==='statue'?'Landmark':dest.kind==='park'?'Canal path':'Rollo visits';
 button.title=dest.name+' · '+category;
 button.setAttribute('aria-label','Look at '+dest.name+(dest.scenic?' (scenery)':''));
 button.addEventListener('click',()=>{
  camera.mode='street';camera.x=clamp(dest.x-3.1,.7,W-.7);
  camera.z=clamp(dest.z+3.9,.7,D-.7);camera.y=3.5;
  cameraLookAt(dest.x,Math.max(1.1,dest.h||1.5),dest.z);
  updateButtons();$('town-places').open=false;
  canvas.focus({preventScroll:true});
 });
 placeList.append(button);
}
const modeButtons={street:$('street-mode'),overview:$('overview-mode'),follow:$('follow-mode')};
function updateButtons(){for(const [m,b] of Object.entries(modeButtons)){b?.setAttribute('aria-pressed',String(camera.mode===m));}
 $('view-mode').textContent=camera.mode==='overview'?'Town overview':camera.mode==='follow'?'Following Rollo':'Exploring North Quay';}
modeButtons.street.onclick=street;modeButtons.overview.onclick=overview;modeButtons.follow.onclick=follow;
function walk(forward=0,side=0,dt=.05){
 if(camera.mode==='overview')street();if(camera.mode==='follow')camera.mode='street';
 const speed=3.4*dt,fx=Math.sin(camera.yaw),fz=Math.cos(camera.yaw),rx=Math.cos(camera.yaw),rz=-Math.sin(camera.yaw);
 const nx=clamp(camera.x+(fx*forward+rx*side)*speed,.5,W-.5),nz=clamp(camera.z+(fz*forward+rz*side)*speed,.5,D-.5);
 const blocked=CITY_PLACES.some(p=>['home','garden','library','bar','forum','market','workshop','station'].includes(p.kind)&&Math.abs(nx-p.x)<p.w/2+.18&&Math.abs(nz-p.z)<p.d/2+.18);
 if(!blocked){camera.x=nx;camera.z=nz;}
 camera.y=3.5;updateButtons();
}
function rotate(dx,dy){if(camera.mode==='follow')camera.mode='street';camera.yaw-=dx*.0043;camera.pitch=clamp(camera.pitch+dy*.0023,-1.13,.44);updateButtons();}
const held=new Map();document.querySelectorAll('[data-walk]').forEach(button=>{
 const dir=button.dataset.walk;button.addEventListener('pointerdown',e=>{button.setPointerCapture(e.pointerId);held.set(dir,true);e.preventDefault()});
 const done=()=>held.delete(dir);button.addEventListener('pointerup',done);button.addEventListener('pointercancel',done);
});
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
 const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){keys.add(k);e.preventDefault();}
 if(k==='f')follow();if(k==='m')overview();if(k==='escape')street();});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);mouse.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.focus({preventScroll:true});});
canvas.addEventListener('pointermove',e=>{const prev=mouse.pointers.get(e.pointerId);if(!prev)return;
 const old=[...mouse.pointers.values()];mouse.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const now=[...mouse.pointers.values()];
 const dx=e.clientX-prev.x,dy=e.clientY-prev.y;
 if(now.length===1)rotate(dx,dy);
 else if(now.length===2){
  const oldD=Math.hypot(old[0].x-old[1].x,old[0].y-old[1].y),newD=Math.hypot(now[0].x-now[1].x,now[0].y-now[1].y);
  if(oldD>5)camera.zoom=clamp(camera.zoom*newD/oldD,.65,2.3);
  const cdx=(now[0].x+now[1].x-old[0].x-old[1].x)/2;
  const cdy=(now[0].y+now[1].y-old[0].y-old[1].y)/2;
  camera.x=clamp(camera.x-cdx*Math.cos(camera.yaw)*.015,.5,W-.5);camera.z=clamp(camera.z+cdy*.015,.5,D-.5);
  if(camera.mode==='follow')camera.mode='street';updateButtons();
 }
});
canvas.addEventListener('pointerup',e=>mouse.pointers.delete(e.pointerId));canvas.addEventListener('pointercancel',e=>mouse.pointers.delete(e.pointerId));
canvas.addEventListener('wheel',e=>{e.preventDefault();camera.zoom=clamp(camera.zoom*(e.deltaY>0?.94:1.06),.65,2.3)},{passive:false});
function resize(){const r=canvas.getBoundingClientRect();fw=r.width;fh=r.height;dpr=Math.min(1.6,window.devicePixelRatio||1);canvas.width=Math.max(2,Math.round(fw*dpr));canvas.height=Math.max(2,Math.round(fh*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);}
window.addEventListener('resize',resize);resize();
function targetPosition(){if(state.currentTravel?.route?.length){const passed=Math.min(.95,Math.max(0,(performance.now()-lastRemote)/60000));const r=advanceWalkingRoute({x:state.x,z:state.z},state.currentTravel.route,passed*TIME.simMinutesPerRealMinute*WALK_UNITS_PER_SIM_MINUTE);return {x:r.x,z:r.z};}
 return {x:Number(state.x)||rollo.x,z:Number(state.z)||rollo.z};}
async function refresh(){if(!BASE||fetching)return;fetching=true;
 try{const r=await fetch(BASE+'/state',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();if(!Number.isFinite(d.x)||!Number.isFinite(d.z))throw Error('Missing coordinates');
  state=d;lastRemote=performance.now();stateStatus='Rollo is online';
  if(!cloudPositionReady){rollo={x:d.x,z:d.z};cloudPositionReady=true;}
  $('live-status').textContent=stateStatus;
  $('rollo-activity').textContent=String(d.activity||'Taking a look around').replace(/\s*\(\d+\s+simulated minutes? left\)/gi,'');
  $('rollo-thought').textContent=d.thought||'Something caught my attention.';
  $('town-time').textContent=`Day ${d.day} · ${String(Math.floor(d.hour)).padStart(2,'0')}:${String(Math.floor(d.minute||0)).padStart(2,'0')}`;
 }catch(err){stateStatus='Offline town preview';$('live-status').textContent=stateStatus;}finally{fetching=false;}
}
let last=performance.now();function animate(now){const dt=Math.min(.07,(now-last)/1000);last=now;
 const f=(keys.has('w')||keys.has('arrowup')||held.has('up')?1:0)-(keys.has('s')||keys.has('arrowdown')||held.has('down')?1:0);
 const side=(keys.has('d')||keys.has('arrowright')||held.has('right')?1:0)-(keys.has('a')||keys.has('arrowleft')||held.has('left')?1:0);
 if(f||side)walk(f,side,dt);
 const target=targetPosition(),beforeX=rollo.x,beforeZ=rollo.z;rollo.x+=(target.x-rollo.x)*Math.min(1,dt*3.4);rollo.z+=(target.z-rollo.z)*Math.min(1,dt*3.4);const moved=Math.hypot(rollo.x-beforeX,rollo.z-beforeZ);rolloMoving=moved>0.0006;walkDistance+=moved;
 if(camera.mode==='follow'){
  const tx=rollo.x-4.0,tz=rollo.z+5.2;
  camera.x+=(tx-camera.x)*Math.min(1,dt*2.4);camera.z+=(tz-camera.z)*Math.min(1,dt*2.4);
  cameraLookAt(rollo.x,1.0,rollo.z);
 }
 render(now);requestAnimationFrame(animate);
}
$('town-time').textContent='Day 1 · 08:00';$('live-status').textContent='Town preview';street();requestAnimationFrame(animate);refresh();setInterval(refresh,20000);
