import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseAnalyticsPayload,combineAnalyticsMetric} from '../../src/lib/analytics-transparency.ts';
const range={requestedRangeStart:'2026-09-17',requestedRangeEnd:'2026-10-17'};
test('Zernio overview cannot hide actual nested post analytics or duplicate platform rollups',()=>{
 const analytics={views:118,reach:64,likes:9,comments:0};
 const source=parseAnalyticsPayload({...range,key:'external',payload:{overview:{totalPosts:1},posts:[{analytics,platforms:[{analytics}]}],accounts:[{_id:'fb',followersCount:272},{_id:'ig',followersCount:287}]}});
 assert.equal(source.metrics.views.value,118);assert.equal(source.metrics.reach.value,64);assert.equal(source.metrics.likes.value,9);assert.equal(source.metrics.comments.availability,'true_zero');assert.equal(source.metrics.followers.value,559);assert.equal(source.recordCount,1);
});
test('account followers contribute once across organic and external reads',()=>{
 const payload={posts:[],accounts:[{_id:'fb',followersCount:272}]};
 const sources=['organic','external'].map(key=>parseAnalyticsPayload({...range,key,payload}));assert.equal(combineAnalyticsMetric(sources,'followers').value,272);
});
test('paid metrics use ads metrics without inventing empty account totals',()=>{
 const source=parseAnalyticsPayload({...range,key:'paid',payload:{ads:[{metrics:{impressions:20,clicks:3}}]}});assert.equal(source.metrics.impressions.value,20);assert.equal(source.metrics.clicks.value,3);
 const empty=parseAnalyticsPayload({...range,key:'paid',payload:{ads:[]}});assert.equal(empty.metrics.views.value,null);
});