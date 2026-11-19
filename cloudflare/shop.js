// Owner-curated art shop. Real checkout happens exclusively on an owner-created,
// seller-hosted payment page. This Worker handles neither payments nor secrets.
const allowCheckoutUrl = value => {
  try {
    const url = new URL(String(value||''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.searchParams.has('redirect_uri')) return false;
    return url.hostname === 'buy.stripe.com' || url.hostname === 'payhip.com' || url.hostname === 'gumroad.com' || url.hostname.endsWith('.gumroad.com');
  } catch { return false; }
};
export {allowCheckoutUrl};
const cors = (request,env)=>{
 const origin=request.headers.get('Origin')||'';
 return {'Access-Control-Allow-Origin':origin===env.SITE_ORIGIN?origin:'null','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
};
const result=(req,env,body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req,env),'Content-Type':'application/json; charset=utf-8'}});
const owner=(req,env)=>Boolean(env.WORLD_ADMIN_TOKEN)&&req.headers.get('Authorization')===`Bearer ${env.WORLD_ADMIN_TOKEN}`;
export async function artShop(request,env,url){
 const path=url.pathname;
 const shopRoute = path==='/shop' || path==='/owner/shop' || /^\/owner\/shop\/\d+$/.test(path);
 if(!shopRoute)return null;
 if(path==='/shop'&&request.method==='GET'){
  const rows=await env.DB.prepare(`SELECT a.creation_id,a.price_cents,a.checkout_url,a.description,c.title,c.topic,c.stamp
   FROM art_listings a JOIN rollo_creations c ON c.id=a.creation_id
   WHERE a.status='active' ORDER BY a.updated_at DESC LIMIT 40`).all();
  return result(request,env,{listings:rows.results||[],notice:'Checkout is handled by the independent seller. Prices and fulfillment terms must be checked at checkout.'});
 }
 if(!owner(request,env))return result(request,env,{error:'Owner authorization required.'},401);
 if(path==='/owner/shop'&&request.method==='GET'){
  const rows=await env.DB.prepare(`SELECT c.id,c.title,c.topic,c.stamp,a.price_cents,a.checkout_url,a.description,a.status,l.payment_link_id
   FROM rollo_creations c LEFT JOIN art_listings a ON a.creation_id=c.id LEFT JOIN stripe_listing_links l ON l.creation_id=c.id ORDER BY c.id DESC LIMIT 100`).all();
  return result(request,env,{artworks:rows.results||[],notice:'Create seller-hosted product first. Price shown here is informational; seller checkout is authoritative.'});
 }
 if(request.method!=='POST'||!/^\/owner\/shop\/\d+$/.test(path))return result(request,env,{error:'Not found.'},404);
 if(request.headers.get('Origin')!==env.SITE_ORIGIN)return result(request,env,{error:'Make changes from your Netlify owner dashboard.'},403);
 const id=Number(path.split('/')[3]);if(!Number.isSafeInteger(id)||id<1)return result(request,env,{error:'Invalid artwork ID.'},400);
 let b;try{b=await request.json()}catch{return result(request,env,{error:'Invalid JSON.'},400)}
 if(b?.status==='draft'){
  await env.DB.prepare("UPDATE art_listings SET status='draft',updated_at=? WHERE creation_id=?").bind(Date.now(),id).run();
  return result(request,env,{ok:true,status:'draft',charged:false});
 }
 if(b?.status!=='active')return result(request,env,{error:'Status must be active or draft.'},400);
 const price=Number(b.price_cents),checkout=String(b.checkout_url||'').trim(),description=String(b.description||'').trim();
 if(!Number.isInteger(price)||price<100||price>200000)return result(request,env,{error:'Price must be $1 to $2,000 USD.'},400);
 if(!allowCheckoutUrl(checkout))return result(request,env,{error:'Use a valid HTTPS seller link from buy.stripe.com, payhip.com, or gumroad.com.'},400);
 if(description.length>200)return result(request,env,{error:'Description must be under 200 characters.'},400);
 const artwork=await env.DB.prepare('SELECT id FROM rollo_creations WHERE id=?').bind(id).first();
 if(!artwork)return result(request,env,{error:'Art does not exist.'},404);
 const now=Date.now();
 await env.DB.prepare(`INSERT INTO art_listings (creation_id,price_cents,checkout_url,description,status,created_at,updated_at)
 VALUES (?,?,?,?, 'active',?,?) ON CONFLICT(creation_id) DO UPDATE SET
 price_cents=excluded.price_cents,checkout_url=excluded.checkout_url,description=excluded.description,status='active',updated_at=excluded.updated_at`)
 .bind(id,price,checkout,description,now,now).run();
 return result(request,env,{ok:true,status:'active',charged:false,notice:'A link is published, but payments and delivery require your independently configured seller account.'});
}
