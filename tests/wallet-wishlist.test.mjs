import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../cloudflare/worker.js';
import {maybeAddWish} from '../cloudflare/wallet.js';

const origin='https://rollo.example';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of ['schema.sql','schema_v10.sql','schema_v12.sql','schema_v13.sql','schema_v17.sql'])sqlite.exec(readFileSync(new URL('../cloudflare/'+file,import.meta.url),'utf8'));
 const DB={prepare(q){const statement=sqlite.prepare(q);let args=[];const o={bind(...v){args=v;return o},async first(){return statement.get(...args)||null},async all(){return {results:statement.all(...args)}},async run(){let result=statement.run(...args);return {meta:{changes:result.changes,last_row_id:Number(result.lastInsertRowid)}}}};return o}};
 const env={DB,WORLD_ADMIN_TOKEN:'owner-only',OWNER_TOKEN:'owner-only',SITE_ORIGIN:origin,LIBRARY_DISABLE_AUTO_IMPORT:'true',AI_DECISIONS:'false',AI_THOUGHTS:'false',AI_FORUM_REPLIES:'false',VISITOR_SUBMISSIONS:'false',STRIPE_WEBHOOK_SECRET:'whsec_demo_secret',MAX_TRANSACTION_CENTS:'1000',MONTHLY_CAP_CENTS:'2500',REAL_PURCHASES_ENABLED:'false'};
 async function api(path,method='GET',body,auth=false,reqOrigin=origin){let headers={Origin:reqOrigin};if(auth)headers.Authorization='Bearer owner-only';if(body!==undefined)headers['Content-Type']='application/json';let response=await worker.fetch(new Request('https://worker.example'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);return {status:response.status,body:await response.json()};}
 async function sign(raw){const ts=Math.floor(Date.now()/1000);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const b=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(ts+'.'+raw));return `t=${ts},v1=${Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')}`;}
 async function event(id,type,obj,livemode=true,valid=true){const raw=JSON.stringify({id,type,livemode,data:{object:obj}});let signature=await sign(raw);if(!valid)signature=signature.slice(0,-1)+(signature.endsWith('a')?'b':'a');const r=await worker.fetch(new Request('https://worker.example/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':signature,'Content-Type':'application/json'},body:raw}),env);return {status:r.status,body:await r.json()};}
 const setupListing=async()=>{await DB.prepare('INSERT INTO rollo_creations(title,topic,svg,stamp,created_at) VALUES (?,?,?,?,?)').bind('A sketch','balance','<svg/>','Day 1',Date.now()).run();await DB.prepare("INSERT INTO art_listings(creation_id,price_cents,checkout_url,status,created_at,updated_at) VALUES(1,1500,'https://buy.stripe.com/test','active',?,?)").bind(Date.now(),Date.now()).run();};
 return {env,sqlite,DB,api,event,setupListing};
}
const sale=(id='cs_liveA',paymentLink='plink_ArtA',pi='pi_ArtA',amount=3500)=>({id,mode:'payment',payment_status:'paid',payment_link:paymentLink,payment_intent:pi,amount_total:amount,currency:'usd'});
test('Rollo has no fictional coins, and wallet begins at zero real dollars',async()=>{
 const {api}=fixture();const state=(await api('/state')).body;
 assert.equal('coins' in state,false);assert.equal('barEarnings' in state,false);
 let wallet=(await api('/wallet')).body.wallet;
 assert.equal(wallet.available_cents,0);assert.equal(wallet.payment_execution_enabled,false);assert.equal(wallet.verified_sales,0);
 assert.equal((await api('/owner/wallet')).status,401);
});
test('Stripe webhook must be signed AND live AND mapped to a Rollo artwork',async()=>{
 const f=fixture();await f.setupListing();
 assert.equal((await f.event('evt_forged','checkout.session.completed',sale(),true,false)).status,400);
 assert.equal((await f.event('evt_test','checkout.session.completed',sale(),false)).status,200);
 assert.equal((await f.api('/wallet')).body.wallet.verified_sales,0);
 assert.equal((await f.event('evt_unmapped','checkout.session.completed',sale())).status,200);
 assert.equal((await f.api('/wallet')).body.wallet.verified_sales,0);
 assert.equal((await f.api('/owner/stripe-link','POST',{creation_id:1,payment_link_id:'plink_ArtA'},true)).status,200);
 assert.equal((await f.event('evt_first','checkout.session.completed',sale())).status,200);
 assert.equal((await f.event('evt_first','checkout.session.completed',sale())).status,200);
 assert.equal((await f.event('evt_second','checkout.session.completed',sale())).status,200);
 let wallet=(await f.api('/wallet')).body.wallet;
 assert.equal(wallet.verified_sales,1);assert.equal(wallet.verified_gross_cents,3500);
 assert.equal(wallet.owner_reconciled_net_payouts_cents,0);assert.equal(wallet.available_cents,0);
 assert.equal((await f.api('/owner/wallet/clear','POST',{reference:'po_PayoutA',amount_cents:3000},true)).status,200);
 assert.equal((await f.api('/owner/wallet/clear','POST',{reference:'po_PayoutA',amount_cents:3000},true)).status,409);
 assert.equal((await f.api('/owner/wallet/clear','POST',{reference:'po_PayoutB',amount_cents:600},true)).status,409);
 assert.equal((await f.api('/wallet')).body.wallet.available_cents,3000);
});
test('wishlist holds cannot overspend, place orders, or bypass monthly/per-purchase caps',async()=>{
 const f=fixture();await f.setupListing();await f.api('/owner/stripe-link','POST',{creation_id:1,payment_link_id:'plink_ArtA'},true);
 await f.event('evt_sale','checkout.session.completed',sale('cs_liveB','plink_ArtA','pi_ArtB',4000));
 await f.api('/owner/wallet/clear','POST',{reference:'po_PayoutA',amount_cents:3000},true);
 const s={actions:5,day:2,mind:{interests:{'shapes and balance':{score:7}}}};
 const result=await maybeAddWish(f.env,s,async()=>({item:'Small balance kit',category:'science',reason:'To investigate weight and tilt'}));
 assert.equal(result.origin,'ai');
 let wishes=(await f.api('/wishlist')).body.wishes;assert.equal(wishes.length,1);const id=wishes[0].id;
 assert.equal((await f.api(`/owner/wishlist/${id}/reserve`,'POST',{},true)).status,403,'no known all-in price');
 assert.equal((await f.api(`/owner/wishlist/${id}/update`,'POST',{total_cents:900,store_url:'https://example.org/science-kit'},true)).status,200);
 assert.equal((await f.api(`/owner/wishlist/${id}/reserve`,'POST',{},false)).status,401);
 assert.equal((await f.api(`/owner/wishlist/${id}/reserve`,'POST',{},true,'https://untrusted.org')).status,403);
 let reserved=await f.api(`/owner/wishlist/${id}/reserve`,'POST',{},true);assert.equal(reserved.status,200);assert.equal(reserved.body.charged,false);
 assert.equal((await f.api('/wallet')).body.wallet.available_cents,2100);
 assert.equal((await f.api(`/owner/wishlist/${id}/reserve`,'POST',{},true)).status,409);
 assert.equal((await f.api(`/owner/wishlist/${id}/spent`,'POST',{},true)).status,200);
 assert.equal((await f.api('/wallet')).body.wallet.available_cents,2100,'purchases retain their commitment');
 assert.equal((await f.api(`/owner/wishlist/${id}/release`,'POST',{},true)).status,409,'spent cannot be undone by releasing');
 assert.equal((await f.api(`/owner/wishlist/${id}/update`,'POST',{total_cents:4500},true)).status,409);
});
test('refunds and disputed charges decrease money available, even after payout reconciliation',async()=>{
 const f=fixture();await f.setupListing();await f.api('/owner/stripe-link','POST',{creation_id:1,payment_link_id:'plink_ArtA'},true);
 await f.event('evt_sale','checkout.session.completed',sale());
 await f.api('/owner/wallet/clear','POST',{reference:'po_PayoutA',amount_cents:3000},true);
 assert.equal((await f.api('/wallet')).body.wallet.available_cents,3000);
 await f.event('evt_ref1','charge.refunded',{payment_intent:'pi_ArtA',amount_refunded:2000});
 await f.event('evt_ref2','charge.refunded',{payment_intent:'pi_ArtA',amount_refunded:2000});
 assert.equal((await f.api('/wallet')).body.wallet.available_cents,1500);
 await f.event('evt_dispute','charge.dispute.created',{payment_intent:'pi_ArtA'});
 assert.equal((await f.api('/wallet')).body.wallet.available_cents,0);
});
test('Rollo ignores unknown webhook events, avoids duplicate wishes, and rejects dangerous AI suggestions',async()=>{
 const f=fixture();const s={actions:5,day:2,mind:{interests:{'local history':{score:4}}}};
 const wish=await maybeAddWish(f.env,s,async()=>({item:'weapon',reason:'A dangerous thing to buy',category:'tools'}));
 assert.equal(wish.origin,'rules');
 assert.equal((await f.api('/wishlist')).body.wishes[0].item,'A local history picture book');
 await maybeAddWish(f.env,s);
 assert.equal((await f.api('/wishlist')).body.wishes.length,1);
 assert.equal((await f.event('evt_random','customer.created',{id:'cus_test'})).status,200);
 assert.equal((await f.api('/wallet')).body.wallet.available_cents,0);
});
test('Etsy may appear only as an owner-reviewed direct listing link, never as automated scraping',async()=>{
 const f=fixture();const offer={item:'Handmade balancing sculpture',category:'art',interest_topic:'shapes and balance',merchant:'Etsy',product_url:'https://www.etsy.com/listing/123456789/handmade-sculpture',listed_price_cents:1900};
 assert.equal((await f.api('/owner/market/offers','POST',offer,false)).status,401);
 assert.equal((await f.api('/owner/market/offers','POST',{...offer,product_url:'https://www.etsy.com/search?q=prism'},true)).status,400);
 assert.equal((await f.api('/owner/market/offers','POST',{...offer,product_url:'https://not-etsy.example/listing/123'},true)).status,400);
 assert.equal((await f.api('/owner/market/offers','POST',offer,true,'https://bad-origin.test')).status,403);
 assert.equal((await f.api('/owner/market/offers','POST',offer,true)).status,200);
 const listings=(await f.api('/market/offers')).body.offers;
 assert.equal(listings.length,1);
 assert.equal(listings[0].merchant,'Etsy');
 assert.equal(listings[0].product_url,offer.product_url);
 assert.equal((await f.api('/wallet')).body.wallet.available_cents,0);
});
