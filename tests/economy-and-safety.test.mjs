import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../cloudflare/worker.js';
import {checkPurchaseInput,checkApprovalPolicy,policy} from '../cloudflare/spending-guard.js';

function testEnv(){
 const sql=readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8');
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(sql);sqlite.exec(readFileSync(new URL('../cloudflare/schema_v10.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v12.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v13.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../cloudflare/schema_v17.sql',import.meta.url),'utf8'));
 const db={prepare(query){let statement=sqlite.prepare(query);let args=[];let obj={
   bind(...values){args=values;return obj},
   async first(){return statement.get(...args)||null},
   async all(){return {results:statement.all(...args)}},
   async run(){let result=statement.run(...args);return {meta:{changes:result.changes,last_row_id:Number(result.lastInsertRowid)}}}
  };return obj}};
 return {DB:db,OWNER_TOKEN:'testing-secret',SITE_ORIGIN:'https://fern.example',LIBRARY_DISABLE_AUTO_IMPORT:'true',AI_DECISIONS:'false',AI_FORUM_REPLIES:'false',AI_THOUGHTS:'false',REAL_PURCHASES_ENABLED:'false',PURCHASE_ALLOWED_MERCHANTS:'Art supplies shop, Printer shop',MAX_TRANSACTION_CENTS:'1000',MONTHLY_CAP_CENTS:'2500'};
}
async function call(env,path,method='GET',body=undefined,auth=false){
 let h={};if(auth)h.Authorization='Bearer testing-secret';if(body)h['Content-Type']='application/json';
 let req=new Request('https://worker.example'+path,{method,headers:h,body:body?JSON.stringify(body):undefined});
 let r=await worker.fetch(req,env);return {status:r.status, data:await r.json()};
}
async function tick(env){let pending;await worker.scheduled({},env,{waitUntil(p){pending=p}});await pending;return (await call(env,'/state')).data}

test('policies default to disabled and require allowlists and caps',()=>{
 assert.equal(policy({}).enabled,false);
 assert.equal(policy({}).requiresOwnerApproval,true);
 assert.equal(policy({}).processorConnected,false);
 assert.equal(checkPurchaseInput({vendor:'Art supplies shop',item:'Ink',amount_cents:399}).ok,true);
 assert.equal(checkPurchaseInput({vendor:'',item:'Ink',amount_cents:399}).ok,false);
 assert.equal(checkPurchaseInput({vendor:'shop',item:'Ink',amount_cents:1.5}).ok,false);
 assert.equal(checkApprovalPolicy({vendor:'Art supplies shop',amount_cents:500},testEnv()).ok,false);
});

test('Rollo has no job, never pays for food, and grows named crops on his rooftop',async()=>{
 const env=testEnv();let s=(await call(env,'/state')).data;
 assert.equal('workMinutesToday' in s,false);
 assert.deepEqual(s.garden.beds.map(b=>b.name),['Kale','Cherry tomatoes','Garden peas','Radishes']);
 let barVisits=0,marketVisits=0;
 for(let i=0;i<1550;i++){
  const priorDay=s.day;
  s=await tick(env);
  assert.equal('workMinutesToday' in s,false);
  assert.equal('coins' in s,false);
  assert.equal('barEarnings' in s,false);
  assert.ok(!/Worked .*Copper Tap|Working at The Copper Tap|Collected .* community food shelf|Bought .* meal/i.test(s.activity));
  assert.ok(s.pantry>=0&&s.emergencyFood>=0&&s.gardenSupply>=0);
  assert.ok(s.garden.beds.every(b=>b.crop&&Number.isSafeInteger(b.readyDay)));
  if(s.activity.includes('Relaxed and chatted'))barVisits++;
  if(s.activity.includes('Browsed the market'))marketVisits++;
  if(s.day!==priorDay)assert.equal(s.lastDailyResetDay,s.day);
 }
 assert.ok(s.actions>=8,'Rollo continues exploring without a job');
 assert.ok(s.gardenSupply>=2,'his established planters can provide food');
 console.log('after 1550 ticks:',s.day,'actions',s.actions,'bar visits',barVisits,'market visits',marketVisits,'pantry',s.pantry);
});

test('purchase requests require token and never charge; approvals obey permissions and caps',async()=>{
 const env=testEnv();
 assert.equal((await call(env,'/admin/purchases')).status,401);
 assert.equal((await call(env,'/admin/purchases', 'GET',undefined,true)).status,200);
 const post=async (vendor, amount_cents)=>call(env,'/admin/purchases/request','POST',{vendor,item:'Rollo creation supply',amount_cents},true);
 const approve=async id=>call(env,`/admin/purchases/${id}/approve`,'POST',undefined,true);
 let a=await post('Art supplies shop',900);
 assert.equal(a.status,201);assert.equal(a.data.charged,false);
 assert.equal((await approve(a.data.id)).status,403,'disabled by default');
 env.REAL_PURCHASES_ENABLED='true';
 assert.equal((await approve(a.data.id)).status,403,'no verified or cleared money, so no approval');
 await env.DB.prepare('INSERT INTO stripe_sales(session_id,payment_intent_id,payment_link_id,gross_cents,created_at) VALUES (?,?,?,?,?)').bind('cs_test_test','pi_test_test','plink_test',5000,Date.now()).run();
 await env.DB.prepare('INSERT INTO wallet_cleared_deposits(reference,amount_cents,confirmed_at) VALUES (?,?,?)').bind('po_testtest',4500,Date.now()).run();
 assert.equal((await approve(a.data.id)).status,200);
 assert.equal((await approve(a.data.id)).status,409,'no double approvals');
 let b=await post('Printer shop',1000);assert.equal((await approve(b.data.id)).status,200);
 let c=await post('Art supplies shop',900);assert.equal((await approve(c.data.id)).status,409,'monthly cap 2500 cents should block 2800');
 let d=await post('Unknown merchant',100);assert.equal((await approve(d.data.id)).status,403,'unlisted merchant blocked');
 let e=await post('Printer shop',1100);assert.equal((await approve(e.data.id)).status,403,'per txn cap 1000');
 let f=await post('Art supplies shop',600);assert.equal((await approve(f.data.id)).status,200,'remaining monthly allowance 600');
 let summary=await call(env,'/admin/purchases','GET',undefined,true);assert.equal(summary.data.requests.filter(x=>x.status==='approved').length,3);
 assert.equal(summary.data.policy.processorConnected,false);
 assert.equal(summary.data.requests.reduce((sum,x)=>sum+(x.status==='approved'?x.amount_cents:0),0),2500);
});
