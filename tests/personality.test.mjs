import test from 'node:test';
import assert from 'node:assert/strict';
import {newMind,upgradeMind,pickDiscovery,experience,curiosityDestination,passTime,chooseWander,rankedInterests} from '../cloudflare/mind.js';
const state=()=>({day:1,hour:8,minute:0,actions:0,visits:{},curiosity:85,mind:newMind()});
test('curiosity is stable, but no topic is a predetermined favorite',()=>{
 const s=state();assert.equal(s.mind.curiosityTrait,92);
 assert.deepEqual(s.mind.interests,{});assert.ok(s.mind.journal.length>0);
 assert.equal(rankedInterests(s).length,0);
});
test('a novel interesting discovery creates observable follow-up and a public journal entry',()=>{
 const s=state(),d={topic:'water pressure',skill:'engineering',link:'workshop',idea:'The water moved.',question:'Why does it move this way?'};
 const result=experience(s,d,'library',()=>.95);
 assert.equal(result.excited,true);assert.equal(s.mind.focus.destination,'workshop');assert.ok(s.mind.excitement>0);
 assert.ok(s.mind.journal.some(j=>j.kind==='spark'&&j.topic==='water pressure'));
 assert.equal(curiosityDestination(s,['workshop','library']),'workshop');
 assert.equal(curiosityDestination(s,['workshop','library']),'workshop');
 assert.equal(curiosityDestination(s,['workshop','library']),null);
 passTime(s,4);assert.ok(s.mind.excitement<90);
});
test('repeated observations can revise tentative ideas and generate an independent project',()=>{
 const s=state();let one={topic:'sound waves',link:'workshop',idea:'A wire buzzed.',question:'Is volume related to current?'},two={topic:'sound waves',link:'library',idea:'A surface vibrated.',question:'Could vibration explain the sound?'};
 experience(s,one,'workshop',()=>.95);experience(s,two,'workshop',()=>.95);experience(s,one,'library',()=>.95);
 assert.ok(s.mind.hypotheses['sound waves'].revisions>=1);
 assert.ok(s.mind.projects.some(p=>p.topic==='sound waves'));
 assert.ok(s.mind.journal.some(j=>j.kind==='reconsidering'));
 assert.equal(s.mind.curiosityTrait,92);
});
test('wandering uses developed preferences but retains other options',()=>{
 const s=state();let entries=Array(12).fill(null).map(()=>chooseWander(s,['library','workshop','forum'],Math.random));
 assert.equal(entries.length,12);assert.ok(entries.every(x=>['library','workshop','forum'].includes(x)));
 assert.deepEqual(upgradeMind(null).interests,{});
});
