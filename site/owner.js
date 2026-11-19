import {imagePreview} from './art-gallery.js';
const base=(window.ROLLO_BACKEND_URL||'').trim().replace(/\/$/,'');
const $=id=>document.getElementById(id);
let token='';let photoUrls=[];
const message=(s)=>$('ownerstatus').textContent=s;
const headers=()=>({'Authorization':`Bearer ${token}`});
async function api(path,method='GET',data){
 if(!token)throw Error('Unlock owner studio first.');
 const opts={method,headers:{...headers()}};
 if(data){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(data)}
 const r=await fetch(base+path,opts),json=await r.json();if(!r.ok)throw Error(json.error||`HTTP ${r.status}`);return json;
}
function makeText(tag,value){let a=document.createElement(tag);a.textContent=String(value);return a}
function button(title,fn){let b=makeText('button',title);b.onclick=fn;return b}
function money(c){return '$'+(Number(c||0)/100).toFixed(2)}
function renderWallet(finances,wishes){
 const w=finances.wallet,totals=$('owner-wallet-totals');totals.replaceChildren();
 for(const line of [`Verified art sales (gross): ${money(w.verified_gross_cents)}`,
  `Cleared net payouts recorded: ${money(w.owner_reconciled_net_payouts_cents)}`,
  `Reserved / previously spent: ${money(w.committed_cents)}`,
  `Available to reserve: ${money(w.available_cents)}`])totals.append(makeText('p',line));
 $('stripe-wallet-status').textContent=finances.stripe_webhook_configured?'Stripe webhook secret configured. Check Stripe delivery logs to confirm that it is delivering signed events.':'Stripe webhook is NOT configured yet. Wallet will remain at $0 until signed real sales arrive and you reconcile payouts.';
 const host=$('owner-wishlist');host.replaceChildren();
 for(const wish of wishes.wishes||[]){
  const card=document.createElement('article');card.className='review';
  card.append(makeText('strong',wish.item),makeText('p',wish.reason),makeText('p',`Interest: ${wish.topic} · Proposed by ${wish.origin==='ai'?'AI':wish.origin==='rules'?"Rollo’s simulation":'owner'} · ${wish.status||wish.state}`));
  const amount=document.createElement('input');amount.type='number';amount.step='.01';amount.min='.01';amount.placeholder='All-in cost incl. tax + shipping';amount.value=wish.estimated_total_cents?(wish.estimated_total_cents/100).toFixed(2):'';amount.setAttribute('aria-label','All-in USD amount');
  const link=document.createElement('input');link.type='url';link.placeholder='https://...';link.value=wish.store_url||'';link.style.width='min(100%,430px)';link.setAttribute('aria-label','Store product URL');
  card.append(makeText('p','Owner-researched total cost, including all taxes and shipping:'),amount,makeText('p','Optional product URL:'),link);
  const save=button('Save price and link',async()=>{try{const v=Number(amount.value),c=Math.round(v*100);if(!amount.value||!Number.isFinite(v)||Math.abs(v*100-c)>1e-5||c<1)throw Error('Enter an exact all-in dollar amount.');await api(`/owner/wishlist/${wish.id}/update`,'POST',{total_cents:c,store_url:link.value.trim()});await reload()}catch(e){message(e.message)}});
  const reserve=button('Reserve from cleared funds (no charge)',async()=>{try{if(!confirm(`Reserve earnings for ${wish.item}? This does NOT place an order.`))return;await api(`/owner/wishlist/${wish.id}/reserve`,'POST',{});await reload()}catch(e){message(e.message)}});
  const release=button('Release reservation',async()=>{try{await api(`/owner/wishlist/${wish.id}/release`,'POST',{});await reload()}catch(e){message(e.message)}});
  const spent=button('Mark manually purchased',async()=>{try{if(!confirm('Confirm you personally completed payment outside Rollo, and recorded the exact all-in cost?'))return;await api(`/owner/wishlist/${wish.id}/spent`,'POST',{});await reload()}catch(e){message(e.message)}});
  const dismiss=button('Dismiss idea',async()=>{try{await api(`/owner/wishlist/${wish.id}/dismiss`,'POST',{});await reload()}catch(e){message(e.message)}});
  if(!wish.status||wish.status==='released'){card.append(save,reserve,dismiss)}
  if(wish.status==='reserved')card.append(release,spent);
  host.append(card);
 }
 if(!(wishes.wishes||[]).length)host.textContent='No wishes yet. As Rollo learns and develops stronger interests, ideas will appear automatically.';
}
function renderPrintCatalog(prints){
 const container=$('print-catalog');container.replaceChildren();
 if(prints.setup_error){container.append(makeText('p', 'Print catalog not configured: '+prints.setup_error));return;}
 for(const art of prints.artworks||[]){
  const card=document.createElement('article');card.className='review';
  card.append(makeText('strong',art.title),makeText('p',`Status: ${art.status||'Needs a print-ready PNG'}${art.error?' · '+art.error:''}`));
  if(art.file_width)card.append(makeText('p',`Print file: ${art.file_width} × ${art.file_height} pixels`));
  const input=document.createElement('input');input.type='file';input.accept='image/png';input.setAttribute('aria-label','Upload print-ready PNG for '+art.title);
  const upload=button('Upload approved PNG',async()=>{
    if(!input.files?.[0])return message('Select a PNG first.');
    if(!confirm('Have you checked this PNG against the selected Printful print-size template and ordered a sample?'))return;
    try{const r=await fetch(base+`/owner/print-store/${art.id}/upload`,{method:'POST',headers:{...headers(),'Content-Type':'image/png'},body:input.files[0]});const b=await r.json();if(!r.ok)throw Error(b.error||`HTTP ${r.status}`);await reload()}catch(e){message(e.message)}
  });
  const sync=button('Create Stripe + Printful drafts',async()=>{
    if(!confirm('Create draft catalog entries in your connected TEST Stripe account and Printful store? This is not a live checkout.'))return;
    try{const b=await api(`/owner/print-store/${art.id}/sync`,'POST',{});message('Drafts created: Stripe '+b.stripe_product_id+' and Printful '+b.printful_product_id);await reload()}catch(e){message(e.message)}
  });
  sync.disabled=!art.file_width||Boolean(art.stripe_price_id);
  const original=document.createElement('a');original.href=base+`/creations/${art.id}.svg`;original.textContent='Open original vector artwork';original.target='_blank';original.rel='noopener noreferrer';
  card.append(original,makeText('p','Select a full-resolution PNG (not the gallery screenshot):'),input,upload,sync);
  if(art.stripe_product_id)card.append(makeText('p','Stripe draft: '+art.stripe_product_id));
  if(art.printful_product_id)card.append(makeText('p','Printful synced product: '+art.printful_product_id));
  container.append(card);
 }
 if(!prints.artworks?.length)container.textContent='No drawings are available yet.';
}
async function reload(){
 if(!base)throw Error('Cloud backend URL missing from config.js');
 void reloadBookSuggestions();
 const [places,pending,art,finances,wishes,prints]=await Promise.all([api('/places'),api('/owner/pending'),api('/owner/shop'),api('/owner/wallet'),api('/owner/wishlist'),api('/owner/print-store').catch(e=>({artworks:[],setup_error:e.message}))]);
 renderWallet(finances,wishes);
 renderPrintCatalog(prints);
 $('art-list').replaceChildren();
 for(const a of art.artworks){
  const card=document.createElement('article');card.className='review';
  card.append(makeText('strong',a.title),makeText('p',`${a.topic} · ${a.status==='active'?'For sale':'Not listed'}`));
  const pic=imagePreview({src:base+`/creations/${a.id}.svg`,title:a.title,subtitle:`${a.stamp||''} · ${a.topic||''}`});pic.style.maxWidth='210px';pic.style.height='175px';card.append(pic);
  const price=document.createElement('input');price.type='number';price.min='1';price.max='2000';price.step='.01';price.value=a.price_cents?(a.price_cents/100).toFixed(2):'5.00';price.setAttribute('aria-label','Price in USD');
  const checkout=document.createElement('input');checkout.type='url';checkout.placeholder='https://buy.stripe.com/...';checkout.value=a.checkout_url||'';checkout.style.width='min(100%,430px)';checkout.setAttribute('aria-label','External checkout URL');
  const desc=document.createElement('input');desc.type='text';desc.maxLength=200;desc.placeholder='What does the customer receive?';desc.value=a.description||'';desc.style.width='min(100%,430px)';desc.setAttribute('aria-label','Purchase description');
  card.append(makeText('p','USD price (display only):'),price,makeText('p','Seller checkout link:'),checkout,makeText('p','Description / fulfillment:'),desc);
  const link=document.createElement('input');link.type='text';link.placeholder='plink_...';link.value=a.payment_link_id||'';link.maxLength=80;link.setAttribute('aria-label','Stripe Payment Link ID');
 card.append(makeText('p','Stripe Payment Link ID (needed to attribute real sales to Rollo):'),link);
 card.append(button('Save Stripe link ID',async()=>{try{await api('/owner/stripe-link','POST',{creation_id:a.id,payment_link_id:link.value.trim()});await reload()}catch(e){message(e.message)}}));
 card.append(button('List for sale',async()=>{try{const cents=Math.round(Number(price.value)*100);if(!confirm('Have you configured the correct product price, file delivery/refunds, and tax settings on the seller platform?'))return;await api('/owner/shop/'+a.id,'POST',{status:'active',price_cents:cents,checkout_url:checkout.value.trim(),description:desc.value.trim()});await reload()}catch(e){message(e.message)}}));
  if(a.status==='active')card.append(button('Unlist',async()=>{try{await api('/owner/shop/'+a.id,'POST',{status:'draft'});await reload()}catch(e){message(e.message)}}));
  $('art-list').append(card);
 }
 if(!art.artworks.length)$('art-list').textContent='Rollo has not made drawings yet. New creations appear here automatically.';
 $('placelist').replaceChildren();
 for(const p of places.places){const row=makeText('p',`${p.name} (${p.kind}; ${p.x},${p.z}) `);row.append(button('Remove',async()=>{if(!confirm(`Remove ${p.name} from the shared city?`))return;try{await api('/owner/places/'+p.id,'POST');await reload()}catch(e){message(e.message)}}));$('placelist').append(row)}
 $('pending-posts').replaceChildren();for(const p of pending.posts){let row=document.createElement('article');row.className='review';row.append(makeText('strong',p.name),makeText('p',p.body));for(const choice of ['approve','reject'])row.append(button(choice,()=>moderate('posts',p.id,choice)));$('pending-posts').append(row)}
 if(!pending.posts.length)$('pending-posts').textContent='No waiting forum posts.';
 for(let u of photoUrls)URL.revokeObjectURL(u);photoUrls=[];$('pending-photos').replaceChildren();
 for(const p of pending.photos){const row=document.createElement('article');row.className='review';row.append(makeText('strong',p.name),makeText('p',p.caption));
  try{const r=await fetch(base+`/owner/photos/${p.id}.webp`,{headers:headers()});if(r.ok){const u=URL.createObjectURL(await r.blob());photoUrls.push(u);const img=document.createElement('img');img.src=u;img.alt=p.caption;row.append(img)}}catch{}
  for(const choice of ['approve','reject'])row.append(button(choice,()=>moderate('photos',p.id,choice)));$('pending-photos').append(row)
 }
 if(!pending.photos.length)$('pending-photos').textContent='No waiting photos.';
 message('Owner access active. Public visitors cannot edit the city.');
}
async function moderate(group,id,choice){try{await api(`/owner/${group}/${id}/${choice}`,'POST');await reload()}catch(e){message(e.message)}}
$('unlock').onclick=async()=>{token=$('token').value.trim();$('token').value='';if(!token)return message('Enter your owner token first.');try{await reload()}catch(e){token='';message('Could not unlock: '+e.message)}};
$('lock').onclick=()=>{token='';for(let u of photoUrls)URL.revokeObjectURL(u);photoUrls=[];$('placelist').replaceChildren();$('art-list').replaceChildren();$('print-catalog').replaceChildren();$('owner-wallet-totals').replaceChildren();$('owner-wishlist').replaceChildren();$('pending-posts').replaceChildren();$('pending-photos').replaceChildren();$('owner-book-suggestions').replaceChildren();$('owner-book-suggestions').textContent='Unlock Owner Studio to review book suggestions.';$('suggestions-status').textContent='';message('Locked')};
$('refresh').onclick=()=>reload().catch(e=>message(e.message));
$('cleared-form').onsubmit=async e=>{e.preventDefault();try{const v=Number($('payout-net').value),c=Math.round(v*100);if(!Number.isFinite(v)||Math.abs(v*100-c)>1e-5||c<1)throw Error('Enter the exact net amount, dollars and cents.');if(!confirm('Have these NET payout funds actually reached your bank account?'))return;await api('/owner/wallet/clear','POST',{reference:$('payout-id').value.trim(),amount_cents:c,note:$('payout-note').value.trim()});$('payout-id').value='';$('payout-net').value='';$('payout-note').value='';await reload()}catch(e){message(e.message)}};
$('placeform').onsubmit=async e=>{e.preventDefault();try{await api('/owner/places','POST',{name:$('place-name').value,kind:$('place-kind').value,x:Number($('place-x').value),z:Number($('place-z').value)});$('place-name').value='';await reload()}catch(e){message(e.message)}};


function renderBookSuggestions(data){
 const target=$('owner-book-suggestions');target.replaceChildren();
 for(const item of data.suggestions||[]){
  const card=document.createElement('article');card.className='review';
  card.append(makeText('strong',item.title),makeText('p',`Author: ${item.author||'Not provided'} · Status: ${item.status}`),makeText('p',`Why suggested: ${item.reason}`));
  if(item.source_url)card.append(makeText('p','Suggested source (unverified): '+item.source_url));
  if(item.status==='pending'){
   card.append(button('Approve title',async()=>{
    if(!confirm(`Approve suggestion for "${item.title}"? This does not supply the book text or force Rollo to read it.`))return;
    try{await api(`/admin/library/suggestions/${item.id}/approve`,'POST',{});await reloadBookSuggestions();}catch(e){$('suggestions-status').textContent=e.message;}
   }));
   card.append(button('Reject',async()=>{
    try{await api(`/admin/library/suggestions/${item.id}/reject`,'POST',{});await reloadBookSuggestions();}catch(e){$('suggestions-status').textContent=e.message;}
   }));
  }
  target.append(card);
 }
 if(!data.suggestions?.length)target.textContent='No book suggestions received yet.';
}
async function reloadBookSuggestions(){
 try{const data=await api('/admin/library/suggestions');if(!token)return;renderBookSuggestions(data);$('suggestions-status').textContent='Suggestions loaded. Only you can approve or reject them.';}
 catch(e){$('suggestions-status').textContent='Could not load book suggestions: '+e.message;}
}
$('refresh-book-suggestions').onclick=reloadBookSuggestions;
