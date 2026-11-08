import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp } from 'firebase/app';
import { disableNetwork, enableNetwork, getDoc, doc, getDocs, collection, terminate } from 'firebase/firestore';
import { createBackend, normalizeName, productID, validateGrocery, validateInviteToken } from './backend.js';

test('names normalize consistently for product keys and validation rejects malformed values', async () => {
  assert.equal(normalizeName('  MJÖLK  '), 'mjolk');
  assert.equal(normalizeName('Crème   Fraîche'), 'creme fraiche');
  assert.equal(await productID(' Mjölk '), await productID('MJOLK'));
  assert.deepEqual(validateGrocery({name:' Mjölk ',quantity:' 2 l ',category:'dairy'}),{name:'Mjölk',quantity:'2 l',category:'dairy'});
  assert.throws(()=>validateGrocery({name:'Mjölk',category:'fake'}));
  assert.throws(()=>validateGrocery({name:'',category:'dairy'}));
  assert.throws(()=>validateInviteToken('../token'));
});

test('two users share lists, edit without losing checkoff, remember categories, and revoke invitations', {skip: process.env.HANDLA_EMULATOR_TESTS !== 'true'}, async () => {
  const config = {projectId:'demo-handla',apiKey:'demo-api-key',appId:'1:1234567890:web:demo'};
  const stamp=crypto.randomUUID();
  const owner=createBackend(config,{appName:`owner-${stamp}`,emulators:true,inviteOrigin:'http://localhost:5173'});
  const guest=createBackend(config,{appName:`guest-${stamp}`,emulators:true,inviteOrigin:'http://localhost:5173'});
  const outsider=createBackend(config,{appName:`outsider-${stamp}`,emulators:true});
  try {
    await outsider.signUp(`outsider-${stamp}@example.test`,'TestPassword123!');
    await owner.signUp(`owner-${stamp}@example.test`,'TestPassword123!');
    await guest.signUp(`guest-${stamp}@example.test`,'TestPassword123!');
    const profileEvents = [];
    let stopProfile = () => {};
    const profileReady = new Promise((resolve, reject) => {
      stopProfile = owner.watchProfile(owner.auth.currentUser.uid, (profile, meta) => {
        profileEvents.push(meta.hasPendingWrites);
        if (profile?.workspaceID) { stopProfile(); resolve(profile); }
      }, reject);
    });
    const workspaceID=await owner.createWorkspace('Testhushåll');
    assert.equal((await profileReady).workspaceID, workspaceID);
    assert.ok(profileEvents.every(pending => pending === false), 'profile must wait for server-confirmed membership');
    const url=await owner.createInvite(workspaceID), token=url.split('/').at(-1);
    assert.equal((await guest.getInvite(token)).workspaceID, workspaceID);
    assert.equal(await guest.joinWorkspace(token), workspaceID);
    assert.equal(await guest.joinWorkspace(token), workspaceID);
    const roster=await new Promise((resolve,reject)=>{let stop=()=>{};stop=owner.watchMembers(workspaceID,values=>{if(values.length===2){stop();resolve(values)}},reject)});
    assert.deepEqual(roster.map(member=>member.displayName).sort(),[`owner-${stamp}@example.test`,`guest-${stamp}@example.test`].sort());
    const guestMember=doc(guest.db,'workspaces',workspaceID,'members',guest.auth.currentUser.uid);
    const legacyPath=`projects/demo-handla/databases/(default)/documents/workspaces/${workspaceID}/members/${guest.auth.currentUser.uid}`;
    const seeded=await fetch('http://127.0.0.1:8185/v1/projects/demo-handla/databases/(default)/documents:commit',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({writes:[{update:{name:legacyPath,fields:{}},updateMask:{fieldPaths:['displayName']}}]})});assert.equal(seeded.status,200);
    await guest.syncMemberIdentity(workspaceID);
    assert.equal((await getDoc(guestMember)).data().displayName,`guest-${stamp}@example.test`);
    const listID=await guest.addList(workspaceID,'Helg');
    await guest.renameList(workspaceID,listID,'  Helgmat  ');
    assert.equal((await getDoc(doc(owner.db,'workspaces',workspaceID,'lists',listID))).data().name,'Helgmat');
    assert.throws(()=>guest.renameList(workspaceID,listID,'   '));
    assert.throws(()=>guest.renameList(workspaceID,listID,'x'.repeat(81)));
    await assert.rejects(outsider.renameList(workspaceID,listID,'Intrång'),error=>error.code==='permission-denied');
    await disableNetwork(guest.db);
    const renamePending=guest.renameList(workspaceID,listID,'Helgens mat');
    await assert.rejects(guest.signOut(),/synkning/);
    await enableNetwork(guest.db);await renamePending;
    assert.equal((await getDoc(doc(owner.db,'workspaces',workspaceID,'lists',listID))).data().name,'Helgens mat');
    const itemID=await owner.addItem(workspaceID,listID,{name:'Mjölk',quantity:'2 l',category:'dairy'});
    await guest.toggleItem(workspaceID,listID,itemID,true);
    await owner.updateItem(workspaceID,listID,itemID,{name:'Mjölk',quantity:'3 l',category:'pantry'});
    const saved=(await getDoc(doc(guest.db,'workspaces',workspaceID,'lists',listID,'items',itemID))).data();
    assert.equal(saved.checked,true);assert.equal(saved.quantity,'3 l');assert.equal(saved.category,'pantry');
    const products=await getDocs(collection(guest.db,'workspaces',workspaceID,'products'));
    assert.equal(products.docs[0].data().category,'pantry');
    const canonicalProducts = await new Promise((resolve, reject) => {
      let stop = () => {};
      stop = guest.watchProducts(workspaceID, values => {
        if (values.length) { stop(); resolve(values); }
      }, reject);
    });
    assert.equal(canonicalProducts[0].canonical, true);
    await guest.toggleItem(workspaceID,listID,itemID,false);
    assert.equal((await getDoc(doc(owner.db,'workspaces',workspaceID,'lists',listID,'items',itemID))).data().checked,false);
    await disableNetwork(owner.db);
    const pending=owner.toggleItem(workspaceID,listID,itemID,true);
    await assert.rejects(owner.signOut(),/synkning/);
    await enableNetwork(owner.db);await pending;
    await owner.revokeInvite(workspaceID);
    await assert.rejects(guest.getInvite(token));
    await guest.deleteItem(workspaceID,listID,itemID);
    assert.equal((await getDoc(doc(owner.db,'workspaces',workspaceID,'lists',listID,'items',itemID))).exists(),false);
    await guest.signOut();await owner.signOut();
  } finally { await Promise.all([terminate(owner.db),terminate(guest.db),terminate(outsider.db)]);await Promise.all([deleteApp(owner.app),deleteApp(guest.app),deleteApp(outsider.app)]); }
});

test('bounded history pagination covers tied dates, unknown dates and restores without losing last purchase', {skip:process.env.HANDLA_EMULATOR_TESTS!=='true'},async()=>{
 const backend=createBackend({projectId:'demo-handla'},{appName:`history-${crypto.randomUUID()}`,emulators:true});
 try{
  await backend.signUp(`history-${crypto.randomUUID()}@example.test`,'TestPassword123!');
  const w=await backend.createWorkspace('History QA'),l=await backend.addList(w,'Test');
  const path=`projects/demo-handla/databases/(default)/documents/workspaces/${w}/lists/${l}/items`;
  const cutoff=new Date(Date.now()-86400000),old=new Date(cutoff.getTime()-10000).toISOString(),recent=new Date().toISOString();
  const writes=Array.from({length:48},(_,i)=>({update:{name:`${path}/seed-${String(i).padStart(3,'0')}`,fields:{name:{stringValue:`Item ${i}`},quantity:{stringValue:''},category:{stringValue:'other'},checked:{booleanValue:true},createdAt:{timestampValue:old},checkedAt:i<25?{timestampValue:old}:i<47?{nullValue:null}:{timestampValue:recent}}}}));
  const response=await fetch('http://127.0.0.1:8185/v1/projects/demo-handla/databases/(default)/documents:commit',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({writes})});assert.equal(response.status,200);
  let cursor=null,hasMore=true;const all=[];const sizes=[];
  while(hasMore){const page=await backend.listOlderItems(w,l,cutoff,{cursor});sizes.push(page.items.length);all.push(...page.items);cursor=page.cursor;hasMore=page.hasMore;assert.ok(sizes.length<5)}
  assert.deepEqual(sizes,[20,20,7]);assert.equal(new Set(all.map(x=>x.id)).size,47);
  assert.ok(all.slice(0,25).every(x=>x.checkedAt));assert.ok(all.slice(25).every(x=>x.checkedAt===null));
  const recentItems=await new Promise((resolve,reject)=>{let stop=()=>{};stop=backend.watchRecentItems(w,l,cutoff,(items,meta)=>{if(!meta.fromCache){stop();resolve(items)}},reject)});
  assert.deepEqual(recentItems.map(x=>x.id),['seed-047']);
  await backend.toggleItem(w,l,'seed-000',false);
  const restored=(await getDoc(doc(backend.db,`${path.split('/documents/')[1]}/seed-000`))).data();assert.equal(restored.checked,false);assert.equal(restored.checkedAt.toDate().toISOString(),old);
  const active=await new Promise((resolve,reject)=>{let stop=()=>{};stop=backend.watchActiveItems(w,l,(items,meta)=>{if(!meta.fromCache){stop();resolve(items)}},reject)});assert.deepEqual(active.map(x=>x.id),['seed-000']);
  await backend.toggleItem(w,l,'seed-000',true);const rechecked=(await getDoc(doc(backend.db,`${path.split('/documents/')[1]}/seed-000`))).data();assert.ok(rechecked.checkedAt.toMillis()>cutoff.getTime());assert.equal(rechecked.createdAt.toDate().toISOString(),old);
 }finally{await terminate(backend.db);await deleteApp(backend.app)}
});

test('account cleanup preserves shared data, rechecks successor and recursively purges a solo household', {skip:process.env.HANDLA_EMULATOR_TESTS!=='true'},async()=>{
 const clients=['owner','guest'].map(role=>createBackend({projectId:'demo-handla'},{appName:`delete-${role}-${crypto.randomUUID()}`,emulators:true}));const [owner,guest]=clients;
 try{
  for(const client of clients)await client.signUp(`delete-${crypto.randomUUID()}@example.test`,'TestPassword123!');
  const w=await owner.createWorkspace('Deletion QA'),l=await owner.addList(w,'Shared');await owner.addItem(w,l,{name:'Behåll',category:'dairy'});
  const soloPreview=await owner.prepareAccountDeletion();assert.equal(soloPreview.recipient,null);
  await guest.joinWorkspace((await owner.createInvite(w)).split('/').at(-1));
  await assert.rejects(owner.deleteAccountData(soloPreview),/Medlemmarna har ändrats/);
  const unlocked=(await getDoc(doc(owner.db,'workspaces',w))).data();assert.equal(unlocked.deletingBy,undefined);
  const plan=await owner.prepareAccountDeletion();assert.equal(plan.recipient.id,guest.auth.currentUser.uid);
  await owner.deleteAccountData(plan);assert.equal((await owner.prepareAccountDeletion()).workspaceID,null);
  assert.equal((await getDoc(doc(guest.db,'workspaces',w))).data().ownerID,guest.auth.currentUser.uid);
  assert.equal((await getDocs(collection(guest.db,'workspaces',w,'lists',l,'items'))).size,1);
  const prefix=`projects/demo-handla/databases/(default)/documents/workspaces/${w}/lists/${l}/items`;
  const writes=Array.from({length:205},(_,i)=>({update:{name:`${prefix}/bulk-${i}`,fields:{name:{stringValue:`Test ${i}`},quantity:{stringValue:''},checked:{booleanValue:false},createdAt:{timestampValue:new Date().toISOString()},checkedAt:{nullValue:null}}}}));
  const response=await fetch('http://127.0.0.1:8185/v1/projects/demo-handla/databases/(default)/documents:commit',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({writes})});assert.equal(response.status,200);
  await guest.deleteAccountData(await guest.prepareAccountDeletion());
  await guest.deleteAccountData({workspaceID:w}); // Auth cleanup can retry after personal Firestore data is already gone.
  const root='http://127.0.0.1:8185/v1/projects/demo-handla/databases/(default)/documents';
  const remaining=await(await fetch(`${root}/workspaces/${w}/lists/${l}/items`,{headers:{Authorization:'Bearer owner'}})).json();assert.equal(remaining.documents?.length??0,0);
  assert.equal((await fetch(`${root}/workspaces/${w}`,{headers:{Authorization:'Bearer owner'}})).status,404);
  assert.equal((await fetch(`${root}/users/${guest.auth.currentUser.uid}`,{headers:{Authorization:'Bearer owner'}})).status,404);
 }finally{await Promise.all(clients.map(c=>terminate(c.db)));await Promise.all(clients.map(c=>deleteApp(c.app)))}
});
