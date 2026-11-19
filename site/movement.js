// Rollo's lightweight shared movement rules. No network, user data or payment access.
export const WALK_UNITS_PER_SIM_MINUTE = 0.95;

export function activityDuration(kind, state = {}, rng = Math.random) {
  // Each visit has bounded, variable length. Needs and current interests influence it.
  const ranges = {
    bar:[16,65], home:[60,200], garden:[10,32], market:[9,36], alley:[12,46],
    library:[15,75], workshop:[22,88], forum:[7,25], create:[35,105], station:[14,50], statue:[6,24], grove:[8,35], park:[10,42], square:[8,30]
  };
  const [low, high] = ranges[kind] || [12,50];
  const rand = Math.max(0, Math.min(0.999999, Number(rng()) || 0));
  let minutes = low + (high-low)*rand;
  const energy = Number(state.energy ?? 65);
  const curiosity = Number(state.curiosity ?? 50);
  if(kind==='home' && energy < 35) minutes += 25;
  if(['library','workshop','alley'].includes(kind)) minutes += (curiosity-50)*.2;
  if(kind==='garden' && (state.pantry||0)<2) minutes += 4;
  return Math.max(5,Math.round(minutes));
}
export function activityLabel(kind,name) {
  const labels={bar:'Relaxing and socializing at The Copper Tap',home:'Resting at home',garden:'Tending the rooftop garden',market:'Browsing the night market',alley:'Exploring the backstreets',library:'Reading at the library',workshop:'Investigating at the repair shop',forum:'Checking the city forum',create:'Making a drawing',station:'Watching the trains at North Quay Station',statue:'Visiting Pino’s statue',grove:'Wandering through Squirrel Grove',park:'Walking along the canal',square:'Exploring Old Town Square'};
  return labels[kind] || `Visiting ${String(name||'the city').slice(0,70)}`;
}
export function hideCountdown(value) {
  return String(value || 'Exploring the city')
    .replace(/\s*\(\d+\s+simulated\s+minutes?\s+left\)/gi,'')
    .replace(/\s*\(\d+\s+minutes?\s+left\)/gi,'');
}
export function walkingRoute(from,to) {
  const a={x:Number(from?.x),z:Number(from?.z)},b={x:Number(to?.x),z:Number(to?.z)};
  if(![a.x,a.z,b.x,b.z].every(Number.isFinite))return [];
  if(Math.hypot(b.x-a.x,b.z-a.z)<.08)return [];
  // A simple central street corridor rather than a diagonal through buildings.
  const route=[{x:a.x,z:5.15},{x:b.x,z:5.15},b];
  let prev=a;
  return route.filter(p=>{if(Math.hypot(p.x-prev.x)<.04&&Math.hypot(p.z-prev.z)<.04)return false;prev=p;return true;});
}
export function advanceWalkingRoute(from,remainingRoute,distance) {
  let x=Number(from.x),z=Number(from.z),left=Math.max(0,Number(distance)||0);
  const route=Array.isArray(remainingRoute)?remainingRoute.map(p=>({x:Number(p.x),z:Number(p.z)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)):[];
  while(route.length && left>=0){
    const target=route[0],d=Math.hypot(target.x-x,target.z-z);
    if(d<=.0001){x=target.x;z=target.z;route.shift();continue;}
    if(left<d){x+=(target.x-x)*left/d;z+=(target.z-z)*left/d;left=0;break;}
    x=target.x;z=target.z;left-=d;route.shift();
  }
  return {x,z,route,arrived:route.length===0};
}
