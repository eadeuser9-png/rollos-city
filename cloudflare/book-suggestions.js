/** Community book suggestions. Anyone can nominate a title, only an authenticated
 * owner can accept/reject it. Nominations never modify Rollo's readable books,
 * reading history, interests, or AI decisions. No external URL is fetched.
 */
import {claimVisitorInteraction,releaseVisitorInteraction} from './community.js';

const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const out=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const trim=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max+1):'';
const owner=(req,env)=>{const secret=env.WORLD_ADMIN_TOKEN||env.OWNER_TOKEN;return Boolean(secret)&&req.headers.get('Authorization')===`Bearer ${secret}`;};
const sameSite=(req,env)=>Boolean(env.SITE_ORIGIN)&&req.headers.get('Origin')===env.SITE_ORIGIN;
export function validateSuggestion(raw){
 if(!raw||typeof raw!=='object')return null;
 const title=trim(raw.title,121),author=trim(raw.author,101),reason=trim(raw.reason,361),source=trim(raw.source_url,451);
 if(title.length<3||title.length>120||author.length>100||reason.length<5||reason.length>360)return null;
 if(raw.website)return null; // Honeypot processed separately.
 let source_url='';
 if(source){try{const u=new URL(source);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.href.length>450)return null;source_url=u.href;}catch{return null;}}
 return {title,author,reason,source_url};
}
async function limitedJson(req){
 const reader=req.body?.getReader();if(!reader)return null;let total=0,chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>2500){await reader.cancel();return null;}chunks.push(value);}}
 catch{return null;}
 const bytes=new Uint8Array(total);let off=0;for(const v of chunks){bytes.set(v,off);off+=v.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{return null;}
}
export async function bookSuggestionApi(req,env,url){
 const path=url.pathname,method=req.method;
 if(path==='/library/suggestions'&&method==='GET'){
  const q=await env.DB.prepare(`SELECT s.id,s.title,s.author,s.created_at,
   EXISTS(SELECT 1 FROM library_books b WHERE lower(trim(b.title))=lower(trim(s.title)) AND b.book_text IS NOT NULL) AS readable
   FROM book_suggestions s WHERE s.status='approved' ORDER BY s.reviewed_at DESC LIMIT 30`).all();
  return out({approved:q.results||[],notice:'Suggestions are not books. Rollo can read them only after a permitted text is added.'});
 }
 if(path==='/library/suggestions'&&method==='POST'){
  if(!sameSite(req,env))return out({error:'Submit from Rollo’s City website.'},403);
  if(env.VISITOR_SUBMISSIONS!=='true')return out({error:'Visitor suggestions are currently closed.'},503);
  const body=await limitedJson(req);if(!body)return out({error:'Invalid or oversized request.'},400);
  if(body.website)return out({ok:true,status:'pending'},202); // honeypot, no insert or cooldown
  const suggestion=validateSuggestion(body);
  if(!suggestion)return out({error:'Enter a title (3–120 characters), an explanation (5–360 characters), optional author and a valid HTTPS source link.'},400);
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM book_suggestions WHERE status='pending'").first();
  if(Number(count?.n||0)>=200)return out({error:'The book suggestion queue is full. Try later.'},503);
  const claim=await claimVisitorInteraction(req,env);
  if(!claim.allowed){return out({error:claim.error||'You can submit one visitor contribution every 24 real hours.',nextAllowedAt:claim.nextAllowedAt||null},claim.status||429);}
  try{
   await env.DB.prepare('INSERT INTO book_suggestions(title,author,reason,source_url,status,created_at) VALUES(?,?,?,?,?,?)')
     .bind(suggestion.title,suggestion.author,suggestion.reason,suggestion.source_url,'pending',Date.now()).run();
  }catch(e){await releaseVisitorInteraction(env,claim);throw e;}
  return out({ok:true,status:'pending',nextAllowedAt:claim.nextAllowedAt,notice:'Submitted privately for owner review. Rollo cannot see this suggestion yet.'},202);
 }
 if(path==='/admin/library/suggestions'&&method==='GET'){
  if(!owner(req,env))return out({error:'Owner authorization required.'},401);
  const q=await env.DB.prepare('SELECT id,title,author,reason,source_url,status,created_at,reviewed_at FROM book_suggestions ORDER BY CASE WHEN status=\'pending\' THEN 0 ELSE 1 END,created_at DESC LIMIT 150').all();
  return out({suggestions:q.results||[]});
 }
 const match=path.match(/^\/admin\/library\/suggestions\/(\d+)\/(approve|reject)$/);
 if(match&&method==='POST'){
  if(!owner(req,env))return out({error:'Owner authorization required.'},401);
  if(!sameSite(req,env))return out({error:'Review suggestions from your configured Rollo website.'},403);
  const id=Number(match[1]);if(!Number.isSafeInteger(id)||id<1)return out({error:'Invalid suggestion ID.'},400);
  const status=match[2]==='approve'?'approved':'rejected';
  const result=await env.DB.prepare("UPDATE book_suggestions SET status=?,reviewed_at=? WHERE id=? AND status='pending'").bind(status,Date.now(),id).run();
  if(result.meta?.changes!==1)return out({error:'Suggestion was not pending or does not exist.'},409);
  return out({ok:true,status,readable:false,notice:status==='approved'?'Approved suggestion. Upload a legally permitted TXT or PDF to make the book readable; Rollo decides whether to read it.':'Suggestion rejected without publishing it.'});
 }
 return null;
}
