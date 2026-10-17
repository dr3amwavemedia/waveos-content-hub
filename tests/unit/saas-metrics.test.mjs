import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const module = {};
new Function('exports',ts.transpileModule(readFileSync('src/lib/saas-metrics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module);
const workspace = (id,source='os_data')=>({id,name:id,data_source:source,is_demo:false,is_archived:false,status:'active',created_at:'2026-10-01T00:00:00Z'});
const subscription = (id,extra={})=>({workspace_id:id,stripe_subscription_id:'sub_'+id,status:'active',internal_test_access:false,plan:'standard',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',payment_failure_count:0,cancel_at_period_end:false,service_locked_at:null,...extra});
test('only top-level owner is authorized, not workspace admins, staff or clients',()=>{
 assert.equal(module.saasOwnerAllowed(['dream_wave_owner']),true);
 for (const role of ['admin','owner','dream_wave_team','client_owner','client_approver','client_viewer','editor','approver','viewer']) assert.equal(module.saasOwnerAllowed([role]),false,role);
});
test('SaaS metrics exclude DWM billing, tests and unfinished checkout',()=>{
 const m=module.calculateSaaSMetrics([workspace('os'),workspace('dwm','client_data'),workspace('test'),workspace('pending')],[subscription('os'),subscription('dwm'),subscription('test',{internal_test_access:true}),subscription('pending',{stripe_subscription_id:null,status:'checkout_pending'})],[{workspace_id:'os',stripe_subscription_id:'sub_os',status:'paid',currency:'usd',amount_paid_cents:3999,created_at:'2026-10-01T00:00:00Z'},{workspace_id:'dwm',stripe_subscription_id:'sub_dwm',status:'paid',currency:'usd',amount_paid_cents:500000,created_at:'2026-10-01T00:00:00Z'}],new Date('2026-10-17T00:00:00Z'));
 assert.equal(m.activeSubscribers,1); assert.equal(m.newRecords,1); assert.equal(m.revenue.USD,3999); assert.equal(m.planMix[0].count,1);
});
test('trials and past-due are not counted as paid active subscriptions',()=>{
 const m=module.calculateSaaSMetrics([workspace('trial'),workspace('late')],[subscription('trial',{status:'trialing'}),subscription('late',{status:'past_due',payment_failure_count:1,cancel_at_period_end:true})],[],new Date('2026-10-17T00:00:00Z'));
 assert.equal(m.activeSubscribers,0); assert.equal(m.trials,1); assert.equal(m.pastDue,1); assert.equal(m.scheduledCancellations,1);
});