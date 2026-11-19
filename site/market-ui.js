(()=>{'use strict';
const $=id=>document.getElementById(id);
const base=(window.ROLLO_BACKEND_URL||'').trim().replace(/\/$/,'');
const money=cents=>'$'+(Number(cents)/100).toFixed(2);
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);return node};
const safeLink=(raw)=>{try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname.includes('.')&&!u.username&&!u.password?u.href:null}catch{return null}};
let admin=[];
async function load(){
 if(!base){$('market-status').textContent='Market needs its cloud connection. No purchases are available.';return}
 try{
  const response=await fetch(base+'/market/offers',{cache:'no-store'});if(!response.ok)throw Error('Market API '+response.status);
  const data=await response.json();$('offers').replaceChildren();const offers=data.offers||[];
  $('market-status').textContent=offers.length?`${offers.length} owner-reviewed product link${offers.length===1?'':'s'}`:'The market is ready. Its owner has not added any product links yet.';
  if(!offers.length)$('offers').append(el('p','No current offers. Rollo can still explore and choose wishlist ideas.'));
  for(const item of offers){
   const card=el('article');card.className='offer';card.append(el('small',item.category+' · Related to '+item.interest_topic),el('h3',item.item),el('p','Retailer: '+item.merchant));
   if(item.listed_price_cents!==null)card.append(el('p','Owner-reviewed item price: '+money(item.listed_price_cents)+' (tax/shipping not included; recheck before buying)'));
   const checked=el('p','Reviewed: '+new Date(item.checked_at).toLocaleDateString());checked.className='meta';card.append(checked);
   const link=safeLink(item.product_url);if(link){const a=el('a',item.merchant.toLowerCase()==='etsy'?'View item on Etsy':'View at retailer');a.href=link;a.rel='noopener noreferrer';a.target='_blank';card.append(a)}$('offers').append(card);
  }
 }catch(err){$('market-status').textContent='Unable to load offers: '+err.message}
}

async function loadEtsyDiscovery(){
 const area=$('etsy-interest-links');if(!area)return;
 const defaults=['handmade kinetic sculpture','stained glass sun catcher','botanical gardening tools'];
 let topics=[];
 try{
  if(base){const response=await fetch(base+'/state',{cache:'no-store'});if(response.ok){const s=await response.json();
   topics=Object.entries(s.mind?.interests||{}).filter(([,x])=>Number(x?.score)>0)
    .sort((a,b)=>Number(b[1].score)-Number(a[1].score)).slice(0,3).map(([topic])=>topic);
  }}
 }catch(_){/* Static discovery links remain available if Rollo is offline. */}
 const searches=topics.length?topics.map(t=>({label:t,query:t+' handmade'})):defaults.map(t=>({label:t,query:t}));
 area.replaceChildren();
 for(const item of searches){
  const card=el('article');card.className='offer';card.append(el('h3',item.label));
  const description=el("p", "Open an Etsy search in a new tab. Choose a specific listing to review, then add it to Rollo's market below.");card.append(description);
  const u=new URL('https://www.etsy.com/search');u.searchParams.set('q',item.query);
  const a=el('a','Search Etsy for this idea');a.href=u.toString();a.target='_blank';a.rel='noopener noreferrer';card.append(a);area.append(card);
 }
}

async function ownerFetch(path,body){const token=$('market-token').value.trim();if(!token)throw Error('Enter your private owner token.');const headers={Authorization:'Bearer '+token};if(body!==undefined)headers['Content-Type']='application/json';const resp=await fetch(base+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});const json=await resp.json();if(!resp.ok)throw Error(json.error||'Owner request failed');return json}
async function refreshOwner(){const data=await ownerFetch('/owner/market/offers');admin=data.offers||[];const list=$('owner-offers');list.replaceChildren();for(const x of admin.filter(x=>x.active)){const line=el('div',x.item+' · '+x.merchant+' · '+x.interest_topic+' ');const hide=el('button','Hide offer');hide.type='button';hide.className='hide-btn';hide.addEventListener('click',async()=>{try{await ownerFetch('/owner/market/offers',{action:'hide',id:x.id});$('market-owner-status').textContent='Offer hidden.';await refreshOwner();await load()}catch(e){$('market-owner-status').textContent=e.message}});line.append(hide);list.append(line)}}
$('market-form').addEventListener('submit',async e=>{e.preventDefault();try{
 const price=$('item-price').value.trim();const cents=price===''?null:Math.round(Number(price)*100);if(price!==''&&(Number(price)<=0||!Number.isSafeInteger(cents)))throw Error('Invalid price.');
 const body={item:$('item').value,category:$('category').value,interest_topic:$('interest').value,merchant:$('merchant').value,product_url:$('product-url').value,listed_price_cents:cents};
 await ownerFetch('/owner/market/offers',body);$('market-owner-status').textContent='Offer published. Rollo can consider it when it relates to his interests.';$('market-form').reset();await load();await refreshOwner();
 }catch(err){$('market-owner-status').textContent=err.message}});
$('market-token').addEventListener('change',()=>refreshOwner().catch(e=>{$('market-owner-status').textContent=e.message}));
load();
loadEtsyDiscovery();
})();
