import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, writeBatch, Timestamp, serverTimestamp, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
let env;
const token = 'a'.repeat(72);
const db = uid => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({projectId:'demo-handla',firestore:{host:'127.0.0.1',port:8185,rules:await readFile(process.env.HANDLA_RULES_FILE||'firestore.rules','utf8')}}); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
async function create(uid='owner', w='home') {
  const d = db(uid), b = writeBatch(d);
  b.set(doc(d,`workspaces/${w}`),{name:'Hemma',ownerID:uid});
  b.set(doc(d,`workspaces/${w}/members/${uid}`),{role:'owner'});
  b.set(doc(d,`users/${uid}`),{workspaceID:w});
  b.set(doc(d,`workspaces/${w}/lists/week`),{name:'Veckan'});
  await b.commit();
}
async function invite(t=token) {
 const d=db('owner'),b=writeBatch(d);
 b.set(doc(d,`invites/${t}`),{workspaceID:'home',name:'Hemma',expiresAt:Timestamp.fromMillis(Date.now()+3600000)});
 b.update(doc(d,'workspaces/home'),{inviteToken:t});
 await b.commit();
}
function join(uid='guest', t=token, role='member', w='home') {
 const d=db(uid),b=writeBatch(d);
 b.set(doc(d,`workspaces/${w}/members/${uid}`),{role,inviteToken:t});
 b.set(doc(d,`users/${uid}`),{workspaceID:w});
 return b.commit();
}
test('owner creates a workspace atomically and can read it',async()=>{await assertSucceeds(create()); await assertSucceeds(getDoc(doc(db('owner'),'workspaces/home')));});
test('outsiders cannot read lists, products or members',async()=>{
 await create();
 for(const path of ['workspaces/home','workspaces/home/lists/week','workspaces/home/products/milk','workspaces/home/members/owner']) await assertFails(getDoc(doc(db('outsider'),path)));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'workspaces/home')));
});
test('invited members can join and collaborate; invite collection cannot be enumerated',async()=>{
 await create(); await invite();
 await assertSucceeds(getDoc(doc(db('guest'),`invites/${token}`)));
 await assertFails(getDocs(collection(db('guest'),'invites')));
 await assertSucceeds(join());
 await assertSucceeds(setDoc(doc(db('guest'),'workspaces/home/lists/week/items/milk'),{name:'Mjölk',quantity:'2 l',checked:false,createdAt:serverTimestamp(),checkedAt:null}));
 await assertSucceeds(updateDoc(doc(db('owner'),'workspaces/home/lists/week/items/milk'),{checked:true,checkedAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(db('outsider'),'workspaces/home/lists/week/items/milk'),{checked:false,createdAt:serverTimestamp(),checkedAt:null}));
});
test('forged and expired invitations cannot grant membership',async()=>{
 await create(); await assertFails(join()); await invite();
 await env.withSecurityRulesDisabled(async c=>{await updateDoc(doc(c.firestore(),`invites/${token}`),{expiresAt:Timestamp.fromMillis(Date.now()-1000)});});
 await assertFails(join());
});
test('rotated links stop working and new links work',async()=>{await create();await invite();const next='b'.repeat(72);await invite(next);await assertFails(join());await assertSucceeds(join('guest',next));});
test('cannot self-promote, forge a profile or join a second workspace',async()=>{
 await create();await invite();await assertFails(join('guest',token,'owner'));
 await assertFails(setDoc(doc(db('guest'),'users/guest'),{workspaceID:'home'}));
 await create('guest','elsewhere'); await assertFails(join());
});
test('members cannot issue invitations or change workspace ownership',async()=>{
 await create();await invite();await join();
 await assertFails(updateDoc(doc(db('guest'),'workspaces/home'),{inviteToken:'b'.repeat(72)}));
 await assertFails(updateDoc(doc(db('owner'),'workspaces/home'),{ownerID:'guest'}));
});
test('cannot create orphan workspace membership or a second workspace',async()=>{
 await create();await assertFails(create('owner','second'));
 await assertFails(setDoc(doc(db('guest'),'workspaces/home/members/guest'),{role:'owner'}));
});

test('revocation blocks new joins without removing current members', async () => {
  await create(); await invite(); await join();
  const d = db('owner'), batch = writeBatch(d);
  batch.delete(doc(d, `invites/${token}`));
  batch.update(doc(d, 'workspaces/home'), { inviteToken: deleteField() });
  await assertSucceeds(batch.commit());
  await assertFails(join('later'));
  await assertFails(getDoc(doc(db('later'), `invites/${token}`)));
  await assertSucceeds(getDoc(doc(db('guest'), 'workspaces/home')));
});

test('a valid invitation cannot be used for a different workspace', async () => {
  await create(); await create('otherOwner', 'otherHome'); await invite();
  await assertFails(join('guest', token, 'member', 'otherHome'));
  await assertSucceeds(join());
  await assertFails(getDoc(doc(db('guest'), 'workspaces/otherHome')));
  await assertFails(setDoc(doc(db('guest'), 'workspaces/otherHome/lists/week/items/milk'), { name: 'Mjölk', quantity: '', checked: false,createdAt:serverTimestamp(),checkedAt:null }));
});

test('members can create lists and remember products but cannot write malformed values', async () => {
  await create(); await invite(); await join();
  const d = db('guest');
  await assertSucceeds(setDoc(doc(d, 'workspaces/home/lists/party'), { name: 'Fest' }));
  await assertSucceeds(setDoc(doc(d, 'workspaces/home/products/milk'), { name: 'Mjölk' }));
  await assertFails(setDoc(doc(d, 'workspaces/home/products/bad'), { name: 'Mjölk', ownerID: 'guest' }));
  for (const data of [
    { name: '', quantity: '', checked: false,createdAt:serverTimestamp(),checkedAt:null },
    { name: 'x'.repeat(121), quantity: '', checked: false,createdAt:serverTimestamp(),checkedAt:null },
    { name: 'Mjölk', quantity: 'x'.repeat(81), checked: false,createdAt:serverTimestamp(),checkedAt:null },
    { name: 'Mjölk', quantity: '', checked: 'false' },
    { name: 'Mjölk', quantity: '', checked: false, extra: true },
  ]) await assertFails(setDoc(doc(d, 'workspaces/home/lists/week/items/invalid'), data));
  await assertFails(setDoc(doc(d, 'workspaces/home/lists/missing/items/item'), { name: 'Mjölk', quantity: '', checked: false,createdAt:serverTimestamp(),checkedAt:null }));
});

test('invitation issuance requires owner, bounded expiry and matching workspace metadata', async () => {
  await create();
  const issue = (expiry, name = 'Hemma') => {
    const d = db('owner'), b = writeBatch(d);
    b.set(doc(d, `invites/${token}`), { workspaceID: 'home', name, expiresAt: expiry });
    b.update(doc(d, 'workspaces/home'), { inviteToken: token });
    return b.commit();
  };
  await assertFails(issue(Timestamp.fromMillis(Date.now() - 1000)));
  await assertFails(issue(Timestamp.fromMillis(Date.now() + 8 * 86400000)));
  await assertFails(issue('tomorrow'));
  await assertFails(issue(Timestamp.fromMillis(Date.now() + 3600000), 'Annat hushåll'));
  await assertSucceeds(issue(Timestamp.fromMillis(Date.now() + 3600000)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `invites/${token}`)));
});

test('stale invitations cannot be read after token rotation', async () => {
  await create(); await invite(); await invite('b'.repeat(72));
  await assertFails(getDoc(doc(db('guest'), `invites/${token}`)));
});

test('user profile and membership cannot be reassigned or deleted by clients', async () => {
  await create(); await invite(); await join();
  const d = db('guest');
  await assertFails(updateDoc(doc(d, 'users/guest'), { workspaceID: 'otherHome' }));
  await assertFails(deleteDoc(doc(d, 'users/guest')));
  await assertFails(updateDoc(doc(d, 'workspaces/home/members/guest'), { role: 'owner' }));
  await assertFails(deleteDoc(doc(d, 'workspaces/home/members/guest')));
  await assertFails(getDoc(doc(db('owner'), 'users/guest')));
});

test('workspace and membership cannot be created without matching profile in the batch', async () => {
  const d = db('newOwner'), b = writeBatch(d);
  b.set(doc(d, 'workspaces/orphan'), { name: 'Orphan', ownerID: 'newOwner' });
  b.set(doc(d, 'workspaces/orphan/members/newOwner'), { role: 'owner' });
  await assertFails(b.commit());
});

test('all stable categories can be stored on groceries and remembered products', async () => {
  await create(); await invite(); await join();
  const d = db('guest');
  const categories = ['produce', 'dairy', 'meat', 'fish', 'bakery', 'pantry', 'frozen', 'drinks', 'snacks', 'household', 'hygiene', 'other'];
  for (const category of categories) {
    const b = writeBatch(d);
    b.set(doc(d, `workspaces/home/lists/week/items/${category}`), { name: 'Vara', quantity: '1', checked: false, createdAt:serverTimestamp(),checkedAt:null, category });
    b.set(doc(d, `workspaces/home/products/${category}`), { name: 'Vara', category });
    await assertSucceeds(b.commit());
  }
});

test('category edits preserve checked status and allow legacy groceries to be checked off', async () => {
  await create();
  const d = db('owner');
  const item = doc(d, 'workspaces/home/lists/week/items/milk');
  const product = doc(d, 'workspaces/home/products/milk');
  await setDoc(item, { name: 'Mjölk', quantity: '2 l', checked: false,createdAt:serverTimestamp(),checkedAt:null });
  await setDoc(product, { name: 'Mjölk' });
  await assertSucceeds(updateDoc(item, { checked: true,checkedAt:serverTimestamp() }));
  await assertSucceeds(updateDoc(product, { name: 'Havremjölk' }));
  await assertSucceeds(updateDoc(item, { name: 'Havremjölk', quantity: '1 l', category: 'dairy' }));
  await assertSucceeds(updateDoc(product, { category: 'dairy' }));
  const stored = (await getDoc(item)).data();
  assert.equal(stored.checked, true);
  assert.equal(stored.category, 'dairy');
  await assertSucceeds(updateDoc(item, { category: 'pantry' }));
  await assertSucceeds(updateDoc(product, { category: 'pantry' }));
  await assertSucceeds(updateDoc(item, { category: deleteField(), checked: false }));
  await assertSucceeds(updateDoc(product, { category: deleteField() }));
});

test('unknown, malformed and null categories are denied on create and update', async () => {
  await create();
  const d = db('owner');
  const item = doc(d, 'workspaces/home/lists/week/items/existing');
  const product = doc(d, 'workspaces/home/products/existing');
  await setDoc(item, { name: 'Mjölk', quantity: '', checked: false, createdAt:serverTimestamp(),checkedAt:null, category: 'dairy' });
  await setDoc(product, { name: 'Mjölk', category: 'dairy' });
  for (const category of ['Dairy', 'mejeri', '', 'unknown', null, 7, ['dairy'], { id: 'dairy' }]) {
    await assertFails(setDoc(doc(d, 'workspaces/home/lists/week/items/invalid'), { name: 'Mjölk', quantity: '', checked: false, createdAt:serverTimestamp(),checkedAt:null, category }));
    await assertFails(setDoc(doc(d, 'workspaces/home/products/invalid'), { name: 'Mjölk', category }));
    await assertFails(updateDoc(item, { category }));
    await assertFails(updateDoc(product, { category }));
  }
  await assertFails(updateDoc(item, { category: 'dairy', injected: true }));
  await assertFails(updateDoc(product, { category: 'dairy', injected: true }));
  await assertFails(updateDoc(doc(db('outsider'), 'workspaces/home/lists/week/items/existing'), { category: 'produce' }));
  await assertFails(updateDoc(doc(db('outsider'), 'workspaces/home/products/existing'), { category: 'produce' }));
});

test('item dates require server timestamps, preserve creation and last purchase on restore',async()=>{
 await create();const d=db('owner'),ref=doc(d,'workspaces/home/lists/week/items/dates');
 const values={name:'Ägg',quantity:'6',checked:false};
 await assertFails(setDoc(ref,values));
 await assertFails(setDoc(ref,{...values,createdAt:Timestamp.fromMillis(1),checkedAt:null}));
 await assertSucceeds(setDoc(ref,{...values,createdAt:serverTimestamp(),checkedAt:null}));
 const created=(await getDoc(ref)).data().createdAt;
 await assertFails(updateDoc(ref,{createdAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{createdAt:deleteField()}));
 await assertFails(updateDoc(ref,{checked:true}));
 await assertFails(updateDoc(ref,{checked:true,checkedAt:Timestamp.fromMillis(1)}));
 await assertSucceeds(updateDoc(ref,{checked:true,checkedAt:serverTimestamp()}));
 const bought=(await getDoc(ref)).data().checkedAt;
 await assertFails(updateDoc(ref,{checkedAt:null}));
 await assertFails(updateDoc(ref,{checked:false,checkedAt:null}));
 await assertSucceeds(updateDoc(ref,{checked:false}));
 assert.ok((await getDoc(ref)).data().checkedAt.isEqual(bought));
 await assertSucceeds(updateDoc(ref,{checked:true,checkedAt:serverTimestamp()}));
 assert.ok((await getDoc(ref)).data().checkedAt.toMillis()>=bought.toMillis());
 assert.ok((await getDoc(ref)).data().createdAt.isEqual(created));
});
test('legacy documents remain readable and editable without forged dates',async()=>{
 await create();await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'workspaces/home/lists/week/items/legacy'),{name:'Äldre',quantity:'',checked:true})});
 const ref=doc(db('owner'),'workspaces/home/lists/week/items/legacy');
 await assertSucceeds(getDoc(ref));await assertSucceeds(updateDoc(ref,{quantity:'2'}));
 await assertSucceeds(updateDoc(ref,{checked:false}));
 await assertFails(updateDoc(ref,{checked:true}));
 await assertSucceeds(updateDoc(ref,{checked:true,checkedAt:serverTimestamp()}));
});

test('household member identities are shared only inside workspace and self updates cannot change roles',async()=>{
 await create();await invite();await join();
 const owner=db('owner'),guest=db('guest');
 await assertSucceeds(updateDoc(doc(owner,'workspaces/home/members/owner'),{displayName:'Anna'}));
 await assertSucceeds(updateDoc(doc(guest,'workspaces/home/members/guest'),{displayName:'Robin'}));
 const members=await assertSucceeds(getDocs(collection(owner,'workspaces/home/members')));
 assert.deepEqual(members.docs.map(d=>d.data().displayName).sort(),['Anna','Robin']);
 await assertFails(getDocs(collection(db('outsider'),'workspaces/home/members')));
 await assertFails(updateDoc(doc(guest,'workspaces/home/members/owner'),{displayName:'Fake'}));
 await assertFails(updateDoc(doc(guest,'workspaces/home/members/guest'),{displayName:'Fake',role:'owner'}));
 await assertFails(updateDoc(doc(guest,'workspaces/home/members/guest'),{inviteToken:'b'.repeat(72)}));
 await assertFails(updateDoc(doc(guest,'workspaces/home/members/guest'),{displayName:''}));
 await assertFails(updateDoc(doc(guest,'workspaces/home/members/guest'),{displayName:'x'.repeat(161)}));
 await assertFails(updateDoc(doc(guest,'workspaces/home/members/guest'),{displayName:'Robin',email:'private@example.test'}));
});

const fresh = uid => env.authenticatedContext(uid,{auth_time:Math.floor(Date.now()/1000)}).firestore();
async function lockHousehold(d) {
 const b=writeBatch(d);b.update(doc(d,'workspaces/home'),{deletingBy:'owner',inviteToken:deleteField()});b.delete(doc(d,`invites/${token}`));await b.commit();
}
test('recently authenticated member can remove only their own linked profile and membership atomically',async()=>{
 await create();await invite();await join();const d=fresh('guest');
 await assertFails(deleteDoc(doc(d,'users/guest')));await assertFails(deleteDoc(doc(d,'workspaces/home/members/guest')));
 const leave=writeBatch(d);leave.delete(doc(d,'users/guest'));leave.delete(doc(d,'workspaces/home/members/guest'));await assertSucceeds(leave.commit());
 await assertSucceeds(getDoc(doc(db('owner'),'workspaces/home')));await assertFails(getDoc(doc(d,'workspaces/home')));
});
test('locked household blocks new joins and edits; owner can unlock before reconfirming deletion',async()=>{
 await create();await invite();await join();const d=fresh('owner');
 await assertFails(updateDoc(doc(fresh('guest'),'workspaces/home'),{deletingBy:'guest',inviteToken:deleteField()}));
 await assertFails(updateDoc(doc(db('owner'),'workspaces/home'),{deletingBy:'owner',inviteToken:deleteField()}));
 await lockHousehold(d);await assertFails(join('late'));
 await assertFails(setDoc(doc(fresh('guest'),'workspaces/home/products/new'),{name:'Test'}));
 await assertFails(deleteDoc(doc(fresh('guest'),'workspaces/home/lists/week')));
 await assertSucceeds(updateDoc(doc(d,'workspaces/home'),{deletingBy:deleteField()}));
 await assertSucceeds(updateDoc(doc(fresh('guest'),'workspaces/home/lists/week'),{name:'Bevarad'}));
});
test('owner transfer preserves household and requires existing successor plus atomic own removal',async()=>{
 await create();await invite();await join();const d=fresh('owner');await lockHousehold(d);
 await assertFails(updateDoc(doc(d,'workspaces/home'),{ownerID:'guest',deletingBy:deleteField()}));
 const b=writeBatch(d);b.update(doc(d,'workspaces/home'),{ownerID:'guest',deletingBy:deleteField()});b.update(doc(d,'workspaces/home/members/guest'),{role:'owner'});b.delete(doc(d,'workspaces/home/members/owner'));b.delete(doc(d,'users/owner'));await assertSucceeds(b.commit());
 assert.equal((await getDoc(doc(db('guest'),'workspaces/home'))).data().ownerID,'guest');
 await assertSucceeds(getDoc(doc(db('guest'),'workspaces/home/lists/week')));await assertFails(getDoc(doc(d,'workspaces/home')));
});
test('deletion can resume after reauthentication and cannot transfer to a member who left',async()=>{
 await create();await invite();await join();const d=fresh('owner');await lockHousehold(d);
 const guest=fresh('guest'),leave=writeBatch(guest);leave.delete(doc(guest,'users/guest'));leave.delete(doc(guest,'workspaces/home/members/guest'));await leave.commit();
 const bad=writeBatch(d);bad.update(doc(d,'workspaces/home'),{ownerID:'guest',deletingBy:deleteField()});bad.set(doc(d,'workspaces/home/members/guest'),{role:'owner'});bad.delete(doc(d,'workspaces/home/members/owner'));bad.delete(doc(d,'users/owner'));await assertFails(bad.commit());
 const stale=env.authenticatedContext('owner',{auth_time:Math.floor(Date.now()/1000)-600}).firestore();await assertFails(deleteDoc(doc(stale,'workspaces/home/lists/week')));
 await assertSucceeds(deleteDoc(doc(d,'workspaces/home/lists/week')));
 const finish=writeBatch(d);finish.delete(doc(d,'workspaces/home'));finish.delete(doc(d,'workspaces/home/members/owner'));finish.delete(doc(d,'users/owner'));await assertSucceeds(finish.commit());
 await env.withSecurityRulesDisabled(async context=>{assert.equal((await getDoc(doc(context.firestore(),'workspaces/home'))).exists(),false);assert.equal((await getDoc(doc(context.firestore(),'users/owner'))).exists(),false)});
});

test('shared list activity accepts only server timestamps and preserves legacy name edits',async()=>{
 await create();await invite();await join();const ref=doc(db('guest'),'workspaces/home/lists/week');
 await assertSucceeds(updateDoc(ref,{lastChangedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(ref,{name:'Nytt namn'}));
 await assertFails(updateDoc(ref,{lastChangedAt:Timestamp.fromMillis(1)}));
 await assertFails(updateDoc(ref,{lastChangedAt:deleteField()}));
 await assertFails(updateDoc(doc(db('outsider'),'workspaces/home/lists/week'),{lastChangedAt:serverTimestamp()}));
});

test('last viewed list stays private and cannot change household membership',async()=>{
 await create();await invite();await join();const d=db('guest'),profile=doc(d,'users/guest');
 await assertSucceeds(updateDoc(profile,{lastViewedListID:'week'}));
 await assertFails(getDoc(doc(db('owner'),'users/guest')));
 await assertFails(updateDoc(doc(db('owner'),'users/guest'),{lastViewedListID:'week'}));
 await assertFails(updateDoc(profile,{workspaceID:'other',lastViewedListID:'week'}));
 await assertFails(updateDoc(profile,{lastViewedListID:'missing-list'}));
 await assertFails(updateDoc(profile,{lastViewedListID:4}));
});

test('notification tokens are private, timestamp-bound and remain removable during account deletion',{skip:process.env.HANDLA_RULES_FILE==='firestore.production.rules'},async()=>{
 await create();await invite();await join();
 const d=fresh('guest'),path='users/guest/devices/install-123456789',value={token:'synthetic-token-123456789012345',platform:'ios',updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(d,path),value));
 await assertFails(getDoc(doc(db('owner'),path)));await assertFails(getDocs(collection(db('owner'),'users/guest/devices')));
 await assertFails(setDoc(doc(db('owner'),path),value));
 await assertFails(updateDoc(doc(d,path),{updatedAt:Timestamp.fromMillis(1)}));
 await assertFails(updateDoc(doc(db('guest'),'users/guest'),{deletingAccount:true}));
 await assertSucceeds(updateDoc(doc(d,'users/guest'),{deletingAccount:true}));
 await assertFails(setDoc(doc(d,path),value));
 await assertFails(updateDoc(doc(d,'workspaces/home/lists/week'),{name:'blocked'}));
 await assertSucceeds(deleteDoc(doc(d,path)));
 await assertSucceeds(updateDoc(doc(d,'users/guest'),{deletingAccount:deleteField()}));
 await assertSucceeds(setDoc(doc(d,path),value));
});

test('actor markers bind to author and server timestamp; shared cleanup scrubs only own identity',{skip:process.env.HANDLA_RULES_FILE==='firestore.production.rules'},async()=>{
 await create();await invite();await join();const path='workspaces/home/lists/week/items/actor';const d=fresh('owner');
 const item={name:'Vara',quantity:'1',checked:false,createdAt:serverTimestamp(),checkedAt:null,lastActorUID:'owner',lastActionAt:serverTimestamp()};
 await assertFails(setDoc(doc(db('guest'),path),item));await assertSucceeds(setDoc(doc(d,path),item));
 await assertFails(updateDoc(doc(db('guest'),path),{lastActorUID:'owner',lastActionAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(db('guest'),path),{lastActorUID:deleteField(),lastActionAt:deleteField()}));
 await assertFails(updateDoc(doc(d,path),{lastActionAt:Timestamp.fromMillis(1)}));
 await assertSucceeds(updateDoc(doc(db('guest'),path),{quantity:'2'}));
 await assertSucceeds(updateDoc(doc(d,'users/owner'),{deletingAccount:true}));
 await assertSucceeds(updateDoc(doc(d,'workspaces/home'),{deletingBy:'owner',inviteToken:deleteField()}));
 await assertFails(updateDoc(doc(d,path),{quantity:'3',lastActorUID:deleteField(),lastActionAt:deleteField()}));
 await assertSucceeds(updateDoc(doc(d,path),{lastActorUID:deleteField(),lastActionAt:deleteField()}));
 const saved=(await getDoc(doc(d,path))).data();assert.equal(saved.quantity,'2');assert.equal(saved.lastActorUID,undefined);
});
