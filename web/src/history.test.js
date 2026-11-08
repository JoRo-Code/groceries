import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY_MS,timestampMillis,formatItemDate,combineHistory,demoOlderPage} from './history.js';
const now=1800000000000,cutoff=now-DAY_MS;
test('dates support Firestore Timestamp, estimated Date and missing legacy values honestly',()=>{
 assert.equal(timestampMillis({toMillis:()=>now}),now);assert.equal(timestampMillis(new Date(now)),now);
 assert.equal(timestampMillis({seconds:now/1000,nanoseconds:0}),now);
 assert.equal(formatItemDate(null),'Datum saknas');assert.equal(formatItemDate(undefined),'Datum saknas');
 assert.notEqual(formatItemDate(new Date(now)),'Datum saknas');
});
test('rolling day separates recent from old/unknown and deduplicates more current live rows',()=>{
 const older=[{id:'old',checked:true,checkedAt:new Date(cutoff-1)},{id:'restore',checked:true,checkedAt:new Date(cutoff-2)},{id:'unknown',checked:true,checkedAt:null}];
 const active=[{id:'restore',checked:false,checkedAt:new Date(cutoff-2)}];
 const recent=[{id:'recent',checked:true,checkedAt:new Date(cutoff)}];
 const result=combineHistory(active,recent,older,{},cutoff);
 assert.deepEqual(result.active.map(item=>item.id),['restore']);assert.deepEqual(result.recent.map(item=>item.id),['recent']);assert.deepEqual(result.older.map(item=>item.id),['old','unknown']);
 const pending=combineHistory([],[],[],{new:{id:'new',checked:true,checkedAt:null,_pending:true}},cutoff);
 assert.equal(pending.recent[0].id,'new');assert.equal(pending.older.length,0);
});
test('older pages cap20, sort dated before unknown, cover45 without duplicates',()=>{
 const rows=[...Array.from({length:43},(_,i)=>({id:`d${i}`,checked:true,checkedAt:new Date(cutoff-1000*(i+1))})),{id:'u1',checked:true,checkedAt:null},{id:'u2',checked:true}];
 const a=demoOlderPage(rows,cutoff),b=demoOlderPage(rows,cutoff,a.cursor),c=demoOlderPage(rows,cutoff,b.cursor);
 assert.equal(a.items.length,20);assert.equal(b.items.length,20);assert.equal(c.items.length,5);
 assert.equal(a.hasMore,true);assert.equal(c.hasMore,false);assert.deepEqual(c.items.slice(-2).map(item=>item.id),['u1','u2']);
 assert.equal(new Set([...a.items,...b.items,...c.items].map(item=>item.id)).size,45);
});
