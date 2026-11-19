const backend=(window.ROLLO_BACKEND_URL||'').replace(/\/$/,'');
const $=id=>document.getElementById(id);
const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=String(text);return el;};
const link=(url,label)=>{const a=node('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
async function request(path,options){if(!backend)throw Error('Cloud backend is not configured');const r=await fetch(backend+path,options);const body=await r.json();if(!r.ok)throw Error(body.error||'Request failed');return body;}
async function books(){
 const target=$('library-books');try{
  const body=await request('/library/books');target.replaceChildren();
  for(const b of body.books||[]){const article=node('article','library-book');article.append(node('strong','',b.title),node('small','',b.author));
   const badge=b.finished_at?'Finished':b.sessions?`Reading · ${b.percent}%`:(b.ready?'Available to read':'On the shelf · ready to fetch');
   article.append(node('small','',badge));if(b.source_url)article.append(link(b.source_url,'Original source'));else article.append(node('small','','Owner-uploaded TXT'));target.append(article);
  }
  if(!body.books?.length)target.textContent='No books yet.';
 }catch(e){target.textContent='Could not open the shelf: '+e.message;}
}
async function history(){const target=$('reading-history');try{
 const body=await request('/library/history');target.replaceChildren();
 for(const h of body.entries||[]){const article=node('article','reading-entry');article.append(node('small','',h.stamp),node('h3','',h.title));
  article.append(node('small','',h.author+' · '+(h.thought_source==='ai'?'AI-assisted reflection':'Reading note')));
  if(h.excerpt)article.append(node('blockquote','',h.excerpt));
  if(h.insight_observation&&h.insight_evidence){const insight=node('div','reading-insight');insight.append(node('strong','','What Rollo noticed in this passage'),node('p','',h.insight_observation),node('small','',`Evidence from the text: “${h.insight_evidence}”`));article.append(insight);}
  article.append(node('p','thought',h.reaction));if(h.question)article.append(node('p','library-muted','Rollo wondered: '+h.question));if(h.source_url)article.append(link(h.source_url,'See original book'));target.append(article);
 }
 if(!body.entries?.length)target.textContent='Rollo has not read a book yet. His first library visit after the update will begin his history.';
 }catch(e){target.textContent='Could not open reading history: '+e.message;}}
$('library-search').addEventListener('submit',async event=>{
 event.preventDefault();const target=$('library-search-results');target.textContent='Searching Project Gutenberg…';try{
 const q=$('library-query').value.trim();const body=await request('/library/search?q='+encodeURIComponent(q));target.replaceChildren();
 if(!body.results?.length){target.textContent='No matching public-domain texts found.';return;}
 for(const b of body.results){const el=node('div','library-book');el.append(node('strong','',b.title),node('small','',b.author),link(b.link,'Open book page'));target.append(el);}
 }catch(e){target.textContent=e.message;}
});
$('library-import').addEventListener('submit',async event=>{
 event.preventDefault();const out=$('library-import-result');const file=$('library-file').files?.[0];
 if(!file){out.textContent='Choose a .txt file.';return;}if(file.size>1500000){out.textContent='That book is over 1.5 MB. Please use a smaller plain-text edition.';return;}
 out.textContent='Adding the book to Rollo’s shelves…';try{
 const text=await file.text();
 const body=await request('/admin/library/import',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+$('library-token').value},body:JSON.stringify({id:Number($('library-id').value),title:$('library-title').value,author:$('library-author').value,tags:$('library-tags').value,text})});
 out.textContent=`Added successfully: ${body.chars.toLocaleString()} characters. Rollo may choose to read it at a future library visit.`;$('library-token').value='';await books();
 }catch(e){out.textContent='Could not import: '+e.message;}
});
async function activity(){
 const el=$('reading-activity');
 try{
  const state=await request('/state');
  const completed=Number(state.visits?.library||0);
  const heading=state.currentTask?.action==='library'?'Rollo is spending time in the library now.':state.currentTravel?.action==='library'?'Rollo is walking to the library.':'';
  const suffix=completed===0?'No completed library visits recorded yet.':`${completed} completed library visit${completed===1?'':'s'} in this saved world.`;
  el.textContent=[heading,suffix].filter(Boolean).join(' ');
 }catch{el.textContent='Reading activity status is unavailable. Existing entries, if any, are shown below.';}
}
books();history();activity();
setInterval(()=>{books();history();activity();},60000);

// Owner-only upload of any authorized UTF-8 plain-text work, independent of Gutenberg.
$('library-upload-file').addEventListener('change',()=>{
 const file=$('library-upload-file').files?.[0];
 if(file&&!$('library-upload-title').value.trim())$('library-upload-title').value=file.name.replace(/\.(txt|pdf)$/i,'').replace(/[_-]+/g,' ').slice(0,180);
});
$('library-upload').addEventListener('submit',async event=>{
 event.preventDefault();
 const out=$('library-upload-result'),file=$('library-upload-file').files?.[0];
 if(!file){out.textContent='Choose a .txt file.';return;}
 if(!/\.(txt|pdf)$/i.test(file.name)){out.textContent='Please select a .txt or text-based .pdf file.';return;}
 if(/\.txt$/i.test(file.name)&&file.size>1_500_000){out.textContent='TXT files must be 1.5 MB or smaller.';return;}
 if(/\.pdf$/i.test(file.name)&&file.size>20_000_000){out.textContent='PDFs must be 20 MB or smaller for on-device conversion.';return;}
 out.textContent=/\.pdf$/i.test(file.name)?'Extracting selectable text from the PDF on your device…':'Saving your text to the shelves…';
 try{
  const text=/\.pdf$/i.test(file.name)?await extractPdfText(file,out):await file.text();
  if(new TextEncoder().encode(text).byteLength>1_500_000)throw Error('Extracted text exceeds 1.5 MB. Divide this book into smaller volumes.');
  if(text.includes('\0'))throw Error('Only readable text can be uploaded, not binary data.');
  out.textContent='Saving extracted text to the library…';
  const data=await request('/admin/library/upload',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+$('library-upload-token').value},body:JSON.stringify({title:$('library-upload-title').value,author:$('library-upload-author').value||'Unknown',tags:$('library-upload-tags').value,source_url:$('library-upload-source').value,text})});
  out.textContent=`Added ${data.chars.toLocaleString()} characters from ${file.name}. Rollo may choose to read this at a future library visit.`;
  $('library-upload-token').value='';$('library-upload-file').value='';await books();
 }catch(e){out.textContent='Upload failed: '+e.message;}
});


// Convert PDF to text on the owner's device. Only the extracted TEXT is sent to
// Cloudflare. The original PDF is never uploaded. Scanned image PDFs need OCR
// elsewhere; we do not pretend those pages were read.
async function getPdfLibrary(){
 if(window.pdfjsLib)return window.pdfjsLib;
 if(!window.__rolloPdfJs){window.__rolloPdfJs=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  script.crossOrigin='anonymous';
  script.onload=()=>window.pdfjsLib?resolve(window.pdfjsLib):reject(Error('PDF.js was not available'));
  script.onerror=()=>reject(Error('PDF text conversion library could not load. Check your internet connection or convert this PDF to .txt on your Mac.'));
  document.head.append(script);
 });}
 const pdfjs=await window.__rolloPdfJs;
 pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
 return pdfjs;
}
export async function extractPdfText(file,out){
 const pdfjs=await getPdfLibrary();
 let doc;
 try{
  doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  if(doc.numPages>500)throw Error('PDF exceeds 500 pages. Split into smaller files.');
  let all='',pagesWithText=0;
  for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
   if(pageNo===1||pageNo%10===0||pageNo===doc.numPages)out.textContent=`Reading PDF text: page ${pageNo} of ${doc.numPages}…`;
   const page=await doc.getPage(pageNo);
   const layer=await page.getTextContent();
   let content='';
   for(const item of layer.items){if(typeof item.str==='string'){content+=item.str+(item.hasEOL?'\n':' ');}}
   content=content.replace(/[ \t]+\n/g,'\n').trim();
   if(content.length>=20)pagesWithText++;
   all+=content+'\n\n';
   if(new TextEncoder().encode(all).byteLength>1_500_000)throw Error('The extracted text exceeds 1.5 MB. Split the PDF into smaller sections.');
  }
  if(pagesWithText===0||all.trim().length<200)throw Error('This PDF has little or no selectable text (possibly scanned pages). Convert it with OCR first.');
  return all.trim();
 }finally{if(doc)await doc.destroy();}
}


// Public book nominations remain private until reviewed by the owner.
async function approvedSuggestions(){
 const target=$('approved-book-suggestions');
 try{
  const data=await request('/library/suggestions');target.replaceChildren();
  if(!data.approved?.length){target.textContent='No community book suggestions approved yet.';return;}
  for(const suggestion of data.approved){
   const article=node('article','');article.append(node('strong','',suggestion.title));
   if(suggestion.author)article.append(node('small','',suggestion.author));
   article.append(node('small','',suggestion.readable?'Readable copy is on the shelf':'Approved · waiting for a readable copy'));
   target.append(article);
  }
 }catch(e){target.textContent='Could not load suggestions: '+e.message;}
}
$('book-suggestion-form').addEventListener('submit',async event=>{
 event.preventDefault();const out=$('book-suggestion-result');
 if(window.RolloVisitor&&!window.RolloVisitor.canSubmit()){
  out.textContent=window.RolloVisitor.message();return;
 }
 out.textContent='Sending your suggestion for private review…';
 try{
  const data=await request('/library/suggestions',{method:'POST',headers:{'Content-Type':'application/json',...(window.RolloVisitor?.headers?.()||{})},body:JSON.stringify({title:$('suggest-title').value,author:$('suggest-author').value,reason:$('suggest-reason').value,source_url:$('suggest-url').value,website:$('suggest-website').value})});
  if(data.nextAllowedAt)window.RolloVisitor?.storeNext?.(data.nextAllowedAt);
  window.RolloVisitor?.paint?.();
  out.textContent='Submitted for owner review. Rollo will not see it unless approved and a readable copy is added.';
  $('book-suggestion-form').reset();
 }catch(e){out.textContent='Could not submit suggestion: '+e.message;}
});
approvedSuggestions();setInterval(approvedSuggestions,60000);
