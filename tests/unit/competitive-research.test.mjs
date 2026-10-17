import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicResearchUrl, groundedReport, normalizeResearchSource, validatedResearchReport, RESEARCH_FAILURE_MESSAGE } from '../../src/lib/competitive-research.ts';
test('one-input research accepts public HTTPS links only', () => {
  assert.equal(publicResearchUrl('example.com'), 'https://example.com/');
  for (const value of ['https://127.0.0.1','https://localhost','https://user:pass@example.com','https://[::1]','https://example.com:8443']) assert.throws(()=>publicResearchUrl(value));
});
test('citation sanitation retains HTTPS, HTTP, clear domains and public social profiles',()=>{
 for(const [input,expected] of [['https://example.com/a','https://example.com/a'],['http://example.com/a','http://example.com/a'],['example.com/path','https://example.com/path'],['https://www.instagram.com/example/','https://www.instagram.com/example/']]) assert.equal(normalizeResearchSource(input),expected);
});
test('labels, malformed, relative and nonpublic sources are rejected without fabrication',()=>{
 for(const input of ['Official website','not a url','/about','https://','ftp://example.com','https://127.0.0.1','https://[::1]','https://user:pass@example.com','example.com bad','https://example.com\\evil']) assert.equal(normalizeResearchSource(input),null);
});
const mixedReport=()=>({company:'Public business',industry:null,market:null,website:'example.com',channels:['instagram.com/example','bad label'],sections:[{title:'Overview',findings:[{text:'Observed offer',sources:['https://example.com/a','invalid source','http://example.com/b']},{text:'Unsupported',sources:['bad']}]}],ideas:[],limitations:[]});
test('one invalid citation cannot invalidate two consulted citations or the report',()=>{
 const {report,sourcesFiltered}=validatedResearchReport(mixedReport(),['https://example.com','https://example.com/a','http://example.com/b','https://instagram.com/example']);
 assert.equal(sourcesFiltered,true);assert.deepEqual(report.sections[0].findings,[{text:'Observed offer',sources:['https://example.com/a','http://example.com/b']}]);assert.equal(report.website,'https://example.com/');assert.deepEqual(report.channels,['https://instagram.com/example']);
});
test('no supported public evidence fails with a safe message',()=>{
 assert.throws(()=>validatedResearchReport(mixedReport(),[]),{message:RESEARCH_FAILURE_MESSAGE});
});
test('normalization cannot turn an unconsulted domain into supporting evidence',()=>{
 const raw=mixedReport();raw.sections[0].findings[0].sources=['fabricated.com'];assert.throws(()=>validatedResearchReport(raw,['https://example.com']),{message:RESEARCH_FAILURE_MESSAGE});
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
