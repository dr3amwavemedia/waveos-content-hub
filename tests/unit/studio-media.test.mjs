import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replaceStudioMedia,studioMediaSlots,supportedBrandFont} from '../../src/lib/studio-media.ts';
import {applyStudioBrand} from '../../src/lib/studio-template-model.ts';
test('background replacement preserves crop, frame, effects and all overlapping layers',()=>{
 const background={id:'photo',type:'image',mediaRole:'background',sourceType:'media',assetId:null,templateUrl:'sample.jpg',x:.5,y:.5,width:1080,height:1920,crop:{x:.1,y:.2,width:.7,height:.6},brightness:110,rotation:0,opacity:.9};
 const text={id:'text',type:'text',text:'Keep me',x:.1,y:.3};const doc={format:'story',elements:[background,text]};
 const next=replaceStudioMedia(doc,'photo',{assetId:'new-photo'});
 assert.deepEqual(next.elements[0],{...background,assetId:'new-photo',templateUrl:undefined});assert.equal(next.elements[1],text);assert.equal(doc.elements[0].templateUrl,'sample.jpg');assert.equal(studioMediaSlots(doc)[0].role,'background');
});
test('workspace copy populates only designated template fields',()=>{
 const doc={elements:[{type:'text',text:'YOUR BRAND',contentRole:'business-name'},{type:'text',text:'Sample CTA',contentRole:'cta'},{type:'text',text:'Editable headline'}]};
 const next=applyStudioBrand(doc,{primary:'#123456',businessName:'Dream Wave Media',cta:'Book a consultation'});
 assert.equal(next.elements[0].text,'Dream Wave Media');assert.equal(next.elements[1].text,'Book a consultation');assert.equal(next.elements[2].text,'Editable headline');
});
test('unsupported saved fonts are never claimed as applied',()=>{assert.equal(supportedBrandFont('Missing Custom Font'),undefined);assert.equal(supportedBrandFont('Caveat'),'Caveat');});