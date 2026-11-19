import {allRolloCreations, imagePreview} from './art-gallery.js';
const base=(window.ROLLO_BACKEND_URL||'').trim().replace(/\/$/,'');
const $=id=>document.getElementById(id);
function item(title,desc,src){
  const wrap=document.createElement('article');wrap.className='gallery-item';
  const thumb=imagePreview({src,title,subtitle:desc});
  const strong=document.createElement('strong');strong.textContent=title;
  const small=document.createElement('small');small.textContent=desc||'';
  wrap.append(thumb,strong,small);return wrap;
}
async function refresh(){
 if(!base)return;
 try{
  const [creations,photosResponse]=await Promise.all([allRolloCreations(base),fetch(base+'/photos',{cache:'no-store'})]);
  if(!photosResponse.ok)throw Error('Photos are unavailable');
  const photos=await photosResponse.json();
  const c=$('creations'),p=$('photos');if(!c||!p)return;
  c.replaceChildren();p.replaceChildren();
  for(const x of creations)c.append(item(x.title,`${x.stamp} · ${x.topic}`,`${base}/creations/${x.id}.svg`));
  for(const x of photos.photos||[])p.append(item(x.caption,`From ${x.name}`,`${base}/photos/${x.id}.webp`));
  if(!c.childNodes.length)c.textContent='No drawings yet. Rollo may make one when a subject captures his attention.';
  if(!p.childNodes.length)p.textContent='No visitor photos approved yet.';
 }catch(e){console.warn('Community gallery unavailable',e)}
}
function readFile(file){return new Promise((resolve,reject)=>{let img=new Image();const uri=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(uri);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(uri);reject(Error('Cannot decode image'))};img.src=uri;});}
async function webpFromFile(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10_000_000)throw Error('Choose a JPEG, PNG, or WebP image smaller than 10MB.');
 const img=await readFile(file),w=img.naturalWidth,h=img.naturalHeight;
 if(!w||!h||w*h>30_000_000)throw Error('This picture is too large to process safely.');
 const scale=Math.min(1,1100/Math.max(w,h)),canvas=document.createElement('canvas');
 canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
 canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
 const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',.74));
 if(!blob||blob.type!=='image/webp'||blob.size>2_000_000)throw Error('The image could not be converted into a small WebP file.');
 return blob;
}
$('photoform')?.addEventListener('submit',async e=>{
 e.preventDefault();const status=$('photoresult');if(!base){status.textContent='Photo submissions require the cloud website.';return;}
 const visitor=window.RolloVisitor;if(visitor&&!visitor.canSubmit()){status.textContent=visitor.message();return;}
 const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;
 try{
  status.textContent='Preparing a smaller copy of your photo…';const file=$('photofile').files[0];const blob=await webpFromFile(file);
  const r=await fetch(base+'/community/photos',{method:'POST',headers:{'Content-Type':'image/webp','X-Visitor-Name':$('photoname').value.trim(),'X-Photo-Caption':$('photocaption').value.trim(),...(visitor?.headers()||{})},body:blob});
  const data=await r.json();if(data.nextAllowedAt)visitor?.storeNext(data.nextAllowedAt);if(!r.ok)throw Error(data.error||'Upload rejected');
  status.textContent='Submitted for owner review. Your next interaction is available after 24 real hours.';e.target.reset();
 }catch(err){status.textContent='Upload failed: '+err.message}finally{btn.disabled=false;visitor?.paint()}
});
refresh();setInterval(refresh,60000);
