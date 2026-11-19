(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const base=String(window.ROLLO_BACKEND_URL||'').trim().replace(/\/$/,'');
 const err=(e)=>{$('status').textContent=String(e.message||e)};
 async function api(path, method='GET', payload){
  if(!base)throw Error('No server URL configured. Deploy your Cloudflare Worker and edit config.js first.');
  const token=$('token').value.trim();if(!token)throw Error('Enter your private owner token.');
  const res=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
  const body=await res.json();if(!res.ok)throw Error(body.error||`Request failed (${res.status})`);return body;
 }
 const el=(tag,text)=>{let e=document.createElement(tag);e.textContent=text;return e};
 async function refresh(){
  try{let data=await api('/admin/purchases');$('status').textContent='Connected. Owner verification succeeded.';
   const p=data.policy;const box=$('settings');box.replaceChildren();
   for(const line of [
    `Real purchase approvals: ${p.enabled?'ENABLED (still no payment processor)':'DISABLED'}`,
    `Per-transaction cap: $${(p.maxTransactionCents/100).toFixed(2)}`,
    `Monthly cap: $${(p.monthlyCapCents/100).toFixed(2)}`,
    `Permitted merchants: ${p.allowedMerchants.join(', ')||'None'}`,
    `Your approval required: ALWAYS`,
    `Payment processor connected: NO`
   ])box.append(el('p',line));
   const list=$('requests');list.replaceChildren();
   if(!data.requests.length){list.textContent='No purchase requests yet.';return}
   for(const req of data.requests){const item=el('article','');item.className='item';
    item.append(el('strong',`${req.item} · $${(req.amount_cents/100).toFixed(2)}`),el('div',`Merchant: ${req.vendor}`),el('small',`Status: ${req.status} · Request #${req.id}`));
    if(req.status==='pending'){
     const approve=el('button','Approve proposal (no charge)');approve.type='button';
     approve.onclick=async()=>{if(!confirm(`Approve a PROPOSAL for $${(req.amount_cents/100).toFixed(2)} at ${req.vendor}? No payment will be made.`))return;try{await api(`/admin/purchases/${req.id}/approve`,'POST');await refresh()}catch(e){err(e)}};
     const reject=el('button','Reject');reject.className='danger';reject.type='button';reject.onclick=async()=>{try{await api(`/admin/purchases/${req.id}/reject`,'POST');await refresh()}catch(e){err(e)}};
     item.append(approve,reject);
    }
    list.append(item);
   }
  }catch(e){err(e)}
 }
 $('refresh').onclick=refresh;
 $('proposal').addEventListener('submit',async e=>{e.preventDefault();
  const price=Number($('price').value);const cents=Math.round(price*100);
  if(!Number.isFinite(price)||Math.abs(price*100-cents)>1e-6||cents<=0){err(Error('Enter a valid price in dollars and cents.'));return}
  try{await api('/admin/purchases/request','POST',{vendor:$('vendor').value,item:$('item').value,amount_cents:cents});$('price').value='';$('item').value='';await refresh()}catch(error){err(error)}
 });
})();
