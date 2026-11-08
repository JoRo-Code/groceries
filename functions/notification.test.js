import {test} from 'node:test';import assert from 'node:assert/strict';import {classify,deliver,payload} from './notification.js';
const time={seconds:100,nanoseconds:123};
const event={eventID:'event-1',workspaceID:'home',listID:'week',before:null,after:{checked:false,lastActorUID:'owner',lastActionAt:time},updateTime:time};
function fixture(){const sent=[],removed=[],claims=new Map();let owner='guest',eligible=true;
 return {sent,removed,claims,setOwner:x=>owner=x,setEligible:x=>eligible=x,io:{members:async()=>['owner','guest'],devices:async uid=>[{token:'token',path:`users/${uid}/devices/install`}],currentOwner:async(_,uid)=>uid===owner,eligible:async()=>eligible,claim:async key=>claims.get(key)==='sent'?'sent':(claims.set(key,'pending'),'claimed'),complete:async key=>claims.set(key,'sent'),release:async key=>claims.delete(key),send:async msg=>sent.push(msg),removeExpired:async d=>removed.push(d)}};
}
test('only new adds and false-to-true checks with fresh actor marker trigger',()=>{
 assert.equal(classify(null,event.after,time).type,'itemAdded');assert.equal(classify({checked:false},{...event.after,checked:true},time).type,'itemChecked');
 for(const [before,after,t] of [[event.after,{...event.after,quantity:'2'},time],[{checked:true},event.after,time],[null,event.after,{seconds:101,nanoseconds:123}],[null,{checked:false},time],[event.after,null,time]])assert.equal(classify(before,after,t),null);
});
test('generic payload never contains item/person/list names and binds recipient',()=>{
 const value=payload({...event,type:'itemAdded',recipientUID:'guest'},'token');assert.deepEqual(Object.keys(value.data).sort(),['eventID','listID','recipientUID','type','workspaceID']);assert.equal(value.notification.body,'En vara har lagts till.');assert.equal(value.data.recipientUID,'guest');
});
test('actor excluded; replay deduplicated; current recipient checked',async()=>{
 const f=fixture();assert.equal((await deliver(event,f.io)).sent,1);assert.equal((await deliver(event,f.io)).sent,0);assert.equal(f.sent.length,1);assert.equal(f.sent[0].data.recipientUID,'guest');
});
test('token moved to another account and departed members receive nothing',async()=>{
 const f=fixture();f.setOwner('another-account');assert.equal((await deliver(event,f.io)).sent,0);f.setOwner('guest');f.setEligible(false);assert.equal((await deliver(event,f.io)).sent,0);
 f.setEligible(true);f.io.members=async()=>['guest'];assert.equal((await deliver(event,f.io)).sent,0);
});
test('membership/token rechecked after lease and expired tokens cleaned without retry',async()=>{
 const f=fixture();f.io.claim=async()=>{f.setEligible(false);return 'claimed'};assert.equal((await deliver(event,f.io)).sent,0);
 const g=fixture();g.io.send=async()=>{throw {code:'messaging/registration-token-not-registered'}};assert.equal((await deliver(event,g.io)).sent,0);assert.equal(g.removed.length,1);
});
test('transient failures release lease for retry; active lease retries later',async()=>{
 const f=fixture();f.io.send=async()=>{throw Error('temporary')};await assert.rejects(deliver(event,f.io),/temporary/);assert.equal(f.claims.size,0);
 f.io.claim=async()=> 'busy';await assert.rejects(deliver(event,f.io),/lease/);
});

test('stale token on earlier recipient does not suppress its current owner in same household',async()=>{
 const f=fixture();f.io.members=async()=>['owner','old-account','guest'];
 const result=await deliver(event,f.io);assert.equal(result.sent,1);assert.equal(f.sent[0].data.recipientUID,'guest');
});
