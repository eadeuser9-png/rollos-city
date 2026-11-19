(()=>{'use strict';
const base=String(window.ROLLO_BACKEND_URL||'').trim().replace(/\/$/,'');
const $=x=>document.getElementById(x),usd=x=>'$'+(Number(x||0)/100).toFixed(2);
async function refresh(){
 if(!base){$('wallet-message').textContent='Cloud backend not configured.';return}
 try{
  const [a,b]=await Promise.all([fetch(base+'/wallet',{cache:'no-store'}),fetch(base+'/wishlist',{cache:'no-store'})]);
  if(!a.ok||!b.ok)throw Error('The wallet server is unavailable.');
  const w=(await a.json()).wallet,items=(await b.json()).wishes;
  $('available').textContent=usd(w.available_cents);$('gross').textContent=usd(w.verified_gross_cents);$('cleared').textContent=usd(w.owner_reconciled_net_payouts_cents);
  $('wallet-message').textContent=w.verified_sales?`${w.verified_sales} verified artwork sale${w.verified_sales===1?'':'s'}. Available means cleared and uncommitted funds only.`:'No verified real artwork sales yet. The balance starts at $0.00.';
  const host=$('wishes');host.replaceChildren();
  for(const x of items||[]){const box=document.createElement('article');box.className='wish';const tag=document.createElement('div');tag.className='topic';tag.textContent=x.topic;const title=document.createElement('strong');title.textContent=x.item;const why=document.createElement('p');why.textContent=x.reason;const price=document.createElement('div');price.className='wallet-note';price.textContent=x.estimated_total_cents?`Owner-estimated all-in cost: ${usd(x.estimated_total_cents)}`:'No verified all-in price yet';const status=document.createElement('div');status.className='wallet-note';status.textContent=x.status==='reserved'?'Funds reserved; owner has not placed an order':x.status==='spent'?'Owner recorded a manually completed purchase':'Just a wish for now';box.append(tag,title,why,price,status);host.append(box)}
  if(!items?.length)host.textContent='Rollo has not chosen anything yet. His wishlist will grow as his interests develop.';
 }catch(e){$('wallet-message').textContent='Could not load wallet: '+e.message}
}
refresh();setInterval(refresh,60000);
})();
