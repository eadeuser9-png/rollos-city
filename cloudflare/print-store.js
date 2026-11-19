// V20 staged physical print catalog integration, Cloudflare Worker (no Node SDK).
// Secret values only through env, never browser/committed files.
// This deliberately creates DRAFT Stripe products and Printful synced products.
// It does NOT publish payment links, accept live checkout, or charge for fulfillment.
const reply=(req,env,body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':req.headers.get('Origin')===env.SITE_ORIGIN?env.SITE_ORIGIN:'null','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin'}});
function authorized(req,env){return Boolean(env.WORLD_ADMIN_TOKEN)&&req.headers.get('Authorization')===`Bearer ${env.WORLD_ADMIN_TOKEN}`;}
async function stripeCall(env,path,form,key){
 if(!String(env.STRIPE_SECRET_KEY||'').startsWith('sk_test_'))throw Error('Requires Stripe TEST secret. Live product sync intentionally disabled.');
 const response=await fetch('https://api.stripe.com/v1/'+path,{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':key},body:new URLSearchParams(form)});
 const data=await response.json();if(!response.ok)throw Error('Stripe error: '+(data.error?.message||response.status));return data;
}
async function printfulCall(env,path,body){
 if(!env.PRINTFUL_API_TOKEN)throw Error('Missing PRINTFUL_API_TOKEN');
 const headers={Authorization:`Bearer ${env.PRINTFUL_API_TOKEN}`,'Content-Type':'application/json'};
 if(env.PRINTFUL_STORE_ID)headers['X-PF-Store-Id']=String(env.PRINTFUL_STORE_ID);
 const res=await fetch('https://api.printful.com'+path,{method:'POST',headers,body:JSON.stringify(body)});
 const data=await res.json();if(!res.ok||data.code>=400)throw Error('Printful error: '+(data.error?.message||data.result||data.code||res.status));return data.result;
}
const pngInfo=b=>{if(b.length<24||b[0]!==137||b[1]!==80||b[2]!==78||b[3]!==71||b[4]!==13||b[5]!==10||b[6]!==26||b[7]!==10)return null;const v=new DataView(b.buffer,b.byteOffset,b.byteLength);return {width:v.getUint32(16),height:v.getUint32(20)}};
export async function printStore(req,env,url){
 const asset=url.pathname.match(/^\/print-assets\/([1-9]\d*)\.png$/);
 if(asset&&req.method==='GET'){
  if(!env.PRINTS)return new Response('Print storage not configured',{status:503});
  const obj=await env.PRINTS.get('art/'+asset[1]+'.png');
  return obj?new Response(obj.body,{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=3600','X-Content-Type-Options':'nosniff'}}):new Response('Not found',{status:404});
 }
 if(url.pathname!=='/owner/print-store'&&!/^\/owner\/print-store\/\d+\/(upload|sync)$/.test(url.pathname))return null;
 if(!authorized(req,env))return reply(req,env,{error:'Owner authorization required'},401);
 if(url.pathname==='/owner/print-store'&&req.method==='GET'){
  const r=await env.DB.prepare(`SELECT c.id,c.title,p.file_width,p.file_height,p.status,p.stripe_product_id,p.stripe_price_id,p.printful_product_id,p.error FROM rollo_creations c LEFT JOIN print_products p ON p.creation_id=c.id ORDER BY c.id DESC LIMIT 80`).all();
  return reply(req,env,{artworks:r.results||[],checkout_enabled:false,fulfillment_enabled:false});
 }
 if(req.method!=='POST')return reply(req,env,{error:'POST required'},405);
 if(req.headers.get('Origin')!==env.SITE_ORIGIN)return reply(req,env,{error:'Use Rollo owner website'},403);
 const m=url.pathname.match(/^\/owner\/print-store\/(\d+)\/(upload|sync)$/);if(!m)return reply(req,env,{error:'Not found'},404);
 const id=Number(m[1]),action=m[2];if(!Number.isSafeInteger(id)||id<1)return reply(req,env,{error:'Invalid art ID'},400);
 const art=await env.DB.prepare('SELECT id,title,topic FROM rollo_creations WHERE id=?').bind(id).first();if(!art)return reply(req,env,{error:'Artwork missing'},404);
 if(action==='upload'){
  if(!env.PRINTS)return reply(req,env,{error:'Add R2 bucket binding PRINTS to Worker before upload'},503);
  if(req.headers.get('Content-Type')?.split(';')[0]!=='image/png')return reply(req,env,{error:'Upload image/png only'},415);
  const bytes=new Uint8Array(await req.arrayBuffer());if(bytes.byteLength>12e6)return reply(req,env,{error:'PNG exceeds 12 MB'},413);
  const dims=pngInfo(bytes);if(!dims||dims.width<2400||dims.height<2400||dims.width>10000||dims.height>10000)return reply(req,env,{error:'Use a print-ready PNG at least 2400 pixels per side (max 10000)'},422);
  // Existing synchronized products cannot silently change artwork. Use a new listing/review flow.
  const row=await env.DB.prepare('SELECT stripe_product_id,printful_product_id FROM print_products WHERE creation_id=?').bind(id).first();
  if(row?.stripe_product_id||row?.printful_product_id)return reply(req,env,{error:'Already synced. Do not overwrite a sold print file.'},409);
  await env.PRINTS.put('art/'+id+'.png',bytes,{httpMetadata:{contentType:'image/png'}});
  await env.DB.prepare(`INSERT INTO print_products(creation_id,file_width,file_height,status,updated_at) VALUES (?,?,?,'uploaded',?) ON CONFLICT(creation_id) DO UPDATE SET file_width=excluded.file_width,file_height=excluded.file_height,status='uploaded',updated_at=excluded.updated_at,error=NULL`).bind(id,dims.width,dims.height,Date.now()).run();
  return reply(req,env,{ok:true,creation_id:id,dimensions:dims,status:'uploaded',checkout_enabled:false});
 }
 // Sync staged catalog after owner approved file, variant, tax category and a test key.
 if(env.PRINT_STORE_SYNC_ENABLED!=='true')return reply(req,env,{error:'Catalog syncing disabled. Set PRINT_STORE_SYNC_ENABLED=true after configuring test credentials.'},403);
 if(!env.PRINTS||!env.PRINTFUL_POSTER_VARIANT_ID||!env.PRINT_PRICE_CENTS||!env.PRINT_STRIPE_TAX_CODE)return reply(req,env,{error:'Requires PRINTS R2, PRINTFUL_POSTER_VARIANT_ID, PRINT_PRICE_CENTS, PRINT_STRIPE_TAX_CODE'},503);
 const price=Number(env.PRINT_PRICE_CENTS),variant=Number(env.PRINTFUL_POSTER_VARIANT_ID);
 if(!Number.isSafeInteger(price)||price<100||price>200000||!Number.isSafeInteger(variant)||variant<1||!/^txcd_\d+$/.test(env.PRINT_STRIPE_TAX_CODE))return reply(req,env,{error:'Invalid price, variant, or tax code configuration'},422);
 const image=await env.PRINTS.head('art/'+id+'.png');if(!image)return reply(req,env,{error:'Upload a print-ready PNG first'},409);
 let row=await env.DB.prepare('SELECT * FROM print_products WHERE creation_id=?').bind(id).first();if(!row||row.status==='new')return reply(req,env,{error:'No validated image upload found'},409);
 const previewBase=new URL(req.url).origin,imageUrl=previewBase+'/print-assets/'+id+'.png';
 try{
  if(!row.printful_product_id){
   const created=await printfulCall(env,'/store/products',{sync_product:{name:art.title.slice(0,120),external_id:'rollo-art-'+id,thumbnail:imageUrl},sync_variants:[{retail_price:(price/100).toFixed(2),variant_id:variant,files:[{url:imageUrl}]}]});
   if(!created?.id)throw Error('Printful returned no product ID');
   await env.DB.prepare('UPDATE print_products SET printful_product_id=?,status=?,error=NULL,updated_at=? WHERE creation_id=?').bind(String(created.id),'printful_synced',Date.now(),id).run();
   row.printful_product_id=String(created.id);
  }
  if(!row.stripe_product_id){
   const product=await stripeCall(env,'products',{name:art.title.slice(0,120),description:'Physical fine art print from Rollo’s City. Fulfillment not enabled yet.',active:'false',tax_code:env.PRINT_STRIPE_TAX_CODE,'metadata[rollo_creation_id]':String(id),'metadata[printful_sync_product_id]':row.printful_product_id},'rollo-v20-product-'+id);
   await env.DB.prepare('UPDATE print_products SET stripe_product_id=?,status=?,updated_at=? WHERE creation_id=?').bind(product.id,'stripe_product_created',Date.now(),id).run();row.stripe_product_id=product.id;
  }
  if(!row.stripe_price_id){
   const pr=await stripeCall(env,'prices',{product:row.stripe_product_id,currency:'usd',unit_amount:String(price)},'rollo-v20-price-'+id+'-'+price);
   await env.DB.prepare('UPDATE print_products SET stripe_price_id=?,status=?,error=NULL,updated_at=? WHERE creation_id=?').bind(pr.id,'draft_ready',Date.now(),id).run();row.stripe_price_id=pr.id;
  }
  return reply(req,env,{ok:true,creation_id:id,printful_product_id:row.printful_product_id,stripe_product_id:row.stripe_product_id,stripe_price_id:row.stripe_price_id,status:'draft_ready',checkout_enabled:false,fulfillment_enabled:false});
 }catch(e){const msg=String(e.message||e).slice(0,250);await env.DB.prepare('UPDATE print_products SET error=?,updated_at=? WHERE creation_id=?').bind(msg,Date.now(),id).run();return reply(req,env,{error:msg,partial_sync_possible:true,checkout_enabled:false},502);}
}
