/** Real-world money protection: no payment processor is connected here.
 * Requests are proposals only. Approval never charges an account.
 * Keep all checks on the server, never in public site JavaScript.
 */
export const defaults = Object.freeze({maxTransactionCents:1000, monthlyCapCents:2500});
const intValue = (v, fallback) => {
  const n=Number(v);
  return Number.isSafeInteger(n)&&n>=0?n:fallback;
};
export function policy(env){
  const allowedMerchants=String(env.PURCHASE_ALLOWED_MERCHANTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  return {
    enabled:env.REAL_PURCHASES_ENABLED==='true',
    requiresOwnerApproval:true,
    allowedMerchants,
    maxTransactionCents:intValue(env.MAX_TRANSACTION_CENTS,defaults.maxTransactionCents),
    monthlyCapCents:intValue(env.MONTHLY_CAP_CENTS,defaults.monthlyCapCents),
    processorConnected:false,
  };
}
export function currentBudgetMonth(now=new Date()){return now.toISOString().slice(0,7)}
export function checkPurchaseInput(input){
  const vendor=typeof input?.vendor==='string'?input.vendor.trim():'';
  const item=typeof input?.item==='string'?input.item.trim():'';
  const amountCents=input?.amount_cents;
  if(!vendor||vendor.length>80) return {ok:false,reason:'Vendor must be 1–80 characters.'};
  if(!item||item.length>160) return {ok:false,reason:'Item must be 1–160 characters.'};
  if(!Number.isSafeInteger(amountCents)||amountCents<1||amountCents>10000000) return {ok:false,reason:'Amount must be integer cents from 1 to 10000000.'};
  return {ok:true,vendor,item,amountCents};
}
export function checkApprovalPolicy(input,env){
  const p=policy(env);
  if(!p.enabled)return {ok:false,reason:'Real purchases are disabled. Set REAL_PURCHASES_ENABLED=true only when ready.'};
  if(!p.allowedMerchants.length)return {ok:false,reason:'No merchants are permitted. Set a restricted PURCHASE_ALLOWED_MERCHANTS list.'};
  if(!p.allowedMerchants.includes(String(input.vendor).trim().toLowerCase()))return {ok:false,reason:'Merchant is not on the permitted list.'};
  if(input.amount_cents>p.maxTransactionCents)return {ok:false,reason:'Purchase exceeds the per-transaction limit.'};
  if(input.amount_cents>p.monthlyCapCents)return {ok:false,reason:'Purchase exceeds the monthly limit.'};
  return {ok:true,policy:p};
}
