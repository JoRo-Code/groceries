import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root='http://127.0.0.1:8185/v1/projects/demo-handla/databases/(default)/documents';
const headers={Authorization:'Bearer owner','Content-Type':'application/json'};
test('migration paginates legacy items, preserves fields and uses actual creation metadata',async()=>{
 const prefix=`workspaces/migrate-${crypto.randomUUID()}/lists/test/items`;
 const writes=Array.from({length:203},(_,i)=>({update:{name:`projects/demo-handla/databases/(default)/documents/${prefix}/${i}`,fields:{name:{stringValue:`Legacy ${i}`},quantity:{stringValue:'2'},checked:{booleanValue:true},...(i===0?{checkedAt:{timestampValue:'2020-01-02T00:00:00Z'}}:{})}}}));
 const seeded=await fetch(`${root}:commit`,{method:'POST',headers,body:JSON.stringify({writes})});assert.equal(seeded.status,200);
 const before=await(await fetch(`${root}/${prefix}/1`,{headers})).json();
 const run=(...args)=>JSON.parse(execFileSync(process.execPath,['scripts/migrate-item-dates.cjs','--emulator',...args],{encoding:'utf8'}));
 const dry=run();assert.ok(dry.missingCreatedAt>=203);assert.ok(dry.missingCheckedAt>=202);assert.equal(dry.updated,0);
 const applied=run('--apply');assert.equal(applied.updated,applied.planned);assert.equal(applied.conflicts,0);
 const after=await(await fetch(`${root}/${prefix}/1`,{headers})).json();
 assert.equal(after.fields.createdAt.timestampValue,before.createTime);assert.ok('nullValue'in after.fields.checkedAt);assert.deepEqual(after.fields.name,before.fields.name);assert.deepEqual(after.fields.quantity,before.fields.quantity);
 const preserved=await(await fetch(`${root}/${prefix}/0`,{headers})).json();assert.equal(preserved.fields.checkedAt.timestampValue,'2020-01-02T00:00:00Z');assert.equal(run().planned,0);
 await fetch(`${root}:commit`,{method:'POST',headers,body:JSON.stringify({writes:writes.map(w=>({delete:w.update.name}))})});
});
