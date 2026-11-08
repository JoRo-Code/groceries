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
