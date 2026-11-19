import {CITY_PLACES} from './world-data.js';
import {storeContributor} from './social-store.js';
// Shared city permissions and visitor contributions. No owner credentials in public site files.
export function validatePlace(x){
 if(!x||typeof x!=='object')return null;
 const name=String(x.name||'').trim(),kind=String(x.kind||'');
 const px=Number(x.x),pz=Number(x.z);
 if(name.length<2||name.length>36||!['library','workshop','forum','garden','market','alley'].includes(kind)||!Number.isFinite(px)||!Number.isFinite(pz)||px<.8||px>11.2||pz<.8||pz>11.2)return null;
 return {name,kind,x:px,z:pz,w:1.25,d:1.05,h:kind==='alley'?.3:1.1,description:`A new ${kind} in North Quay.`};
}
export function validateForum(x){
 const name=String(x?.name||'Visitor').trim(),body=String(x?.body||'').trim();
 if(name.length<2||name.length>24||body.length<2||body.length>360||/\b(?:https?:\/\/|www\.)/i.test(body)||/^(rollo|owner|admin|moderator)$/i.test(name))return null;
 return {name,body};
}
export function validateWebp(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<32||bytes.length>2_000_000)return false;
 const s=(i,n)=>String.fromCharCode(...bytes.subarray(i,i+n));
 if(s(0,4)!=='RIFF'||s(8,4)!=='WEBP')return false;
 const len=(bytes[4]|bytes[5]<<8|bytes[6]<<16|bytes[7]<<24)>>>0;
 if(len+8!==bytes.length)return false;
 // For a simple, browser-reencoded WebP: reject metadata chunks and malformed chunk lengths.
 let p=12, first=false;
 while(p+8<=bytes.length){const name=s(p,4);const n=(bytes[p+4]|bytes[p+5]<<8|bytes[p+6]<<16|bytes[p+7]<<24)>>>0;
  if(!['VP8 ','VP8L','VP8X','ALPH','ANIM','ANMF'].includes(name)||p+8+n>bytes.length)return false;
  if(name==='VP8 '){if(n<10||bytes[p+11]!==0x9d||bytes[p+12]!==0x01||bytes[p+13]!==0x2a)return false;first=true;}
  if(name==='VP8L'){if(n<5||bytes[p+8]!==0x2f)return false;first=true;}
  if(name==='VP8X'&&(n<10||(bytes[p+8]&0x0c)!==0))return false;
  p+=8+n+(n%2);
 }
 return first&&p===bytes.length;
}
const cors=(req,env)=>{const origin=req.headers.get('Origin')||'';const same=origin===env.SITE_ORIGIN;return {'Access-Control-Allow-Origin':same?origin:'null','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Visitor-Name, X-Photo-Caption, X-Rollo-Visitor-Id','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'}};
const out=(req,env,data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors(req,env),'Content-Type':'application/json; charset=utf-8'}});
const owner=(req,env)=>Boolean(env.WORLD_ADMIN_TOKEN)&&req.headers.get('Authorization')===`Bearer ${env.WORLD_ADMIN_TOKEN}`;
const site=(req,env)=>req.headers.get('Origin')===env.SITE_ORIGIN;
const jsonBody=async req=>{try{return await req.json()}catch{return null}};
async function bytesLimited(req,limit){
 if(!req.body)return new Uint8Array();
 const reader=req.body.getReader(),parts=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;if(size>limit){await reader.cancel();return null;}parts.push(value);
 }
 const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.byteLength;}return result;
}
// One shared 24-real-hour allowance across visitor forum and photo submissions.
// This is per persistent anonymous browser ID. It is not a verified human identity.
const REAL_DAY_MS=24*60*60*1000;
function visitorId(request){
 const id=(request.headers.get('X-Rollo-Visitor-Id')||'').trim().toLowerCase();
 return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)?id:null;
}
async function visitorKey(request,env){
 const id=visitorId(request);
 if(!id||!env.VISITOR_RATE_SECRET)return null;
 const raw=new TextEncoder().encode(`${env.VISITOR_RATE_SECRET}:visitor:${id}`);
 const digest=await crypto.subtle.digest('SHA-256',raw);
 return 'v11:'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
async function visitorEligibility(request,env){
 if(!env.VISITOR_RATE_SECRET)return {error:'Visitor identity protection has not been configured.',status:503};
 const key=await visitorKey(request,env);
 if(!key)return {error:'Visitor browser ID required. Please use the Rollo website.',status:400};
 const now=Date.now();
 const row=await env.DB.prepare('SELECT last_at FROM visitor_limits WHERE k=?').bind(key).first();
 const nextAllowedAt=Number(row?.last_at||0)+REAL_DAY_MS;
 if(nextAllowedAt>now)return {allowed:false,nextAllowedAt,retryAfterSeconds:Math.ceil((nextAllowedAt-now)/1000),status:429};
 return {allowed:true,nextAllowedAt:null,retryAfterSeconds:0,status:200};
}
async function claimVisitorInteraction(request,env){
 const check=await visitorEligibility(request,env);
 if(check.error||!check.allowed)return check;
 const key=await visitorKey(request,env),now=Date.now();
 // Atomic UPSERT: simultaneous visitor submissions cannot both pass the same limit.
 const claimed=await env.DB.prepare(`INSERT INTO visitor_limits (k,last_at) VALUES (?,?)
 ON CONFLICT(k) DO UPDATE SET last_at=excluded.last_at WHERE visitor_limits.last_at <= ?`)
  .bind(key,now,now-REAL_DAY_MS).run();
 if(claimed.meta?.changes===1)return {allowed:true,key,claimedAt:now,nextAllowedAt:now+REAL_DAY_MS,status:200};
 return visitorEligibility(request,env);
}
async function releaseVisitorInteraction(env,claim){
 if(claim?.key&&claim?.claimedAt)await env.DB.prepare('DELETE FROM visitor_limits WHERE k=? AND last_at=?').bind(claim.key,claim.claimedAt).run();
}
function cooldownResponse(request,env,claim){
 if(claim.error)return out(request,env,{error:claim.error},claim.status);
 return out(request,env,{error:'You can interact with Rollo once every 24 real hours. Come back after your next available time.',nextAllowedAt:claim.nextAllowedAt,retryAfterSeconds:claim.retryAfterSeconds},429);
}
async function cityPlaces(env){const res=await env.DB.prepare('SELECT id,name,kind,x,z,w,d,h,description FROM city_places ORDER BY id ASC LIMIT 16').all();return res.results||[]}
export async function getCommunityPlaces(env){return cityPlaces(env)}
export async function community(request,env,url,helpers){
 const {getState,putState,stamp}=helpers,method=request.method,p=url.pathname;
 if(p==='/places'&&method==='GET')return out(request,env,{places:await cityPlaces(env)});
 if(p==='/creations'&&method==='GET'){
  // Public, paginated archive so every finished drawing can be seen, not only the newest 30.
  const requested=Number(url.searchParams.get('offset')||0);
  const offset=Number.isSafeInteger(requested)&&requested>=0?Math.min(requested,1000000):0;
  const limit=40;
  const rows=await env.DB.prepare('SELECT id,title,topic,created_at,stamp FROM rollo_creations ORDER BY id DESC LIMIT ? OFFSET ?').bind(limit+1,offset).all();
  const results=rows.results||[];
  const hasMore=results.length>limit;
  return out(request,env,{creations:results.slice(0,limit),nextOffset:hasMore?offset+limit:null});
 }
 if(/^\/creations\/\d+\.svg$/.test(p)&&method==='GET'){
  const id=Number(p.match(/\d+/)[0]);const row=await env.DB.prepare('SELECT svg FROM rollo_creations WHERE id=?').bind(id).first();
  if(!row)return out(request,env,{error:'Drawing not found'},404);
  return new Response(row.svg,{headers:{'Content-Type':'image/svg+xml','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox",'X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=120','Access-Control-Allow-Origin':'*'}});
 }
 if(p==='/photos'&&method==='GET'){
  const rows=await env.DB.prepare("SELECT id,name,caption,created_at FROM visitor_photos WHERE status='approved' ORDER BY id DESC LIMIT 24").all();return out(request,env,{photos:rows.results||[]});
 }
 const photoMatch=p.match(/^\/photos\/(\d+)\.webp$/);
 if(photoMatch&&method==='GET'){
  const row=await env.DB.prepare('SELECT status,object_key FROM visitor_photos WHERE id=?').bind(Number(photoMatch[1])).first();
  if(!row||row.status!=='approved'||!env.PHOTOS)return out(request,env,{error:'Photo unavailable'},404);
  const object=await env.PHOTOS.get(row.object_key);if(!object)return out(request,env,{error:'Photo missing'},404);
  return new Response(object.body,{headers:{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=3600','Access-Control-Allow-Origin':'*'}});
 }
 if(p==='/community/limit'&&method==='GET'){const result=await visitorEligibility(request,env);return out(request,env,result,result.status);}
 if(p==='/community/forum'&&method==='POST'){
  if(!site(request,env))return out(request,env,{error:'Submit from Rollo’s website.'},403);
  if(env.VISITOR_SUBMISSIONS!=='true')return out(request,env,{error:'Visitor submissions are currently closed.'},503);
  const data=await jsonBody(request);if(data?.website)return out(request,env,{ok:true,status:'pending'},202); // honeypot
  const clean=validateForum(data);if(!clean)return out(request,env,{error:'Use a name (2–24 chars) and message (2–360 chars), without links.'},400);
  const pending=await env.DB.prepare("SELECT COUNT(*) n FROM visitor_posts WHERE status='pending'").first();
  if(pending?.n>=200)return out(request,env,{error:'Moderation queue is full. Try later.'},503);
  const claim=await claimVisitorInteraction(request,env);if(!claim.allowed)return cooldownResponse(request,env,claim);
  try{
   const saved=await env.DB.prepare('INSERT INTO visitor_posts (name,body,status,created_at) VALUES (?, ?, ?, ?)').bind(clean.name,clean.body,'pending',Date.now()).run();
   await storeContributor(env,'forum',saved.meta?.last_row_id,claim.key);
  }catch(e){await releaseVisitorInteraction(env,claim);throw e;}
  return out(request,env,{ok:true,status:'pending',nextAllowedAt:claim.nextAllowedAt,notice:'Your message will appear if the owner approves it. Your next visitor interaction is available in 24 real hours.'},202);
 }
 if(p==='/community/photos'&&method==='POST'){
  if(!site(request,env))return out(request,env,{error:'Submit from Rollo’s website.'},403);
  if(env.VISITOR_SUBMISSIONS!=='true'||!env.PHOTOS)return out(request,env,{error:'Photo submissions are not yet enabled.'},503);
  if(request.headers.get('Content-Type')!=='image/webp')return out(request,env,{error:'Only re-encoded WebP images are accepted.'},415);
  const size=Number(request.headers.get('Content-Length'));
  if(Number.isFinite(size)&&size>2_000_000)return out(request,env,{error:'Maximum 2MB.'},413);
  const name=(request.headers.get('X-Visitor-Name')||'Visitor').trim().slice(0,24);
  const caption=(request.headers.get('X-Photo-Caption')||'A photograph for Rollo').trim().slice(0,180);
  if(!name||!caption)return out(request,env,{error:'Name and caption required.'},400);
  const bytes=await bytesLimited(request,2_000_000);if(!bytes)return out(request,env,{error:'Maximum file size is 2MB.'},413);if(!validateWebp(bytes))return out(request,env,{error:'Invalid or oversized WebP. Please use the website upload form.'},400);
  const pending=await env.DB.prepare("SELECT COUNT(*) n FROM visitor_photos WHERE status='pending'").first();if(pending?.n>=100)return out(request,env,{error:'Photo moderation queue full.'},503);
  const claim=await claimVisitorInteraction(request,env);if(!claim.allowed)return cooldownResponse(request,env,claim);
  const key=`pending/${crypto.randomUUID()}.webp`;
  try{
   await env.PHOTOS.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
   const saved=await env.DB.prepare('INSERT INTO visitor_photos (name,caption,object_key,status,created_at) VALUES (?,?,?,?,?)').bind(name,caption,key,'pending',Date.now()).run();
   await storeContributor(env,'photo',saved.meta?.last_row_id,claim.key);
  }catch(e){try{await env.PHOTOS.delete(key)}catch{}await releaseVisitorInteraction(env,claim);throw e;}
  return out(request,env,{ok:true,status:'pending',nextAllowedAt:claim.nextAllowedAt,notice:'Your photo requires owner approval. Your next visitor interaction is available in 24 real hours.'},202);
 }
 if(p.startsWith('/owner/')){
  if(!owner(request,env))return out(request,env,{error:'Owner access only. Set WORLD_ADMIN_TOKEN first.'},401);
  if(method!=='GET'&&!site(request,env))return out(request,env,{error:'Owner edits must originate from your website.'},403);
  if(p==='/owner/pending'&&method==='GET'){
   const posts=await env.DB.prepare("SELECT id,name,body,created_at FROM visitor_posts WHERE status='pending' ORDER BY id ASC LIMIT 100").all();
   const photos=await env.DB.prepare("SELECT id,name,caption,created_at FROM visitor_photos WHERE status='pending' ORDER BY id ASC LIMIT 100").all();
   return out(request,env,{posts:posts.results||[],photos:photos.results||[]});
  }
  if(p==='/owner/places'&&method==='POST'){
   const clean=validatePlace(await jsonBody(request));if(!clean)return out(request,env,{error:'Invalid name, kind, or position.'},400);
   const current=await cityPlaces(env);if(current.length>=12)return out(request,env,{error:'The lightweight city supports 12 extra buildings.'},409);
   if([...CITY_PLACES,...current].some(q=>Math.hypot(q.x-clean.x,q.z-clean.z)<1.3))return out(request,env,{error:'Too close to an existing building. Try another position.'},409);
   const id=`added-${crypto.randomUUID().slice(0,8)}`;
   await env.DB.prepare('INSERT INTO city_places (id,name,kind,x,z,w,d,h,description) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,clean.name,clean.kind,clean.x,clean.z,clean.w,clean.d,clean.h,clean.description).run();
   return out(request,env,{ok:true,id},201);
  }
  const del=p.match(/^\/owner\/places\/(added-[a-z0-9-]+)$/);
  if(del&&method==='POST'){
   const r=await env.DB.prepare('DELETE FROM city_places WHERE id=?').bind(del[1]).run();return out(request,env,{ok:r.meta?.changes===1});
  }
  const moderation=p.match(/^\/owner\/(posts|photos)\/(\d+)\/(approve|reject)$/);
  if(moderation&&method==='POST'){
   const [,group,number,decision]=moderation,id=Number(number);
   const table=group==='posts'?'visitor_posts':'visitor_photos';
   const row=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
   if(!row||row.status!=='pending')return out(request,env,{error:'Submission not pending.'},404);
   const status=decision==='approve'?'approved':'rejected';
   const changed=await env.DB.prepare(`UPDATE ${table} SET status=? WHERE id=? AND status='pending'`).bind(status,id).run();
   if(changed.meta?.changes!==1)return out(request,env,{error:'Already processed.'},409);
   if(status==='approved'){
    if(group==='posts'){
     const world=await getState(env);
     const post=await env.DB.prepare('INSERT INTO forum_posts(author,body,stamp,created_at) VALUES(?,?,?,?)').bind(row.name,row.body,stamp(world),Date.now()).run();
     world.pending=(world.pending||[]).concat([{kind:'forum',author:row.name,body:row.body.slice(0,360),sourceId:post.meta?.last_row_id||null,contributionId:row.id}]).slice(-20);
     await putState(env,world);
    }else{
     const world=await getState(env);
     world.pending=(world.pending||[]).concat([{kind:'photo',author:row.name,caption:row.caption.slice(0,180),sourceId:row.id,contributionId:row.id}]).slice(-20);
     await putState(env,world);
    }
   }
   return out(request,env,{ok:true,status});
  }
  const preview=p.match(/^\/owner\/photos\/(\d+)\.webp$/);
  if(preview&&method==='GET'){
   if(!env.PHOTOS)return out(request,env,{error:'Photo storage unavailable'},503);
   const row=await env.DB.prepare('SELECT object_key FROM visitor_photos WHERE id=?').bind(Number(preview[1])).first();
   if(!row)return out(request,env,{error:'Photo not found'},404);
   const object=await env.PHOTOS.get(row.object_key);if(!object)return out(request,env,{error:'Photo missing'},404);
   return new Response(object.body,{headers:{...cors(request,env),'Content-Type':'image/webp','Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}});
  }
  return out(request,env,{error:'Unknown owner endpoint.'},404);
 }
 return null;
}

// Allow other moderated visitor interactions to share the existing 24-hour
// server-side allowance rather than accidentally creating a second quota.
export {claimVisitorInteraction,releaseVisitorInteraction};
