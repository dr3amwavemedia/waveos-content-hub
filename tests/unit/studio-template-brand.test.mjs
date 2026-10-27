import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStudioBrand, logoContainSize, studioDocumentSize, STUDIO_FORMATS } from '../../src/lib/studio-template-model.ts';
test('Apply My Brand changes only assigned roles and uses available saved fonts',()=>{
 const document={version:1,format:'story',background:'#141918',elements:[{id:'photo',type:'image',sourceType:'media',templateUrl:'photo.jpg',assetId:null,x:.5,y:.5,width:1080,height:1920},{id:'headline',type:'text',color:'#ffffff',fontFamily:'Georgia',fontRole:'heading',text:'Hello',x:.1,y:.4},{id:'accent',type:'shape',brandRole:'primary',color:'#35d5e6',x:.1,y:.8},{id:'logo',type:'image',brandRole:'logo',sourceType:'media',templateUrl:'placeholder.svg',assetId:null}]};
 const next=applyStudioBrand(document,{primary:'#118855',logoUrl:'logo.png',headingFont:'Manrope'});
 assert.equal(next.elements[1].fontFamily,'Manrope');assert.equal(next.elements[1].color,'#ffffff');assert.equal(next.elements[2].color,'#118855');assert.equal(next.elements[3].sourceType,'workspace-logo');assert.equal(next.elements[3].templateUrl,undefined);assert.deepEqual(next.elements[0],document.elements[0]);assert.equal(document.elements[1].fontFamily,'Georgia');
});
test('Missing brand fonts preserve editable template typography',()=>{const d={version:1,format:'square',background:'#fff',elements:[{type:'text',fontRole:'heading',fontFamily:'Cormorant Garamond'}]};assert.equal(applyStudioBrand(d,{primary:'#118855'}).elements[0].fontFamily,'Cormorant Garamond');});
test('Light Apply preserves copy, logo and geometry while restyling assigned colors and fonts',()=>{
 const d={version:1,format:'square',background:'#fff',elements:[{id:'text',type:'text',text:'Keep my words',contentRole:'business-name',fontRole:'heading',fontFamily:'Georgia',x:.2,y:.4,rotation:12},{id:'accent',type:'shape',brandRole:'primary',color:'#aaa',x:.3,y:.5,width:200,height:20},{id:'logo',type:'image',brandRole:'logo',templateUrl:'my-logo.png',x:.8,y:.1,width:140,height:80}]};
 const n=applyStudioBrand(d,{primary:'#118855',businessName:'Replacement',headingFont:'Manrope',logoUrl:'new.png'},'light');
 assert.equal(n.elements[0].text,'Keep my words');assert.equal(n.elements[0].fontFamily,'Manrope');assert.equal(n.elements[1].color,'#118855');assert.deepEqual(n.elements[2],d.elements[2]);assert.deepEqual(n.elements.map(e=>[e.x,e.y,e.width,e.height,e.rotation]),d.elements.map(e=>[e.x,e.y,e.width,e.height,e.rotation]));
});
test('Colors only never replaces fonts, words or logos',()=>{const d={elements:[{type:'text',text:'Original',fontFamily:'Georgia',fontRole:'heading',contentRole:'business-name',brandRole:'primary',color:'#aaa'}]};const n=applyStudioBrand(d,{primary:'#118855',headingFont:'Manrope',businessName:'Changed'},'colors');assert.deepEqual(n.elements[0],{...d.elements[0],color:'#118855'});});
test('Logo rendering contains a wide or tall logo without distorting its aspect ratio',()=>{assert.deepEqual(logoContainSize(140,80,400,100),{width:140,height:35});assert.deepEqual(logoContainSize(140,80,100,400),{width:20,height:80});});
test('Approved 9:16, 1:1 and 4:5 canvas formats use concrete dimensions',()=>{assert.deepEqual([STUDIO_FORMATS.story.width,STUDIO_FORMATS.story.height],[1080,1920]);assert.deepEqual([STUDIO_FORMATS.square.width,STUDIO_FORMATS.square.height],[1080,1080]);assert.deepEqual([STUDIO_FORMATS.portrait.width,STUDIO_FORMATS.portrait.height],[1080,1350]);});

test('Creative Studio custom photo canvas overrides the preset while preserving the preset format',()=>{
 const d={version:1,format:'square',customWidth:1620,customHeight:2160,background:'#000',elements:[]};
 assert.deepEqual(studioDocumentSize(d),{label:'Original',width:1620,height:2160});
 assert.deepEqual(studioDocumentSize({...d,customWidth:undefined,customHeight:undefined}),{...STUDIO_FORMATS.square});
});
