/* Anonymous browser identity. The server is authoritative about the cooldown.
 * For one-person-across-devices enforcement, a verified visitor login is required. */
(()=>{
 const ID_KEY='rollo.visitor.uuid.v11',COOLDOWN_KEY='rollo.visitor.nextAllowedAt.v11';
 let id='';
 try{id=localStorage.getItem(ID_KEY)||''}catch{}
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)){
  id=crypto.randomUUID();try{localStorage.setItem(ID_KEY,id)}catch{}
 }
 let next=0;try{next=Number(localStorage.getItem(COOLDOWN_KEY)||0)}catch{}
 const storeNext=(value)=>{const n=Number(value||0);if(n>Date.now()){next=n;try{localStorage.setItem(COOLDOWN_KEY,String(n))}catch{}}};
 const nice=(t)=>new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
 const canSubmit=()=>next<=Date.now();
 const message=()=>canSubmit()?'You can send one forum message, photo, OR book suggestion every 24 real hours. Reading and watching are unlimited.':`Your next interaction is available ${nice(next)}.`;
 const paint=()=>{
  for(const elem of document.querySelectorAll('[data-visitor-limit-note]'))elem.textContent=message();
  const disabled=!canSubmit();
  for(const formId of ['replyform','photoform','book-suggestion-form']){
   const btn=document.querySelector('#'+formId+' button[type="submit"]');
   if(btn)btn.disabled=disabled;
  }
 };
 window.RolloVisitor={id,headers:()=>({'X-Rollo-Visitor-Id':id}),storeNext,canSubmit,message,paint};
 // A local hint, not a security boundary. The Worker validates submissions.
 document.addEventListener('DOMContentLoaded',()=>{
  paint();setInterval(paint,30_000);
  const base=(window.ROLLO_BACKEND_URL||'').trim().replace(/\/$/,'');
  if(base)fetch(base+'/community/limit',{headers:{'X-Rollo-Visitor-Id':id}})
   .then(async r=>({status:r.status,data:await r.json()}))
   .then(({data})=>{if(data.nextAllowedAt)storeNext(data.nextAllowedAt);paint()}).catch(()=>{});
 });
})();
