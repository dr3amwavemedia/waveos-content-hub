import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachStudioResult } from '../../src/lib/post-studio-handoff.ts';
import { createStudioTemplate, STUDIO_TEMPLATES, adaptStudioFormat } from '../../src/lib/studio-templates.ts';
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
