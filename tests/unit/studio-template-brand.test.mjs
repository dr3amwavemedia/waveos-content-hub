import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStudioBrand, STUDIO_FORMATS } from '../../src/lib/studio-template-model.ts';
test('Apply My Brand changes only assigned roles and uses available saved fonts',()=>{
 const document={version:1,format:'story',background:'#141918',elements:[{id:'photo',type:'image',sourceType:'media',templateUrl:'photo.jpg',assetId:null,x:.5,y:.5,width:1080,height:1920},{id:'headline',type:'text',color:'#ffffff',fontFamily:'Georgia',fontRole:'heading',text:'Hello',x:.1,y:.4},{id:'accent',type:'shape',brandRole:'primary',color:'#35d5e6',x:.1,y:.8},{id:'logo',type:'image',brandRole:'logo',sourceType:'media',templateUrl:'placeholder.svg',assetId:null}]};
 const next=applyStudioBrand(document,{primary:'#118855',logoUrl:'logo.png',headingFont:'Manrope'});
 assert.equal(next.elements[1].fontFamily,'Manrope');assert.equal(next.elements[1].color,'#ffffff');assert.equal(next.elements[2].color,'#118855');assert.equal(next.elements[3].sourceType,'workspace-logo');assert.equal(next.elements[3].templateUrl,undefined);assert.deepEqual(next.elements[0],document.elements[0]);assert.equal(document.elements[1].fontFamily,'Georgia');
});
test('Missing brand fonts preserve editable template typography',()=>{const d={version:1,format:'square',background:'#fff',elements:[{type:'text',fontRole:'heading',fontFamily:'Cormorant Garamond'}]};assert.equal(applyStudioBrand(d,{primary:'#118855'}).elements[0].fontFamily,'Cormorant Garamond');});
test('Approved 9:16, 1:1 and 4:5 canvas formats use concrete dimensions',()=>{assert.deepEqual([STUDIO_FORMATS.story.width,STUDIO_FORMATS.story.height],[1080,1920]);assert.deepEqual([STUDIO_FORMATS.square.width,STUDIO_FORMATS.square.height],[1080,1080]);assert.deepEqual([STUDIO_FORMATS.portrait.width,STUDIO_FORMATS.portrait.height],[1080,1350]);});
