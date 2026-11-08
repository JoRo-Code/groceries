import { withAppAuthDomain } from './authDomain.js';
import { invitationOrigin } from './inviteLinks.js';
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut as firebaseSignOut, connectAuthEmulator,
  GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
} from 'firebase/auth';
import {
  initializeFirestore, memoryLocalCache, connectFirestoreEmulator, collection, doc,
  getDocFromServer, onSnapshot, writeBatch, setDoc, updateDoc, deleteDoc, Timestamp, deleteField, serverTimestamp, query, where, orderBy, documentId, limit, startAfter, getDocsFromServer, runTransaction,
} from 'firebase/firestore';

export const sortLists = lists => [...lists].sort((a,b) => {
  const time=value=>value?.toMillis?.()??(value instanceof Date?value.getTime():0);
  return time(b.lastChangedAt)-time(a.lastChangedAt)||a.name.localeCompare(b.name,'sv')||a.id.localeCompare(b.id);
});
export const memberDisplayName = user => (user?.displayName?.trim() || user?.email?.trim() || '').slice(0,160);
export const categoryIDs = ['produce', 'dairy', 'meat', 'fish', 'bakery', 'pantry', 'frozen', 'drinks', 'snacks', 'household', 'hygiene', 'other'];
export const normalizeName = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('sv-SE').trim().replace(/\s+/gu, ' ');
export async function productID(name) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeName(name)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function validateGrocery({ name, quantity = '', category = 'other' }) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed || [...trimmed].length > 120) throw new Error('Ange ett varunamn med högst 120 tecken.');
  if (typeof quantity !== 'string' || [...quantity].length > 80) throw new Error('Mängden får vara högst 80 tecken.');
  if (!categoryIDs.includes(category)) throw new Error('Välj en giltig kategori.');
  return { name: trimmed, quantity: quantity.trim(), category };
}
export function validateInviteToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9-]{72}$/.test(token)) throw new Error('Inbjudningslänken är inte giltig.');
  return token;
}
const displayName = name => {
  const value = String(name ?? '').trim();
  if (!value || [...value].length > 80) throw new Error('Ange ett namn med högst 80 tecken.');
  return value;
};

/** One factory also allows isolated clients in emulator acceptance tests. No admin credentials. */
export function createBackend(config, { appName, emulators = false, inviteOrigin, pushDataEnabled = false } = {}) {
  if (emulators) config = { ...config, projectId: 'demo-handla', apiKey: 'demo-api-key', appId: '1:1234567890:web:demo' };
  const app = initializeApp(config, appName);
  const auth = getAuth(app);
  auth.languageCode = 'sv';
  // Keep offline edits in this tab; do not leave shared household data on a public computer's disk.
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  if (emulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8185);
  }
  const origin = inviteOrigin || (emulators && typeof location !== 'undefined' ? location.origin : invitationOrigin(config.projectId, typeof location !== 'undefined' ? location.origin : undefined));
  let pendingWrites = 0;
  const queued = operation => {
    pendingWrites += 1;
    return Promise.resolve(operation).finally(() => { pendingWrites -= 1; });
  };
  const uid = () => {
    if (!auth.currentUser) throw new Error('Logga in först.');
    return auth.currentUser.uid;
  };
  const workspace = id => doc(db, 'workspaces', id);
  const list = (w, l) => doc(db, 'workspaces', w, 'lists', l);
  const item = (w, l, i) => doc(db, 'workspaces', w, 'lists', l, 'items', i);
  const auditFields = () => ({updatedByUID:uid(),updatedAt:serverTimestamp()});
  const actorFields = () => pushDataEnabled ? {lastActorUID:uid(),lastActionAt:serverTimestamp()} : {};
  const purgeDocuments = async source => {for(;;){const rows=await getDocsFromServer(query(source,limit(200)));if(rows.empty)return;const batch=writeBatch(db);rows.docs.forEach(row=>batch.delete(row.ref));await batch.commit()}};
  const metadata = snapshot => ({ fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites });
  const watchDoc = (ref, callback, error) => onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
    // Missing cache data is not proof of a new account/workspace.
    if (!snapshot.exists() && snapshot.metadata.fromCache) return;
    callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null, metadata(snapshot));
  }, error);
  const watchCollection = (ref, callback, error) => onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data({serverTimestamps: 'estimate'}) })), metadata(snapshot));
  }, error);

  const identitySync = new Map();
  const syncMemberIdentity = workspaceID => {
    const user=auth.currentUser,name=memberDisplayName(user);
    if(!user||!name)return Promise.resolve();
    const key=`${user.uid}/${workspaceID}`;
    if(identitySync.has(key))return identitySync.get(key);
    const operation=(async()=>{
      const ref=doc(workspace(workspaceID),'members',user.uid);
      const snapshot=await getDocFromServer(ref);
      if(auth.currentUser?.uid!==user.uid||!snapshot.exists()||snapshot.data().displayName)return;
      await queued(updateDoc(ref,{displayName:name}));
    })().catch(error=>{identitySync.delete(key);throw error});
    identitySync.set(key,operation);return operation;
  };

  const providerLogin = async provider => {
    try { return await signInWithPopup(auth, provider); }
    catch (error) {
      if (error.code === 'auth/popup-blocked') {
        // A same-domain auth handler avoids Safari third-party-storage restrictions.
        if (emulators || (typeof location !== 'undefined' && location.hostname === config.authDomain)) {
          return signInWithRedirect(auth, provider);
        }
        const blocked = new Error('Tillåt popupfönster i webbläsaren och försök igen.');
        blocked.code = error.code;
        throw blocked;
      }
      throw error;
    }
  };
  return {
    hasPendingWrites: () => pendingWrites > 0,
    app, auth, db, syncMemberIdentity,
    signInWithGoogle: () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return providerLogin(provider);
    },
    signInWithApple: () => {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email'); provider.addScope('name');
      provider.setCustomParameters({ locale: 'sv_SE' });
      return providerLogin(provider);
    },
    completeRedirect: () => getRedirectResult(auth),
    onAuth: callback => onAuthStateChanged(auth, callback),
    signUp: (email, password) => createUserWithEmailAndPassword(auth, email.trim(), password),
    signIn: (email, password) => signInWithEmailAndPassword(auth, email.trim(), password),
    resetPassword: email => sendPasswordResetEmail(auth, email.trim()),
    signOut: () => {
      if (pendingWrites) return Promise.reject(new Error('Ändringar väntar på synkning. Anslut till internet innan du loggar ut.'));
      return firebaseSignOut(auth);
    },
    watchProfile: (userID, callback, error) => watchDoc(doc(db, 'users', userID), (profile, meta) => {
      // Membership is granted atomically with this profile. Do not start protected
      // household listeners from a local profile before the server accepts the batch.
      if (!meta.hasPendingWrites) {
        callback(profile, meta);
        if(profile?.workspaceID&&auth.currentUser?.uid===userID)syncMemberIdentity(profile.workspaceID).catch(failure=>{if(auth.currentUser?.uid===userID)error?.(failure)});
      }
    }, error),
    watchWorkspace: (id, callback, error) => watchDoc(workspace(id), callback, error),
    watchLists: (id, callback, error) => watchCollection(collection(workspace(id), 'lists'), (rows,meta)=>callback(sortLists(rows),meta), error),
    watchProducts: (id, callback, error) => {
      let generation = 0, active = true;
      const stop = watchCollection(collection(workspace(id), 'products'), async (products, meta) => {
        const current = ++generation;
        try {
          const enriched = await Promise.all(products.map(async product => ({ ...product, canonical: typeof product.name === 'string' && product.id === await productID(product.name) })));
          if (active && current === generation) callback(enriched, meta);
        } catch (failure) { if (active && current === generation) error?.(failure); }
      }, error);
      return () => { active = false; generation += 1; stop(); };
    },
    watchMembers: (id, callback, error) => watchCollection(collection(workspace(id), 'members'), callback, error),
    watchItems: (w, l, callback, error) => watchCollection(collection(list(w, l), 'items'), callback, error),
    watchActiveItems: (w, l, callback, error) => watchCollection(query(collection(list(w,l),'items'),where('checked','==',false)),callback,error),
    watchRecentItems: (w, l, cutoff, callback, error) => watchCollection(query(collection(list(w,l),'items'),where('checked','==',true),where('checkedAt','>=',Timestamp.fromDate(cutoff)),orderBy('checkedAt','desc')),callback,error),
    async listOlderItems(w,l,cutoff,{cursor=null,pageSize=20}={}) {
      uid();
      if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime()) || !Number.isInteger(pageSize) || pageSize<1 || pageSize>20) throw new Error('Ogiltig historiksida.');
      const source=collection(list(w,l),'items');
      const phase=cursor?.phase??'dated';
      const constraints=[where('checked','==',true),...(phase==='dated'?[where('checkedAt','<',Timestamp.fromDate(cutoff)),orderBy('checkedAt','desc')]:[where('checkedAt','==',null),orderBy(documentId())])];
      if(cursor?.snapshot)constraints.push(startAfter(cursor.snapshot));
      const result=await getDocsFromServer(query(source,...constraints,limit(pageSize+1)));
      const docs=result.docs.slice(0,pageSize);
      const items=docs.map(d=>({id:d.id,...d.data()}));
      if(result.size>pageSize)return {items,cursor:{phase,snapshot:docs.at(-1)},hasMore:true};
      if(phase==='dated') {
        const unknown=await getDocsFromServer(query(source,where('checked','==',true),where('checkedAt','==',null),orderBy(documentId()),limit(pageSize-items.length+1)));
        const remaining=pageSize-items.length;
        const added=unknown.docs.slice(0,remaining);
        items.push(...added.map(d=>({id:d.id,...d.data()})));
        return {items,cursor:{phase:'unknown',snapshot:added.at(-1)??null},hasMore:unknown.size>remaining};
      }
      return {items,cursor:null,hasMore:false};
    },

    async prepareAccountDeletion() {
      const userID=uid(),profile=await getDocFromServer(doc(db,'users',userID));
      if(!profile.exists())return {workspaceID:null,owner:false,recipient:null};
      const w=profile.data().workspaceID,space=await getDocFromServer(workspace(w));
      if(!space.exists())throw new Error('Hushållet saknas. Kontakta support innan kontot raderas.');
      const isOwner=space.data().ownerID===userID;
      const others=isOwner?await getDocsFromServer(query(collection(workspace(w),'members'),where(documentId(),'!=',userID),orderBy(documentId()),limit(1))):null;
      const recipient=others?.docs[0];
      return {workspaceID:w,owner:isOwner,recipient:recipient?{id:recipient.id,displayName:recipient.data().displayName||'Medlem utan namn'}:null};
    },
    deleteAccountData(plan) {
      if(pendingWrites)throw new Error('Vänta tills ändringarna har synkats innan kontot raderas.');
      const userID=uid();
      return queued((async()=>{
        const profileRef=doc(db,'users',userID),profile=await getDocFromServer(profileRef);
        if(!profile.exists()){if(pushDataEnabled)await purgeDocuments(collection(profileRef,'devices'));return;}
        const w=profile.data().workspaceID;
        if(w!==plan?.workspaceID)throw new Error('Hushållet har ändrats. Bekräfta raderingen igen.');
        const spaceRef=workspace(w),ownMember=doc(spaceRef,'members',userID);
        // Audit identity removal is independent of push notification activation.
        // Re-read inside the transaction so a concurrent editor's identity is kept.
        let auditCursor=null;
        for(;;){
          const lists=await getDocsFromServer(query(collection(spaceRef,'lists'),orderBy(documentId()),...(auditCursor?[startAfter(auditCursor)]:[]),limit(100)));
          for(const listRow of lists.docs)for(const field of ['createdByUID','updatedByUID'])for(;;){
            const authored=await getDocsFromServer(query(collection(listRow.ref,'items'),where(field,'==',userID),limit(200)));
            if(authored.empty)break;
            await runTransaction(db,async transaction=>{
              const current=await Promise.all(authored.docs.map(row=>transaction.get(row.ref)));
              for(const row of current)if(row.exists()&&row.data()[field]===userID)transaction.update(row.ref,{[field]:deleteField()});
            });
          }
          if(lists.size<100)break;auditCursor=lists.docs.at(-1);
        }
        if(pushDataEnabled){
          await updateDoc(profileRef,{deletingAccount:true});
          await purgeDocuments(collection(profileRef,'devices'));
          let cursor=null;
          for(;;){
            const rows=await getDocsFromServer(query(collection(spaceRef,'lists'),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(100)));
            for(const listRow of rows.docs){for(;;){const authored=await getDocsFromServer(query(collection(listRow.ref,'items'),where('lastActorUID','==',userID),limit(200)));if(authored.empty)break;const batch=writeBatch(db);authored.docs.forEach(row=>batch.update(row.ref,{lastActorUID:deleteField(),lastActionAt:deleteField()}));await batch.commit()}}
            if(rows.size<100)break;cursor=rows.docs.at(-1);
          }
        }
        const isOwner=await runTransaction(db,async transaction=>{
          const [space,currentProfile]=await Promise.all([transaction.get(spaceRef),transaction.get(profileRef)]);
          if(!space.exists()||currentProfile.data()?.workspaceID!==w)throw new Error('Hushållet har ändrats.');
          if(space.data().ownerID!==userID){transaction.delete(ownMember);transaction.delete(profileRef);return false}
          transaction.update(spaceRef,{deletingBy:userID,inviteToken:deleteField()});
          if(space.data().inviteToken)transaction.delete(doc(db,'invites',space.data().inviteToken));
          return true;
        });
        if(!isOwner)return;
        const others=await getDocsFromServer(query(collection(spaceRef,'members'),where(documentId(),'!=',userID),orderBy(documentId()),limit(1)));
        const recipient=others.docs[0];
        if((recipient?.id??null)!==(plan.recipient?.id??null)){
          const unlock=writeBatch(db);unlock.update(spaceRef,{deletingBy:deleteField()});if(pushDataEnabled)unlock.update(profileRef,{deletingAccount:deleteField()});await unlock.commit();
          throw new Error('Medlemmarna har ändrats. Bekräfta mottagaren igen. Inga listor har raderats.');
        }
        if(recipient){
          await runTransaction(db,async transaction=>{
            const [space,target]=await Promise.all([transaction.get(spaceRef),transaction.get(recipient.ref)]);
            if(space.data()?.ownerID!==userID||space.data()?.deletingBy!==userID||!target.exists())throw new Error('Medlemmarna har ändrats. Försök igen.');
            transaction.update(spaceRef,{ownerID:recipient.id,deletingBy:deleteField(),inviteToken:deleteField()});
            transaction.update(recipient.ref,{role:'owner'});transaction.delete(ownMember);transaction.delete(profileRef);
          });return;
        }
        const purge=async source=>{for(;;){const page=await getDocsFromServer(query(source,limit(200)));if(page.empty)return;const batch=writeBatch(db);for(const document of page.docs)batch.delete(document.ref);await batch.commit()}};
        for(;;){const lists=await getDocsFromServer(query(collection(spaceRef,'lists'),limit(100)));if(lists.empty)break;for(const document of lists.docs){await purge(collection(document.ref,'items'));await deleteDoc(document.ref)}}
        await purge(collection(spaceRef,'products'));
        const batch=writeBatch(db);batch.delete(spaceRef);batch.delete(ownMember);batch.delete(profileRef);await batch.commit();
      })());
    },
    async createWorkspace(name) {
      name = displayName(name);
      const userID = uid(), profile = doc(db, 'users', userID);
      if ((await getDocFromServer(profile)).exists()) throw new Error('Du tillhör redan ett hushåll.');
      const ref = doc(collection(db, 'workspaces')), batch = writeBatch(db);
      batch.set(ref, { name, ownerID: userID });
      batch.set(doc(ref, 'members', userID), { role: 'owner', ...(memberDisplayName(auth.currentUser)?{displayName:memberDisplayName(auth.currentUser)}:{}) });
      const firstList=doc(collection(ref,'lists'));
      batch.set(profile, { workspaceID: ref.id, lastViewedListID:firstList.id });
      batch.set(firstList, { name: 'Veckohandling', lastChangedAt:serverTimestamp() });
      await queued(batch.commit());
      return ref.id;
    },
    async getInvite(token) {
      validateInviteToken(token); uid();
      const snapshot = await getDocFromServer(doc(db, 'invites', token));
      if (!snapshot.exists()) throw new Error('Inbjudan har gått ut eller återkallats.');
      return { id: snapshot.id, token: snapshot.id, ...snapshot.data() };
    },
    async joinWorkspace(token) {
      validateInviteToken(token);
      const userID = uid(), profile = doc(db, 'users', userID);
      const invitation = await this.getInvite(token);
      const current = await getDocFromServer(profile);
      if (current.exists()) {
        if (current.data().workspaceID === invitation.workspaceID) return invitation.workspaceID;
        throw new Error('Du tillhör redan ett annat hushåll. Byte stöds inte ännu.');
      }
      const batch = writeBatch(db);
      batch.set(doc(workspace(invitation.workspaceID), 'members', userID), { role: 'member', inviteToken: token, ...(memberDisplayName(auth.currentUser)?{displayName:memberDisplayName(auth.currentUser)}:{}) });
      batch.set(profile, { workspaceID: invitation.workspaceID });
      await queued(batch.commit());
      return invitation.workspaceID;
    },
    async createInvite(workspaceID) {
      const ref = workspace(workspaceID), snapshot = await getDocFromServer(ref);
      if (snapshot.data()?.ownerID !== uid()) throw new Error('Endast hushållets ägare kan bjuda in.');
      const token = crypto.randomUUID() + crypto.randomUUID(), batch = writeBatch(db);
      const old = snapshot.data().inviteToken;
      if (old) batch.delete(doc(db, 'invites', old));
      batch.set(doc(db, 'invites', token), { workspaceID, name: snapshot.data().name, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000 - 60000) });
      batch.update(ref, { inviteToken: token });
      await queued(batch.commit());
      return `${origin}/join/${token}`;
    },
    async revokeInvite(workspaceID) {
      const ref = workspace(workspaceID), snapshot = await getDocFromServer(ref);
      if (snapshot.data()?.ownerID !== uid()) throw new Error('Endast hushållets ägare kan återkalla inbjudan.');
      const batch = writeBatch(db);
      if (snapshot.data().inviteToken) batch.delete(doc(db, 'invites', snapshot.data().inviteToken));
      batch.update(ref, { inviteToken: deleteField() });
      return queued(batch.commit());
    },
    addList(workspaceID, name) {
      uid(); name = displayName(name);
      const ref = doc(collection(workspace(workspaceID), 'lists'));
      const batch=writeBatch(db);batch.set(ref,{name,lastChangedAt:serverTimestamp()});batch.update(doc(db,'users',uid()),{lastViewedListID:ref.id});
      return queued(batch.commit()).then(() => ref.id);
    },
    setLastViewedList(workspaceID,listID) {
      const userID=uid();return queued(updateDoc(doc(db,'users',userID),{workspaceID,lastViewedListID:listID}));
    },
    renameList(workspaceID, listID, name) {
      uid(); name = displayName(name);
      return queued(updateDoc(list(workspaceID, listID), { name, lastChangedAt:serverTimestamp() }));
    },
    addItem(workspaceID, listID, data) {
      uid(); const values = validateGrocery(data);
      return queued((async () => {
        const key = await productID(values.name);
        const ref = doc(collection(list(workspaceID, listID), 'items')), batch = writeBatch(db);
        batch.set(ref, { ...values, checked: false, createdAt: serverTimestamp(), checkedAt: null, createdByUID:uid(), ...auditFields(), ...actorFields() });
        batch.update(list(workspaceID,listID),{lastChangedAt:serverTimestamp()});
        batch.set(doc(workspace(workspaceID), 'products', key), { name: values.name, category: values.category });
        await batch.commit(); return ref.id;
      })());
    },
    updateItem(workspaceID, listID, itemID, data) {
      uid(); const values = validateGrocery(data);
      return queued((async () => {
        const key = await productID(values.name), batch = writeBatch(db);
        // Keep checkoff and both dates: another shopper may have changed them.
        batch.update(item(workspaceID, listID, itemID), {...values,...auditFields()});
        batch.update(list(workspaceID,listID),{lastChangedAt:serverTimestamp()});
        batch.set(doc(workspace(workspaceID), 'products', key), { name: values.name, category: values.category });
        return batch.commit();
      })());
    },
    toggleItem(workspaceID, listID, itemID, checked) {
      uid(); if (typeof checked !== 'boolean') throw new Error('Ogiltig avbockning.');
      const batch=writeBatch(db);batch.update(item(workspaceID,listID,itemID),{checked,...(checked?{checkedAt:serverTimestamp()}:{}),...auditFields(),...actorFields()});batch.update(list(workspaceID,listID),{lastChangedAt:serverTimestamp()});return queued(batch.commit());
    },
    deleteItem(workspaceID, listID, itemID) {
      uid();const batch=writeBatch(db);batch.delete(item(workspaceID,listID,itemID));batch.update(list(workspaceID,listID),{lastChangedAt:serverTimestamp()});return queued(batch.commit());
    },
  };
}

const env = import.meta.env || {};
let config;
try { config = JSON.parse(env.VITE_FIREBASE_CONFIG || '{}'); } catch { config = {}; }
config = withAppAuthDomain(config, typeof location !== 'undefined' ? location.hostname : undefined);
export const configured = Boolean(config.apiKey && config.projectId && config.appId);
const backend = configured ? createBackend(config, { emulators: env.VITE_USE_EMULATORS === 'true', pushDataEnabled:env.VITE_PUSH_DATA_ENABLED === 'true' }) : null;
const call = name => (...args) => {
  if (!backend) throw new Error('Firebase-konfiguration saknas.');
  return backend[name](...args);
};
export const onAuth = call('onAuth');
export const signUp = call('signUp');
export const signIn = call('signIn');
export const resetPassword = call('resetPassword');
export const signOut = call('signOut');
export const watchProfile = call('watchProfile');
export const watchWorkspace = call('watchWorkspace');
export const watchLists = call('watchLists');
export const watchProducts = call('watchProducts');
export const watchMembers = call('watchMembers');
export const watchItems = call('watchItems');
export const watchActiveItems = call('watchActiveItems');
export const watchRecentItems = call('watchRecentItems');
export const listOlderItems = call('listOlderItems');
export const createWorkspace = call('createWorkspace');
export const getInvite = call('getInvite');
export const joinWorkspace = call('joinWorkspace');
export const createInvite = call('createInvite');
export const revokeInvite = call('revokeInvite');
export const addList = call('addList');
export const setLastViewedList = call('setLastViewedList');
export const renameList = call('renameList');
export const addItem = call('addItem');
export const updateItem = call('updateItem');
export const toggleItem = call('toggleItem');
export const deleteItem = call('deleteItem');

export const googleSignInAvailable = env.VITE_USE_EMULATORS === 'true' || env.VITE_GOOGLE_SIGN_IN === 'true';
export const appleSignInAvailable = env.VITE_APPLE_SIGN_IN === 'true';
export const signInWithGoogle = (...args) => {
  if (!googleSignInAvailable) return Promise.reject(new Error('Google-inloggning är inte aktiverad ännu.'));
  return call('signInWithGoogle')(...args);
};
export const signInWithApple = (...args) => {
  if (!appleSignInAvailable) return Promise.reject(new Error('Apple-inloggning är inte aktiverad ännu.'));
  return call('signInWithApple')(...args);
};
export const completeRedirect = call('completeRedirect');

export const hasPendingWrites = () => backend?.hasPendingWrites() ?? false;
