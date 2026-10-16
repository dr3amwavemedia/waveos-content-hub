import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachStudioResult } from '../../src/lib/post-studio-handoff.ts';
import { createStudioTemplate, STUDIO_TEMPLATES, adaptStudioFormat } from '../../src/lib/studio-templates.ts';
import { invoiceScope } from '../../src/lib/quick-contract.ts';
import { researchRecord, researchRecordFromMetrics, researchText } from '../../src/lib/public-research-record.ts';
test('Studio return replaces only selected media and preserves the same post and unsaved fields', () => {
 const post={workspaceId:'workspace',postId:'same-post',title:'Unsaved title',caption:'Unsaved caption',platforms:['instagram','facebook'],pickedMedia:['first','selected','last'],scheduledAt:'2026-10-20T12:00',activePlatform:'facebook',platformOptions:{instagram:{contentType:'story'}},sourceMedia:'selected'};
 const result=attachStudioResult(post,'edited');
 assert.deepEqual(result,{...post,pickedMedia:['first','edited','last']});
 assert.deepEqual(post.pickedMedia,['first','selected','last']);
});
test('Approved story, square and portrait templates retain editable photos and optional text',()=>{
 for (const template of STUDIO_TEMPLATES) for(const format of ['story','square','portrait']) {
 const doc=createStudioTemplate(template,format,{background:'#101010',ink:'#ffffff',accent:'#00ffff'});
 assert.equal(doc.format,format);assert.ok(doc.elements.some(e=>e.type==='image'));assert.ok(doc.elements.some(e=>e.type==='text'));
 const edited={...doc,elements:doc.elements.filter(e=>e.type!=='text')};assert.ok(edited.elements.length<doc.elements.length);
 const resized=adaptStudioFormat(doc,'portrait');assert.equal(resized.elements.length,doc.elements.length);assert.equal(resized.elements[0].height,1350);
 }
 assert.ok(STUDIO_TEMPLATES.some(t=>t.category==='Trades'));assert.ok(STUDIO_TEMPLATES.some(t=>t.category==='Beauty & Wellness'));assert.ok(STUDIO_TEMPLATES.some(t=>t.category==='Minimal Stories'));
});
test('invoice scope carries existing line items, total, discount, deposit and due date',()=>{
 const scope=invoiceScope({number:'INV-1',line_items:[{title:'Photography',description:'Two hours',quantity:2,unitCents:10000}],description:null,amount_cents:18000,currency:'USD',due_at:'2026-10-20',discount_type:'percentage',discount_value:1000,checkout_payment_cents:9000,checkout_payment_type:'deposit',payment_plan:'deposit'});
 assert.ok(scope.includes('2 × $100.00 = $200.00'));assert.ok(scope.includes('10%'));assert.ok(scope.includes('Total: $180.00'));assert.ok(scope.includes('$90.00'));assert.ok(scope.includes('2026-10-20'));
});
test('qualitative public reports preserve citations without requiring names or numeric metrics',()=>{
 const result={inputUrl:'https://example.com/',researchedAt:'2026-10-16',methodology:'Public sources',report:{company:null,industry:null,market:null,website:null,channels:[],sections:[{title:'Services',findings:[{text:'Visible offer',sources:['https://example.com/service']}]}],ideas:[],limitations:['Coverage limited']}};
 const saved=researchRecordFromMetrics(JSON.parse(JSON.stringify([researchRecord(result)])));
 assert.deepEqual(saved.report,result.report);assert.ok(researchText(saved).includes('https://example.com/service'));assert.ok(researchText(saved).includes('Not found'));assert.equal(researchRecordFromMetrics([]),null);
});
