import {allRolloCreations, imagePreview} from './art-gallery.js';
const base=String(window.ROLLO_BACKEND_URL||'').trim().replace(/\/$/,'');
const host=document.getElementById('shop');
const text=(tag,value)=>{const x=document.createElement(tag);x.textContent=String(value??'');return x};
async function load(){
 if(!base){host.textContent='The art shop requires Rollo’s connected cloud world.';return;}
 try{
  // The gallery is public. Selling remains a separate, owner-managed opt-in.
  const [creations, listingResult] = await Promise.all([
    allRolloCreations(base),
    fetch(base+'/shop',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error(`Shop HTTP ${r.status}`);return r.json()}).catch(e=>{console.warn('Checkout listing status unavailable',e);return null})
  ]);
  const listed = new Map();
  for(const offer of listingResult?.listings||[]){
    if(Number.isSafeInteger(offer?.creation_id) && offer.creation_id>0) listed.set(offer.creation_id,offer);
  }
  host.replaceChildren();
  for(const art of creations){
   const card=document.createElement('article');card.className='shop-card';
   const thumb=imagePreview({src:`${base}/creations/${art.id}.svg`,title:art.title,subtitle:`${art.stamp||''} · ${art.topic||''}`});
   const title=text('h3',art.title),meta=text('small',`${art.stamp||''} · ${art.topic||''}`);
   card.append(thumb,title,meta);
   const offer=listed.get(art.id);
   if(offer && typeof offer.checkout_url==='string' && /^https:\/\/(?:buy\.stripe\.com|payhip\.com|gumroad\.com|[a-z0-9-]+\.gumroad\.com)\//i.test(offer.checkout_url)){
     const description=text('p',offer.description||'Owner-managed seller checkout');
     const price=Number(offer.price_cents);
     const priceText=Number.isFinite(price)?`Listed price: $${(price/100).toFixed(2)} USD`:'Price confirmed at seller checkout';
     const link=document.createElement('a');link.className='buy';link.href=offer.checkout_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View seller checkout';
     card.append(description,text('p',priceText),link);
   }else{
     const status=text('p',listingResult?'On display · Not for sale':'On display · Checkout temporarily unavailable');
     status.className='shop-art-status';card.append(status);
   }
   host.append(card);
  }
  if(!host.children.length)host.textContent='Rollo has not made any drawings yet. His future sketches will appear here automatically.';
 }catch(e){host.textContent='The artwork gallery is not available right now. Please visit again later.';console.warn(e)}
}
load();
