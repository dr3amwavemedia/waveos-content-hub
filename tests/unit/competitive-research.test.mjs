import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicResearchUrl, groundedReport } from '../../src/lib/competitive-research.ts';
test('one-input research accepts public HTTPS links only', () => {
  assert.equal(publicResearchUrl('example.com'), 'https://example.com/');
  for (const value of ['https://127.0.0.1','https://localhost','https://user:pass@example.com','https://[::1]','https://example.com:8443']) assert.throws(()=>publicResearchUrl(value));
});
test('unsupported competitor findings and content ideas are omitted', () => {
  const report = groundedReport({company:null,industry:null,market:null,website:null,channels:[],sections:[{title:'Strengths',findings:[{text:'No evidence',sources:[]},{text:'Public offer',sources:['https://example.com']}]}],ideas:[{text:'Unsupported idea',sources:[]}],limitations:[]});
  assert.deepEqual(report.sections[0].findings,[{text:'Public offer',sources:['https://example.com/']}]);
  assert.deepEqual(report.ideas,[]);
});
test('a citation must match a consulted provider source',()=>{
 const report={company:null,industry:null,market:null,website:null,channels:[],sections:[{title:'Offer',findings:[{text:'Unconsulted',sources:['https://fake.example']},{text:'Consulted',sources:['https://example.com']}]}],ideas:[],limitations:[]};
 assert.equal(groundedReport(report,['https://example.com']).sections[0].findings.length,1);
 assert.equal(groundedReport(report,[]).sections[0].findings.length,0);
 assert.throws(()=>publicResearchUrl('http://example.com'));
});
