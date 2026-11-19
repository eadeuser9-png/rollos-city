/** Rollo's conservative earnings ledger and wishlist.
 * Stripe webhooks authenticate reported sales; the owner reconciles bank-cleared NET
 * proceeds after fees/refunds. Both are required before any money is spendable.
 * No card numbers, payment tokens, bank details, address or purchasing APIs here.
 * A reservation means a proposed manual purchase only. Never places an order.
 */
import {defaults} from './spending-guard.js';
const j=(req,env,value,status=200)=>{
 const origin=req.headers.get('Origin')||'';
 return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':origin&&origin===env.SITE_ORIGIN?origin:'null','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'}});
};
const owner=(req,env)=>Boolean(env.WORLD_ADMIN_TOKEN||env.OWNER_TOKEN)&&req.headers.get('Authorization')===`Bearer ${env.WORLD_ADMIN_TOKEN||env.OWNER_TOKEN}`;
const sameOrigin=(req,env)=>req.headers.get('Origin')===env.SITE_ORIGIN;
const clean=(x,max)=>String(x||'').trim().slice(0,max);
const maxCents=(x,fall)=>{const v=Number(x);return Number.isSafeInteger(v)&&v>0?v:fall};
const money=(x)=>Number.isSafeInteger(x)&&x>0&&x<=200000000;
function storeUrl(s){if(!s)return '';try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&u.port===''&&u.href.length<=700?u.href:''}catch{return ''}}
const redacted=(r)=>({id:r.id,item:r.item,category:r.category,reason:r.reason,topic:r.topic,origin:r.origin,state:r.state,estimated_total_cents:r.total_cents,store_url:r.store_url||'',status:r.reservation_status||null,created_at:r.created_at});
async function getWishRows(env){const r=await env.DB.prepare(`SELECT w.*,r.status AS reservation_status FROM rollo_wishlist w LEFT JOIN wallet_reservations r ON r.wishlist_id=w.id ORDER BY w.id DESC LIMIT 80`).all();return r.results||[];}
export async function walletTotals(env){
 const a=await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN disputed=1 THEN 0 ELSE MAX(0,gross_cents-refunded_cents) END),0) AS net,COALESCE(SUM(gross_cents),0) AS gross,COUNT(*) AS sales FROM stripe_sales`).first();
 const b=await env.DB.prepare('SELECT COALESCE(SUM(amount_cents),0) AS cleared,COUNT(*) AS payouts FROM wallet_cleared_deposits').first();
 const c=await env.DB.prepare("SELECT COALESCE(SUM(amount_cents),0) AS held FROM wallet_reservations WHERE status IN ('reserved','spent')").first();
 // Legacy approved purchase proposals also occupy funds until retired.
 const d=await env.DB.prepare("SELECT COALESCE(SUM(amount_cents),0) AS held FROM purchase_requests WHERE status='approved'").first();
 const gross=Number(a?.gross||0),net=Math.max(0,Number(a?.net||0)),cleared=Number(b?.cleared||0),held=Number(c?.held||0)+Number(d?.held||0);
 return {currency:'USD',verified_gross_cents:gross,verified_net_after_refunds_cents:net,owner_reconciled_net_payouts_cents:cleared,committed_cents:held,available_cents:Math.max(0,Math.min(net,cleared)-held),verified_sales:Number(a?.sales||0),payout_records:Number(b?.payouts||0),payment_execution_enabled:false,automated_purchases:false,notice:'Verified sales are not the same as cash received. The owner must reconcile net payouts after fees, then complete any purchase manually.'};
}
const equal=(a,b)=>{if(a.length!==b.length)return false;let mismatch=0;for(let k=0;k<a.length;k++)mismatch|=a.charCodeAt(k)^b.charCodeAt(k);return mismatch===0};
export async function verifyStripeSignature(raw,header,secret,now=Date.now()){
 if(!secret||!header||raw.length>200000)return false;
 const entries=String(header).split(',').map(x=>x.trim());
 const stamp=entries.find(x=>x.startsWith('t='))?.slice(2);
 const signatures=entries.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3).toLowerCase());
 if(!stamp||!/^[0-9]{9,12}$/.test(stamp)||!signatures.length||Math.abs(now/1000-Number(stamp))>300)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stamp+'.'+raw));
 const expected=Array.from(new Uint8Array(signed)).map(b=>b.toString(16).padStart(2,'0')).join('');
 return signatures.some(sig=>/^[a-f0-9]{64}$/.test(sig)&&equal(sig,expected));
}
export async function stripeWebhook(req,env){
 if(req.method!=='POST')return j(req,env,{error:'POST only'},405);
 const secret=String(env.STRIPE_WEBHOOK_SECRET||'');if(!secret)return j(req,env,{error:'Stripe webhook not configured'},503);
 if(Number(req.headers.get('Content-Length')||0)>200000)return j(req,env,{error:'Payload too large'},413);
 const raw=await req.text();if(!await verifyStripeSignature(raw,req.headers.get('Stripe-Signature'),secret))return j(req,env,{error:'Invalid webhook signature'},400);
 let event;try{event=JSON.parse(raw)}catch{return j(req,env,{error:'Invalid event'},400)}
 if(typeof event.id!=='string'||!/^evt_[A-Za-z0-9]+$/.test(event.id)||typeof event.type!=='string')return j(req,env,{error:'Invalid event metadata'},400);
 // Test/sandbox transactions are never counted as REAL earnings.
 if(event.livemode!==true)return j(req,env,{received:true,ignored:'not a live payment'});
 const obj=event.data?.object||{};
 const now=Date.now();
 // Note: D1 serialization plus idempotent INSERT/UPDATE prevents duplicate sales/refunds.
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
  const id=obj.id,link=obj.payment_link,intent=obj.payment_intent;
  const amount=obj.amount_total;
  if(obj.mode==='payment'&&obj.payment_status==='paid'&&/^cs_[A-Za-z0-9_]+$/.test(String(id))&&/^plink_[A-Za-z0-9]+$/.test(String(link))&&money(amount)&&String(obj.currency).toLowerCase()==='usd'){
   const listed=await env.DB.prepare('SELECT creation_id FROM stripe_listing_links WHERE payment_link_id=?').bind(link).first();
   if(listed){
    await env.DB.prepare(`INSERT OR IGNORE INTO stripe_sales (session_id,payment_intent_id,payment_link_id,gross_cents,created_at) VALUES (?,?,?,?,?)`).bind(id,/^pi_[A-Za-z0-9]+$/.test(String(intent))?intent:null,link,amount,now).run();
   }
  }
 }else if(event.type==='charge.refunded'){
  // amount_refunded is cumulative, not a delta. Never double-deduct repeated events.
  const intent=obj.payment_intent,refund=obj.amount_refunded;
  if(/^pi_[A-Za-z0-9]+$/.test(String(intent))&&Number.isSafeInteger(refund)&&refund>=0){
   await env.DB.prepare(`UPDATE stripe_sales SET refunded_cents=MIN(gross_cents,MAX(refunded_cents,?)) WHERE payment_intent_id=?`).bind(refund,intent).run();
  }
 }else if(event.type==='charge.dispute.created'){
  const intent=obj.payment_intent;
  if(/^pi_[A-Za-z0-9]+$/.test(String(intent)))await env.DB.prepare('UPDATE stripe_sales SET disputed=1 WHERE payment_intent_id=?').bind(intent).run();
 }
 await env.DB.prepare('INSERT OR IGNORE INTO stripe_webhook_events(event_id,kind,received_at) VALUES (?,?,?)').bind(event.id,event.type,now).run();
 return j(req,env,{received:true});
}
export async function maybeAddWish(env,s,propose){
 if((s.actions||0)<5||(s.actions||0)%5!==0)return;
 const top=Object.entries(s.mind?.interests||{}).map(([topic,data])=>({topic,score:Number(data.score||0)})).sort((a,b)=>b.score-a.score)[0];
 if(!top||top.score<3)return;
 const existing=await env.DB.prepare('SELECT id FROM rollo_wishlist WHERE topic=? LIMIT 1').bind(top.topic).first();if(existing)return;
 // Candidate types are intentionally non-hazardous. The model may propose text, not URLs or prices.
 const t=top.topic.toLowerCase();let fallback={item:'A book about '+top.topic,category:'books',reason:'I keep returning to '+top.topic+' and want to understand it better.'};
 if(/light|color|optics/.test(t))fallback={item:'A beginner prism kit',category:'science',reason:'I want to investigate how light changes color.'};
 else if(/balance|shape|engineering|mechanic/.test(t))fallback={item:'A tabletop balance scale',category:'science',reason:'I want to experiment with how weight changes the way objects move.'};
 else if(/history|old/.test(t))fallback={item:'A local history picture book',category:'books',reason:'I keep wondering about the older parts of this neighborhood.'};
 else if(/garden|food|preserv/.test(t))fallback={item:'A beginner gardening book',category:'books',reason:'I want to learn how to look after the food I grow.'};
 const offered=typeof propose==='function'?await propose(top.topic):null;
 const categories=['books','art','science','garden','tools'];
 const valid=offered&&categories.includes(offered.category)&&typeof offered.item==='string'&&offered.item.trim().length>=3&&offered.item.length<=80&&typeof offered.reason==='string'&&offered.reason.trim().length>=10&&offered.reason.length<=160&& !/https?:|\b(?:weapon|drug|tobacco|vape|alcohol|gun|knife|explosive)\b/i.test(offered.item+' '+offered.reason);
 const idea=valid?offered:fallback,origin=valid?'ai':'rules';
 await env.DB.prepare('INSERT INTO rollo_wishlist (item,category,reason,topic,origin,decided_day,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(idea.item.trim(),idea.category,idea.reason.trim(),top.topic,origin,s.day,Date.now(),Date.now()).run();
 return {item:idea.item,topic:top.topic,origin};
}
export async function walletApi(req,env,url){
 const path=url.pathname;
 if(path==='/stripe/webhook')return stripeWebhook(req,env);
 if(!['/wallet','/wishlist','/owner/wallet','/owner/wallet/clear','/owner/wishlist','/owner/stripe-link'].includes(path)&&!/^\/owner\/wishlist\/\d+\/(update|reserve|release|spent|dismiss)$/.test(path))return null;
 if(path==='/wallet'&&req.method==='GET')return j(req,env,{wallet:await walletTotals(env)});
 if(path==='/wishlist'&&req.method==='GET'){
  const rows=await getWishRows(env);return j(req,env,{wishes:rows.filter(x=>x.state!=='dismissed').map(redacted),notice:'Wishes are ideas, not product offers or placed orders. Prices are owner-provided estimates.'});
 }
 if(!owner(req,env))return j(req,env,{error:'Owner authorization required'},401);
 if(path==='/owner/wallet'&&req.method==='GET'){
  const rows=await env.DB.prepare('SELECT reference,amount_cents,note,confirmed_at FROM wallet_cleared_deposits ORDER BY confirmed_at DESC LIMIT 40').all();
  return j(req,env,{wallet:await walletTotals(env),payouts:rows.results||[],stripe_webhook_configured:!!env.STRIPE_WEBHOOK_SECRET,notice:'Reconcile only actual NET funds that reached your bank. Never count simulated bar work as dollars.'});
 }
 if(path==='/owner/wishlist'&&req.method==='GET')return j(req,env,{wishes:(await getWishRows(env)).map(redacted)});
 if(req.method!=='POST')return j(req,env,{error:'POST required'},405);
 if(!sameOrigin(req,env))return j(req,env,{error:'Make changes from the configured Owner Studio'},403);
 let body;try{body=await req.json()}catch{return j(req,env,{error:'Invalid JSON'},400)}
 if(path==='/owner/wallet/clear'){
  const amount=body?.amount_cents,ref=clean(body?.reference,80),note=clean(body?.note,160);
  if(!money(amount)||!/^po_[A-Za-z0-9]+$/.test(ref))return j(req,env,{error:'Provide a positive net payout amount and Stripe payout ID (po_...).'},400);
  const r=await env.DB.prepare(`INSERT OR IGNORE INTO wallet_cleared_deposits(reference,amount_cents,note,confirmed_at)
   SELECT ?,?,?,? WHERE ? + (SELECT COALESCE(SUM(amount_cents),0) FROM wallet_cleared_deposits)
   <= (SELECT COALESCE(SUM(CASE WHEN disputed=1 THEN 0 ELSE MAX(0,gross_cents-refunded_cents) END),0) FROM stripe_sales)`).bind(ref,amount,note,Date.now(),amount).run();
  return r.meta?.changes===1?j(req,env,{ok:true,wallet:await walletTotals(env)}):j(req,env,{error:'Duplicate payout ID or amount exceeds verified net Rollo sales. Nothing credited.'},409);
 }
 if(path==='/owner/stripe-link'){
  const id=body?.creation_id,link=clean(body?.payment_link_id,80);
  if(!Number.isSafeInteger(id)||id<=0||!/^plink_[A-Za-z0-9]+$/.test(link))return j(req,env,{error:'Provide a valid artwork ID and Stripe Payment Link ID (plink_...).'},400);
  const listing=await env.DB.prepare('SELECT creation_id FROM art_listings WHERE creation_id=?').bind(id).first();if(!listing)return j(req,env,{error:'First create this artwork listing in Owner Studio.'},404);
  try{await env.DB.prepare('INSERT INTO stripe_listing_links(creation_id,payment_link_id) VALUES (?,?) ON CONFLICT(creation_id) DO UPDATE SET payment_link_id=excluded.payment_link_id').bind(id,link).run();}
  catch{return j(req,env,{error:'This Stripe link is already assigned to a different artwork.'},409)}
  return j(req,env,{ok:true,notice:'Only completed and signed payment events from this Stripe Payment Link will count as Rollo sales.'});
 }
 const match=path.match(/^\/owner\/wishlist\/(\d+)\/(update|reserve|release|spent|dismiss)$/);
 if(!match)return j(req,env,{error:'Not found'},404);
 const id=Number(match[1]),cmd=match[2];
 const wish=await env.DB.prepare('SELECT id,state,total_cents FROM rollo_wishlist WHERE id=?').bind(id).first();if(!wish)return j(req,env,{error:'Wishlist item missing'},404);
 const reservation=await env.DB.prepare('SELECT status FROM wallet_reservations WHERE wishlist_id=?').bind(id).first();
 if(cmd==='update'){
  if(reservation&&reservation.status!=='released')return j(req,env,{error:'Release the reserved funds before editing the price'},409);
  const cents=body?.total_cents;
  if(cents!==null&&(!Number.isSafeInteger(cents)||cents<1||cents>10000000))return j(req,env,{error:'Enter an all-in USD amount in cents (item + taxes + shipping).'},400);
  const urlValue=body?.store_url?storeUrl(body.store_url):'';
  if(body?.store_url&&!urlValue)return j(req,env,{error:'Store URL must be a valid HTTPS link'},400);
  await env.DB.prepare('UPDATE rollo_wishlist SET total_cents=?,store_url=?,updated_at=? WHERE id=?').bind(cents,urlValue,Date.now(),id).run();
  return j(req,env,{ok:true});
 }
 if(cmd==='dismiss'){
  if(reservation?.status==='reserved'||reservation?.status==='spent')return j(req,env,{error:'Release funds before dismissing; completed purchases stay recorded.'},409);
  await env.DB.prepare("UPDATE rollo_wishlist SET state='dismissed',updated_at=? WHERE id=?").bind(Date.now(),id).run();return j(req,env,{ok:true});
 }
 if(cmd==='reserve'){
  if(wish.state!=='wished'||reservation&&reservation.status!=='released')return j(req,env,{error:'Wishlist item is not available for reservation'},409);
  const amount=wish.total_cents,limit=maxCents(env.MAX_TRANSACTION_CENTS,defaults.maxTransactionCents),monthCap=maxCents(env.MONTHLY_CAP_CENTS,defaults.monthlyCapCents);
  if(!money(amount)||amount>limit)return j(req,env,{error:'Enter an all-in price that fits the per-item cap.'},403);
  // Holds are deliberately never real purchases. A single INSERT checks all three caps atomically.
  const r=await env.DB.prepare(`INSERT INTO wallet_reservations (wishlist_id,amount_cents,status,created_at,updated_at)
   SELECT ?,?,'reserved',?,? WHERE
     ? <= (SELECT MAX(0,MIN(
      (SELECT COALESCE(SUM(CASE WHEN disputed=1 THEN 0 ELSE MAX(0,gross_cents-refunded_cents) END),0) FROM stripe_sales),
      (SELECT COALESCE(SUM(amount_cents),0) FROM wallet_cleared_deposits))
      - (SELECT COALESCE(SUM(amount_cents),0) FROM wallet_reservations WHERE status IN ('reserved','spent'))
      - (SELECT COALESCE(SUM(amount_cents),0) FROM purchase_requests WHERE status='approved')))
     AND ? <= ? - (SELECT COALESCE(SUM(amount_cents),0) FROM wallet_reservations WHERE status IN ('reserved','spent') AND substr(datetime(created_at/1000,'unixepoch'),1,7)=?)
     - (SELECT COALESCE(SUM(amount_cents),0) FROM purchase_requests WHERE status='approved' AND budget_month=?)
   ON CONFLICT(wishlist_id) DO UPDATE SET amount_cents=excluded.amount_cents,status='reserved',created_at=excluded.created_at,updated_at=excluded.updated_at
     WHERE wallet_reservations.status='released'`).bind(id,amount,Date.now(),Date.now(),amount,amount,monthCap,new Date().toISOString().slice(0,7),new Date().toISOString().slice(0,7)).run();
  return r.meta?.changes===1?j(req,env,{ok:true,charged:false,message:'Funds reserved for an OWNER-MANAGED purchase. No order was placed.'}):j(req,env,{error:'Insufficient cleared earnings or monthly limit reached. No order was placed.'},409);
 }
 if(cmd==='release'||cmd==='spent'){
  const from='reserved',to=cmd==='release'?'released':'spent';
  const r=await env.DB.prepare('UPDATE wallet_reservations SET status=?,updated_at=? WHERE wishlist_id=? AND status=?').bind(to,Date.now(),id,from).run();
  return r.meta?.changes===1?j(req,env,{ok:true,charged:false,status:to,note:to==='spent'?'Owner confirmed a MANUALLY completed purchase. No payment was executed by Rollo.':'Reserved funds released. No payment made.'}):j(req,env,{error:'Only active reservations may be changed'},409);
 }
 return j(req,env,{error:'Not found'},404);
}
