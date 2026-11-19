/** Private contributor continuity. Browser ID is HMAC-like hashed by VISITOR_RATE_SECRET
 * in community.js and never written to public world_state or browser output.
 * This is browser continuity, NOT proof of a human's identity.
 */
export async function storeContributor(env,kind,submissionId,visitorKey){
 if(!visitorKey||!submissionId)return;
 try{await env.DB.prepare('INSERT OR IGNORE INTO rollo_contributor_links(kind,submission_id,visitor_key) VALUES (?,?,?)').bind(kind,submissionId,visitorKey).run()}
 catch(e){console.warn('ROLLO_SOCIAL_MIGRATION_REQUIRED',String(e?.name||'Error'))}
}
export async function getContributorKey(env,event){
 if(event?.owner===true)return 'owner';
 const kind=event.kind==='photo'?'photo':'forum',id=Number(event.contributionId||0);
 if(!id)return null;
 try{const row=await env.DB.prepare('SELECT visitor_key FROM rollo_contributor_links WHERE kind=? AND submission_id=?').bind(kind,id).first();return row?.visitor_key||null}catch{return null}
}
export async function recentContributorMemories(env,key){
 if(!key)return [];
 try{const q=await env.DB.prepare('SELECT alias,kind,excerpt,decision,created_at FROM rollo_social_memories WHERE visitor_key=? ORDER BY id DESC LIMIT 6').bind(key).all();return (q.results||[]).map(x=>({alias:x.alias,kind:x.kind,excerpt:x.excerpt,decision:x.decision}))}catch{return []}
}
export async function persistSocialMemory(env,event,moment,key){
 try{
  // Source IDs tie memory to a moderated submission. De-duplicate the same contribution.
  await env.DB.prepare(`INSERT OR IGNORE INTO rollo_social_memories
   (source_kind,source_id,visitor_key,alias,kind,excerpt,decision,created_at)
   VALUES (?,?,?,?,?,?,?,?)`)
   .bind(event.kind,event.contributionId||event.sourceId||null,key,event.author,event.kind,event.body.slice(0,220),moment.decision,Date.now()).run();
  // Keep a bounded private history, not an unlimited dossier.
  if(key)await env.DB.prepare(`DELETE FROM rollo_social_memories WHERE visitor_key=? AND id NOT IN
   (SELECT id FROM rollo_social_memories WHERE visitor_key=? ORDER BY id DESC LIMIT 24)`).bind(key,key).run();
 }catch(e){console.warn('ROLLO_SOCIAL_MEMORY_WRITE_FAILED',String(e?.name||'Error'))}
}
