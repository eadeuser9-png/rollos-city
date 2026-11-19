/** Fictional rooftop food simulation with recognizable crops and optional source-based learning.
 * All yields/timings are SIMULATION gameplay values, not real horticultural claims.
 * No AI or visitor can create a food shortage through spending decisions.
 */
export const CROPS=Object.freeze([
 {id:'kale',name:'Kale',days:2,tip:'Kale grows well in fertile, well-drained soil; harvest outer leaves regularly.',source:'https://extension.oregonstate.edu/imported-publication/kale'},
 {id:'tomato',name:'Cherry tomatoes',days:3,tip:'Tomatoes need warm conditions and should be supported while fruit develops.',source:'https://extension.oregonstate.edu/imported-publication/tomatoes'},
 {id:'peas',name:'Garden peas',days:2,tip:'Edible peas are cool-season vegetables; climbing types benefit from support.',source:'https://extension.oregonstate.edu/catalog/em-9027-growing-your-own'},
 {id:'radish',name:'Radishes',days:2,tip:'Radishes are quick-growing root vegetables. Keep their soil evenly moist.',source:'https://extension.oregonstate.edu/catalog/em-9027-growing-your-own'}
]);
export function ensureGarden(s){
 if(!s.garden||!Array.isArray(s.garden.beds)||s.garden.beds.length!==CROPS.length){
  s.garden={beds:CROPS.map((c,i)=>({crop:c.id,name:c.name,plantedDay:Math.max(1,(s.day||1)-1-i%2),readyDay:(s.day||1)+(i%2?1:2),harvests:0})),research:[],lastResearchDay:0,lastHarvested:[],careStyle:'self-sustaining rooftop beds'};
 }
 // An old world may have no harvest in storage. The established garden provides the safety reserve.
 s.gardenSupply=Math.max(2,Math.min(12,Number(s.gardenSupply)||0));
 return s.garden;
}
export function gardenNewDay(s){
 const garden=ensureGarden(s),produced=[];
 for(const bed of garden.beds){
  if((s.day||1)>=bed.readyDay){
   produced.push(bed.name);bed.harvests++;bed.plantedDay=s.day;
   const crop=CROPS.find(c=>c.id===bed.crop);bed.readyDay=s.day+(crop?.days||2);
  }
 }
 // Staggered mature planters support a few meals EVERY day in this accelerated fictional world.
 s.gardenSupply=Math.min(12,Math.max(4,(Number(s.gardenSupply)||0)+4));
 garden.lastHarvested=produced;
 return produced;
}
export function gardenHarvest(s){
 const garden=ensureGarden(s);
 // At least one crop is always harvestable from established perpetual planters.
 const cycle=garden.beds[(s.actions||0)%garden.beds.length];
 const names=[...new Set([cycle.name,...(garden.lastHarvested||[])])].slice(0,3);
 const meals=Math.min(5,Math.max(2,Number(s.gardenSupply)||2));
 s.pantry=(Number(s.pantry)||0)+meals;s.gardenSupply=Math.max(0,s.gardenSupply-meals);
 garden.lastHarvested=[];
 return {meals,crops:names};
}
export function maybeResearchGarden(s){
 const garden=ensureGarden(s);
 // Plant care is never compulsory. Rollo researches only when his own interests/focus show curiosity.
 const f=String(s.mind?.focus?.topic||'').toLowerCase();
 const personalInterest=Object.entries(s.mind?.interests||{}).some(([topic,data])=>/garden|plant|grow|kale|tomato|pea|radish|food preservation/i.test(topic)&&Number(data?.score||0)>=4);
 if(!personalInterest&&!/garden|plant|grow|kale|tomato|pea|radish|food preservation/.test(f))return null;
 if(garden.lastResearchDay===(s.day||1)||!((s.actions||0)%3===0))return null;
 const crop=CROPS[(s.actions||0)%CROPS.length];
 garden.lastResearchDay=s.day;
 const research={crop:crop.name,finding:crop.tip,source:crop.source,when:`Day ${s.day} · ${String(Math.floor(s.hour||0)).padStart(2,'0')}:${String(Math.floor(s.minute||0)).padStart(2,'0')}`,kind:'curated-guide'};
 garden.research=[research,...garden.research].slice(0,12);
 return research;
}
