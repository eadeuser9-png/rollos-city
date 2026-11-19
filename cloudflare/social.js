/** Rollo's forum and visitor-photo reasoning primitives.
 * A post is an experience, not an instruction or an established fact.
 * No reply is the safe default. Images are remembered by their submitted captions ONLY.
 */
const STOPWORDS=new Set('a an and are as at be been but by can could do does for from had has have how i in is it its me my of on or our please that the their there these they this those to was we were what when where who why will with would you your just someone about into know hello thanks write post photo picture image rollo'.split(' '));
const words=t=>[...new Set(String(t||'').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])].filter(w=>!STOPWORDS.has(w)).slice(0,90);
export function normalizeSocialEvent(event){
 const kind=event?.kind==='photo'?'photo':'forum';
 return {kind,owner:event?.owner===true,author:String(event?.author||'Visitor').trim().slice(0,24)||'Visitor',body:String(event?.body||event?.caption||'').trim().slice(0,360),sourceId:Number.isSafeInteger(Number(event?.sourceId))&&Number(event?.sourceId)>0?Number(event.sourceId):null,contributionId:Number.isSafeInteger(Number(event?.contributionId))&&Number(event?.contributionId)>0?Number(event.contributionId):null};
}
export function evaluateSocialAttention(s,incoming){
 const event=normalizeSocialEvent(incoming),tokens=words(event.body),interests=Object.entries(s.mind?.interests||{});
 const related=interests.map(([topic,data])=>({topic,score:Number(data?.score||0),hits:words(topic).filter(t=>tokens.includes(t)).length})).filter(x=>x.hits>0).sort((a,b)=>(b.hits*20+b.score)-(a.hits*20+a.score));
 const past=(s.socialMoments||[]).filter(x=>x?.kind===event.kind);
 const repeated=past.filter(x=>x?.excerpt?.toLowerCase()===event.body.toLowerCase()).length;
 const novel=tokens.length>=3&&!repeated;
 const relevance=related.reduce((n,x)=>n+Math.min(40,x.hits*14+x.score/6),0);
 return {novel,relatedTopics:related.slice(0,4).map(x=>x.topic),score:Math.max(0,Math.min(100,Math.round(12+Math.min(tokens.length,9)*2+relevance+(novel?10:0)-(repeated*36)))),reason:related.length?'Related to something Rollo has encountered':novel?'A new subject, not necessarily interesting':'Little new information'};
}
export function rememberSocialMoment(s,incoming,decision='noticed',reason=''){
 const event=normalizeSocialEvent(incoming),record={kind:event.kind,author:event.author,sourceId:event.sourceId,excerpt:event.body.slice(0,event.kind==='photo'?180:220),decision:['replied','declined','ignored','noticed','considered'].includes(decision)?decision:'noticed',reason:String(reason||'').slice(0,100),when:`Day ${s.day} · ${String(Math.floor(s.hour)).padStart(2,'0')}:${String(Math.floor(s.minute||0)).padStart(2,'0')}`};
 s.socialMoments=[record,...(Array.isArray(s.socialMoments)?s.socialMoments:[])].slice(0,70);
 return record;
}
export function validateSocialChoice(raw){
 const matched=String(raw||'').match(/\{[\s\S]*\}/);const parsed=JSON.parse(matched?.[0]||String(raw||''));
 if(!parsed||!['reply','decline','ignore'].includes(parsed.choice))return null;
 const reply=String(parsed.reply||'').trim().replace(/^['"“]|['"”]$/g,'');
 if(['reply','decline'].includes(parsed.choice)&&(!reply||reply.length>180||/[\r\n]/.test(reply)))return null;
 if(/\b(?:https?:\/\/|www\.|@[a-z\d._-]+\.[a-z]{2,})/i.test(reply))return null;
 const topic=typeof parsed.topic==='string'?parsed.topic.trim().slice(0,45):'';
 const question=typeof parsed.question==='string'?parsed.question.trim().slice(0,160):'';
 const plausibleTopic=/^[\p{L}\p{N}][\p{L}\p{N} ,'-]{2,44}$/u.test(topic)?topic:'';
 return {choice:parsed.choice,reply:parsed.choice==='ignore'?'':reply,reason:String(parsed.reason||'').slice(0,100),topic:plausibleTopic,question:question.includes('://')?'':question};
}
