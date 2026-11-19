// Render-only animation. Never influences Rollo's autonomous route or decisions.
export function blinkHeight(ms){
  // Brief, natural blink approximately every 4.6 seconds, with a second tiny blink occasionally.
  const cycle=(ms+750)%4600, closed=cycle>4420;
  if(!closed)return 1;
  return Math.max(.08,Math.abs(cycle-4510)/90);
}
export function walkPose(distance,walking){
  const stride=distance*11;
  return {stride, swing:walking?Math.sin(stride)*.22:0, bob:walking?Math.abs(Math.sin(stride))*.025:0};
}
