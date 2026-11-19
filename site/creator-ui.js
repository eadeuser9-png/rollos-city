const base=(window.ROLLO_BACKEND_URL||'').replace(/\/$/,'');
const $=id=>document.getElementById(id);
let token='';
const status=message=>{$('creator-status').textContent=message;};
async function api(path,options={}){
 if(!base)throw Error('Set your existing Cloudflare Worker URL in config.js.');
 if(!token)throw Error('Unlock your private conversation first.');
 const r=await fetch(base+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})}});
 const body=await r.json();if(!r.ok)throw Error(body.error||'Request failed');return body;
}
const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;};
async function refresh(){
 const b=await api('/owner/creator');
 $('creator-nickname').value=b.profile?.nickname||'';$('creator-context').value=b.profile?.context||'';
 const thread=$('creator-thread');thread.replaceChildren();
 for(const m of b.messages||[]){
  const bubble=make('div','creator-bubble '+m.sender);
  const date=new Date(m.created_at);bubble.append(make('small','',`${m.sender==='owner'?'You':'Rollo'} · ${Number.isFinite(date.getTime())?date.toLocaleString():''}`),make('div','',m.body));thread.append(bubble);
 }
 if(!(b.messages||[]).length)thread.textContent='No messages yet. Rollo may also start one when something catches his interest.';
 thread.scrollTop=thread.scrollHeight;
 status(b.aiAvailable?'Owner access active. Rollo can choose whether to reply.':'Owner access active. Workers AI is not active, so messages can be saved but Rollo cannot generate replies.');
}
$('creator-unlock').onclick=async()=>{
 token=$('creator-token').value.trim();$('creator-token').value='';
 try{await refresh()}catch(e){token='';status('Could not unlock: '+e.message)}
};
$('creator-lock').onclick=()=>{token='';$('creator-thread').textContent='Locked';$('creator-nickname').value='';$('creator-context').value='';status('Locked');};
$('creator-refresh').onclick=()=>refresh().catch(e=>status(e.message));
$('creator-profile-form').onsubmit=async e=>{e.preventDefault();try{await api('/owner/creator/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:$('creator-nickname').value,context:$('creator-context').value})});status('Profile saved.');}catch(err){status(err.message)}};
$('creator-message-form').onsubmit=async e=>{
 e.preventDefault();const body=$('creator-message').value.trim();if(!body)return;
 $('creator-send').disabled=true;
 try{
  const r=await api('/owner/creator/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body})});
  $('creator-message').value='';await refresh();if(r.choice==='ignore')status('Message saved. Rollo chose not to respond.');else if(r.choice==='not_available')status('Message saved. No model response was available.');
 }catch(err){status('Could not send: '+err.message)}finally{$('creator-send').disabled=false;}
};
