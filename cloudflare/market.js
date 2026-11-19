/** Owner-curated links to real retailers. Rollo may put ideas on a wishlist;
 * he cannot buy, charge, or contact shops. No fake prices or inventory claims.
 */
const json=(req,env,data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':req.headers.get('Origin')===env.SITE_ORIGIN?env.SITE_ORIGIN:'null','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin'}});
const owner=(req,env)=>!!(env.WORLD_ADMIN_TOKEN||env.OWNER_TOKEN)&&req.headers.get('Authorization')===`Bearer ${env.WORLD_ADMIN_TOKEN||env.OWNER_TOKEN}`;
const safe=(v,n)=>String(v||'').trim().slice(0,n);
const storeUrl=v=>{try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||['localhost','127.0.0.1'].includes(u.hostname)||!u.hostname.includes('.'))return null;return u.toString()}catch{return null}};
export async function marketApi(req,env,url){
 const path=url.pathname;
 if(path==='/market/offers'&&req.method==='GET'){
  const rows=await env.DB.prepare('SELECT id,item,category,interest_topic,merchant,product_url,listed_price_cents,checked_at FROM market_offers WHERE active=1 ORDER BY checked_at DESC LIMIT 40').all();
  return json(req,env,{offers:rows.results||[],notice:'Owner-reviewed retailer links, NOT guaranteed price or stock. No shopping occurs on this site.'});
 }
 if(path==='/owner/market/offers'){
  if(!owner(req,env))return json(req,env,{error:'Owner authorization required'},401);
  if(req.method==='GET'){
   const rows=await env.DB.prepare('SELECT * FROM market_offers ORDER BY id DESC LIMIT 80').all();return json(req,env,{offers:rows.results||[]});
  }
  if(req.method!=='POST')return json(req,env,{error:'POST required'},405);
  if(req.headers.get('Origin')!==env.SITE_ORIGIN)return json(req,env,{error:'Use your configured Rollo website'},403);
  let body;try{body=await req.json()}catch{return json(req,env,{error:'Invalid JSON'},400)}
  if(body?.action==='hide'){
   if(!Number.isSafeInteger(body.id)||body.id<1)return json(req,env,{error:'Invalid ID'},400);
   const result=await env.DB.prepare('UPDATE market_offers SET active=0 WHERE id=?').bind(body.id).run();
   return json(req,env,{ok:result.meta?.changes===1,charged:false});
  }
  const item=safe(body?.item,100),category=safe(body?.category,30),topic=safe(body?.interest_topic,80),merchant=safe(body?.merchant,80),product_url=storeUrl(body?.product_url),cents=body?.listed_price_cents;
  // Etsy links must be real item listings, not Etsy search results or cart URLs.
  const urlHost=product_url?new URL(product_url).hostname.toLowerCase().replace(/^www\./,''):'';
  if((merchant.toLowerCase()==='etsy'||urlHost==='etsy.com') && (!product_url || !/^https:\/\/(?:www\.)?etsy\.com\/listing\/\d+(?:[/?#]|$)/i.test(product_url)))return json(req,env,{error:'For Etsy, paste a specific etsy.com/listing/… product URL.'},400);
  if(item.length<3||merchant.length<2||topic.length<3||!['books','art','science','garden','tools','hobbies'].includes(category)||!product_url||cents!==null&&(!Number.isSafeInteger(cents)||cents<1||cents>10000000))return json(req,env,{error:'Provide item, merchant, safe category, interest topic, and direct HTTPS retailer URL. Optional price must be cents.'},400);
  const now=Date.now();const result=await env.DB.prepare('INSERT INTO market_offers (item,category,interest_topic,merchant,product_url,listed_price_cents,checked_at,active,created_at) VALUES (?,?,?,?,?,?,?,1,?)').bind(item,category,topic,merchant,product_url,cents,now,now).run();
  return json(req,env,{ok:true,id:Number(result.meta?.last_row_id),charged:false});
 }
 return null;
}
export async function considerMarketOffer(env,s){
 const top=Object.entries(s.mind?.interests||{}).map(([topic,data])=>({topic,score:Number(data.score||0)})).sort((a,b)=>b.score-a.score)[0];
 if(!top||top.score<3)return null;
 const rows=await env.DB.prepare('SELECT item,category,interest_topic,merchant,product_url FROM market_offers WHERE active=1 ORDER BY checked_at DESC LIMIT 40').all();
 const offers=rows.results||[],key=top.topic.toLowerCase();
 const selected=offers.find(o=>o.interest_topic.toLowerCase().includes(key)||key.includes(o.interest_topic.toLowerCase())||o.category==='science'&&/balance|shape|light|physics|engineering/.test(key)||o.category==='garden'&&/plant|garden|food/.test(key));
 if(!selected)return null;
 const exists=await env.DB.prepare('SELECT id FROM rollo_wishlist WHERE item=? AND state!=? LIMIT 1').bind(selected.item,'dismissed').first();if(exists)return null;
 const reason=`I was interested in ${top.topic}, so I want to learn more about ${selected.item}.`.slice(0,160);
 const now=Date.now();
 await env.DB.prepare("INSERT INTO rollo_wishlist (item,category,reason,topic,origin,store_url,decided_day,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(selected.item,selected.category,reason,top.topic,'market',selected.product_url,s.day,now,now).run();
 return {item:selected.item,merchant:selected.merchant};
}
