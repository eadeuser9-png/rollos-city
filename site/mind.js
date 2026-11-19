/** Rollo's experience-driven behavior. No external services, no hidden generated text.
 * Feelings are modeled variables, not evidence of subjective experience.
 * Curiosity is a stable trait; interests and expressed enthusiasm are earned from events.
 */
export const DISCOVERIES={
  library:[
    {topic:'water pressure',skill:'engineering',link:'workshop',idea:'I found a diagram of how pressure changes along a pipe.',question:'Could I test that using the old faucet at the repair shop?'},
    {topic:'local history',skill:'reading',link:'alley',idea:'An old street map looks nothing like the city outside.',question:'I wonder which parts of it are still there.'},
    {topic:'sound waves',skill:'investigation',link:'workshop',idea:'A book showed how a vibrating surface makes sound.',question:'Maybe the old radio could help me understand it.'},
    {topic:'plants on rooftops',skill:'reading',link:'garden',idea:'Some plants grow differently when the wind changes.',question:'Does that happen to the planters on my roof?'},
    {topic:'color and light',skill:'investigation',link:'workshop',idea:'Light can change the way a painted object looks.',question:'Could I try the same paint in two different places?'},
    {topic:'city transit',skill:'reading',link:'alley',idea:'I traced the routes that connect parts of North Quay.',question:'Why do some streets take so much longer to cross?'},
    {topic:'food preservation',skill:'reading',link:'garden',idea:'I read about ways to keep harvested food edible longer.',question:'Could I make my rooftop harvest last?'},
    {topic:'mechanical linkages',skill:'engineering',link:'workshop',idea:'A drawing showed how one moving part can move another.',question:'I wonder if the old gears in the workshop would fit together.'}
  ],
  workshop:[
    {topic:'mechanical linkages',skill:'engineering',link:'workshop',idea:'Two gears moved together, but I had to change their spacing.',question:'What happens if one gear is larger?'},
    {topic:'sound waves',skill:'engineering',link:'library',idea:'The old speaker made different sounds depending on what I connected.',question:'I want to understand why.'},
    {topic:'water pressure',skill:'engineering',link:'library',idea:'I tried changing a tube’s height and watched the water level.',question:'Would it behave differently in a longer tube?'},
    {topic:'color and light',skill:'investigation',link:'library',idea:'A piece of glass changed the color of the light on the wall.',question:'I wonder what the library says about that.'},
    {topic:'repairing things',skill:'engineering',link:'workshop',idea:'An old switch worked again after I cleaned its contacts.',question:'How many other discarded things just need one small repair?'},
    {topic:'shapes and balance',skill:'investigation',link:'workshop',idea:'A lopsided object spun more smoothly after I moved its weight.',question:'Can I predict which way it will tilt?'}
  ],
  garden:[
    {topic:'plants on rooftops',skill:'investigation',link:'library',idea:'Two planters grew differently even though I watered both.',question:'Maybe the wind or shade makes the difference.'},
    {topic:'food preservation',skill:'investigation',link:'library',idea:'I compared the smell and texture of two stored harvests.',question:'Could I make them keep longer?'}
  ],
  alley:[
    {topic:'local history',skill:'investigation',link:'library',idea:'I found an old sign behind a newer wall.',question:'What used to be here?'},
    {topic:'city transit',skill:'investigation',link:'library',idea:'I tried another route and reached the square sooner.',question:'Can I map an even better shortcut?'},
    {topic:'shapes and balance',skill:'investigation',link:'workshop',idea:'An uneven cart rolled differently on the sloped street.',question:'Would moving the load change its path?'}
  ],
  bar:[
    {topic:'people and stories',skill:'communication',link:'forum',idea:'Two customers described the same event in different ways.',question:'Why did they remember different details?'},
    {topic:'rhythm and music',skill:'communication',link:'library',idea:'A tune at the bar kept changing, and people seemed to notice.',question:'What makes a rhythm memorable?'}
  ],
  forum:[
    {topic:'people and stories',skill:'communication',link:'library',idea:'Someone gave me a different way to look at a question.',question:'I should check what I know before deciding.'}
  ]
};
const CLAMP=(v,a=0,b=100)=>Math.min(b,Math.max(a,v));
export function newMind(){return {curiosityTrait:92,interests:{},excitement:0,focus:null,discoveries:[],journal:[{id:'opening',day:1,when:'Day 1 · 08:00',kind:'reflection',topic:null,text:'I know the way to the bar. Everything else is still a question. I wonder what I will find here.'}],reflectionCounter:0,projects:[],hypotheses:{},traits:{methodical:50,sociable:50,playful:50},lastReflectDay:0};}
export function upgradeMind(m){let base=newMind();return {...base,...(m&&typeof m==='object'?m:{}),interests:{...(m?.interests||{})},traits:{...base.traits,...(m?.traits||{})},journal:Array.isArray(m?.journal)?m.journal.slice(0,90):base.journal,discoveries:Array.isArray(m?.discoveries)?m.discoveries.slice(0,110):[],projects:Array.isArray(m?.projects)?m.projects.slice(0,4):[],hypotheses:{...(m?.hypotheses||{})}};}
export function discoveryOptions(place){return DISCOVERIES[place]||[];}
// Pick under-explored options frequently; existing interests can influence, not dictate, choice.
export function pickDiscovery(s,place,rng=Math.random){let choices=discoveryOptions(place);if(!choices.length)return null;
 let m=upgradeMind(s.mind);let weights=choices.map(d=>{let t=m.interests[d.topic];let known=t?.exposures||0;let recent=t?.lastDay===s.day;let preference=CLAMP(t?.score||0,-30,80);return Math.max(.35,2.3+(preference/45)+(known===0?1.8:0)-(recent?1.4:0)-Math.max(0,known-4)*.12)});
 let total=weights.reduce((a,b)=>a+b,0),r=rng()*total;
 for(let i=0;i<weights.length;i++){r-=weights[i];if(r<=0)return choices[i]}return choices.at(-1);
}
export function publicReflection(s, text, kind='observation',topic=null){
 s.mind=upgradeMind(s.mind);let entry={id:`${s.day}-${s.actions}-${s.mind.reflectionCounter++}`,day:s.day,when:`Day ${s.day} · ${String(Math.floor(s.hour)).padStart(2,'0')}:${String(Math.floor(s.minute||0)).padStart(2,'0')}`,kind,topic,text:String(text).slice(0,380)};
 s.mind.journal.unshift(entry);s.mind.journal=s.mind.journal.slice(0,90);return entry;
}
export function experience(s,d,place,rng=Math.random){
 s.mind=upgradeMind(s.mind);const m=s.mind,t=m.interests[d.topic]||{score:0,exposures:0,lastDay:0};let first=t.exposures===0;
 let surprise=first?17:(t.lastDay<s.day?7:2);let alignment=t.score>13?12:0;
 // No predetermined love of any topic. An observation may capture his interest, or not.
 let chance=rng();let response=CLAMP(Math.round(14+surprise+alignment+chance*37),0,100);
 t.score=CLAMP(t.score+(response>=52?6:response>=38?3:0)-(response<32?2:0),0,85);
 t.exposures++;t.lastDay=s.day;t.lastPlace=place;m.interests[d.topic]=t;
 m.discoveries.unshift({topic:d.topic,place,day:s.day,when:`Day ${s.day} · ${String(Math.floor(s.hour)).padStart(2,'0')}:${String(Math.floor(s.minute||0)).padStart(2,'0')}`,idea:d.idea,question:d.question,response});m.discoveries=m.discoveries.slice(0,110);
 // Working ideas are provisional. Repeated observations can revise the question rather than entrench it.
 const previous=m.hypotheses[d.topic];
 if(!previous)m.hypotheses[d.topic]={idea:d.question,confidence:18,revisions:0,updatedDay:s.day};
 else {
  const revise=previous.idea!==d.question && (t.exposures%2===0 || response>=55);
  if(revise){const earlier=previous.idea;previous.idea=d.question;previous.confidence=CLAMP(previous.confidence-6,5,65);previous.revisions++;previous.updatedDay=s.day;
   publicReflection(s,`I used to ask: ${earlier} But after another look, I'm asking: ${d.question} I shouldn't assume my first idea was right.`,'reconsidering',d.topic);
  }else{previous.confidence=CLAMP(previous.confidence+3,5,65);previous.updatedDay=s.day;}
 }
 // Long-term investigation goals appear only after sustained interest.
 let project=m.projects.find(p=>p.topic===d.topic);
 if(!project&&t.exposures>=3&&t.score>=12){
  project={topic:d.topic,goal:`Explore this question: ${d.question}`,progress:0,startedDay:s.day};
  m.projects.unshift(project);m.projects=m.projects.slice(0,4);
  publicReflection(s,`I keep returning to ${d.topic}. I think I'll make a project of it: ${d.question}`,'project',d.topic);
 }
 if(project){project.progress++;if(project.progress%4===0)publicReflection(s,`I have made ${project.progress} observations for my ${d.topic} project. I have more to test, not a final answer.`,'project',d.topic)}
 let excited=response>=53;
 m.excitement=CLAMP(m.excitement+(excited?24:9),0,100);
 // Excitement drives follow-up behavior, not just dialogue.
 if(excited){m.focus={topic:d.topic,destination:d.link,remaining:Math.min(2,first?2:1),lastDay:s.day};}
 m.traits.methodical=CLAMP(m.traits.methodical+(place==='workshop'?1.1:place==='alley'?-0.4:0),20,85);
 m.traits.sociable=CLAMP(m.traits.sociable+(['forum','bar'].includes(place)?1.1:place==='library'?-0.35:0),20,85);
 m.traits.playful=CLAMP(m.traits.playful+(place==='alley'?1.1:place==='library'?-0.25:0),20,85);
 // A discovery feeds Rollo's curiosity; it isn't an expense paid out of a finite curiosity tank.
 // He can be fascinated, or simply leave a new question open for another day.
 const before=Number.isFinite(s.curiosity)?s.curiosity:70;
 s.curiosity=CLAMP(Math.max(50,before)+(excited?5:first?2:-2));
 s.thought=excited?`${d.idea} ${d.question}`:d.question;
 if(first||excited||t.exposures%3===0){
  let words=excited?`Something caught my attention today: ${d.idea} ${d.question}`:
     first?`I came across ${d.topic} today. ${d.idea} I'm not sure yet whether I want to follow it further.`:
     `I returned to ${d.topic}. ${d.idea} It feels a little more familiar now.`;
  publicReflection(s,words,excited?'spark':'observation',d.topic);
 }
 return {excited,response,topic:d.topic,first,score:t.score};
}
export function curiosityDestination(s,allowed){
 let m=upgradeMind(s.mind);if(!m.focus||m.focus.remaining<=0)return null;
 if(!allowed.includes(m.focus.destination)){m.focus=null;return null}
 const dest=m.focus.destination;m.focus.remaining--;if(m.focus.remaining<=0)m.focus=null;
 return dest;
}
export function passTime(s,amount=1){s.mind=upgradeMind(s.mind);s.mind.excitement=CLAMP(s.mind.excitement-amount,0,100)}
export function refreshInterests(s){s.mind=upgradeMind(s.mind);
 for(let t of Object.values(s.mind.interests))if(t.lastDay<s.day-2)t.score=CLAMP(t.score-.45,0,85);
 // Topics can fade, but memories remain. Stable curiosity never decays.
}
export function rankedInterests(s,n=6){return Object.entries(upgradeMind(s.mind).interests).sort((a,b)=>b[1].score-a[1].score||b[1].exposures-a[1].exposures).slice(0,n).map(([topic,data])=>({topic,...data}));}

// Select a place using emerging traits, memories and interests. No hardwired "favorite hobby".
export function chooseWander(s,places,rng=Math.random){
 const m=upgradeMind(s.mind);const likes=m.interests||{};let total=0;
 const scored=places.map(place=>{
  let topics=discoveryOptions(place);
  let top=Math.max(0,...topics.map(t=>likes[t.topic]?.score||0));
  let visits=s.visits?.[place]||0;
  let tendency=place==='workshop'?(m.traits.methodical-50)/65:place==='forum'?(m.traits.sociable-50)/65:place==='alley'?(m.traits.playful-50)/65:0;
  let weight=Math.max(.25,1.35+top/44+tendency+Math.min(.8,2/(visits+1)));
  total+=weight;return {place,weight};
 });
 let r=rng()*total;for(const v of scored){r-=v.weight;if(r<=0)return v.place}return places.at(-1)||'library';
}

// Keep a high-curiosity character willing to explore between discoveries.
// A much older implementation drained 17-28 points at every discovery while restoring
// less than a point each real minute. Recovery gradually returns toward a trait-based
// baseline instead of fabricating a constantly-full meter.
export function renewCuriosity(s,simMinutes=2){
 s.mind=upgradeMind(s.mind);
 const trait=CLAMP(Number(s.mind.curiosityTrait??75));
 const baseline=CLAMP(30+trait*.60,55,92);
 const current=CLAMP(Number.isFinite(s.curiosity)?s.curiosity:baseline);
 const replenished=Math.max(50,current); // Rebase legacy, depleted curiosity meters.
 const elapsed=Math.max(0,Math.min(120,Number(simMinutes)||0));
 const fraction=1-Math.exp(-elapsed/20);
 s.curiosity=CLAMP(replenished+(baseline-replenished)*fraction);
 return s.curiosity;
}
