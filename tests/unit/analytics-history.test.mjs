import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historySeries,comparePeriods} from '../../src/lib/analytics-history.ts';
const row=(start,end,value,patch={})=>({metric_key:'reach',provider:'provider',availability:'available',value,unit:'people',evidence:{coverage:'complete',mode:'organic'},range_start:start,range_end:end,captured_at:end+'T12:00:00Z',source_reference:'provider analytics',calculation_version:'direct-v1',...patch});
test('historical comparisons require equal non-overlapping periods and real evidence',()=>{
 const rows=[row('2026-09-01','2026-09-07',100),row('2026-09-08','2026-09-14',120)];
 assert.equal(comparePeriods(rows,'reach').change,20);
 assert.equal(comparePeriods([rows[0],row('2026-09-02','2026-09-08',120)],'reach'),null);
 assert.equal(comparePeriods([rows[0],row('2026-09-08','2026-09-14',120,{provider:'other'})],'reach'),null);
 assert.equal(historySeries([row('2026-09-01','2026-09-07',100,{source_reference:null})],'reach').length,0);
});
test('coverage, units and paid versus organic provenance must match',()=>{
 const previous=row('2026-09-01','2026-09-07',100);
 for(const patch of [{unit:'views'},{evidence:{coverage:'partial',mode:'organic'}},{evidence:{coverage:'complete',mode:'paid'}},{evidence:null}]) assert.equal(comparePeriods([previous,row('2026-09-08','2026-09-14',120,patch)],'reach'),null);
});
test('zero baseline never produces invented growth percentages',()=>{
 const comparison=comparePeriods([row('2026-09-01','2026-09-07',0),row('2026-09-08','2026-09-14',120)],'reach');
 assert.equal(comparison.change,null);
 assert.equal(comparison.previous.value,0);
});