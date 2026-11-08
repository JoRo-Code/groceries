import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp,FieldValue} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {region} from 'firebase-functions/v1';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {deliver} from './notification.js';
initializeApp();const db=getFirestore();
const receipt=key=>db.collection('_notificationReceipts').doc(key);
const io={
 members:async w=>(await db.collection(`workspaces/${w}/members`).get()).docs.map(d=>d.id),
 devices:async uid=>(await db.collection(`users/${uid}/devices`).get()).docs.map(d=>({...d.data(),path:d.ref.path})),
 currentOwner:async(token,uid,path)=>{
  const rows=await db.collectionGroup('devices').where('token','==',token).orderBy('updatedAt','desc').limit(2).get();
  const first=rows.docs[0];if(!first||first.ref.path!==path||!/^users\/[^/]+\/devices\/[^/]+$/.test(first.ref.path)||first.ref.parent.parent.id!==uid)return false;
  // Equal timestamps across different accounts are ambiguous: fail closed.
  const second=rows.docs[1];return !second||!first.get('updatedAt').isEqual(second.get('updatedAt'))||second.ref.parent.parent.id===uid;
 },
 eligible:async(w,l,uid,actor)=>{
  const refs=[`workspaces/${w}`,`workspaces/${w}/lists/${l}`,`workspaces/${w}/members/${uid}`,`workspaces/${w}/members/${actor}`,`users/${uid}`,`users/${actor}`].map(p=>db.doc(p));
  const [workspace,list,member,author,profile,actorProfile]=await db.getAll(...refs);
  return workspace.exists&&!workspace.get('deletingBy')&&list.exists&&member.exists&&author.exists&&profile.get('workspaceID')===w&&actorProfile.get('workspaceID')===w&&!profile.get('deletingAccount')&&!actorProfile.get('deletingAccount');
 },
 claim:key=>db.runTransaction(async t=>{const ref=receipt(key),row=await t.get(ref),now=Date.now();if(row.get('status')==='sent')return 'sent';if((row.get('leaseUntil')?.toMillis()??0)>now)return 'busy';t.set(ref,{status:'pending',leaseUntil:Timestamp.fromMillis(now+60000),expiresAt:Timestamp.fromMillis(now+7*86400000)});return 'claimed';}),
 complete:key=>receipt(key).set({status:'sent',leaseUntil:Timestamp.fromMillis(0),expiresAt:Timestamp.fromMillis(Date.now()+7*86400000)}),
 release:key=>receipt(key).delete(),
 send:message=>getMessaging().send(message),
 removeExpired:device=>db.runTransaction(async t=>{const ref=db.doc(device.path),row=await t.get(ref);if(row.exists&&row.get('token')===device.token)t.delete(ref);}),
};
export const shoppingNotifications=onDocumentWritten({document:'workspaces/{workspaceID}/lists/{listID}/items/{itemID}',region:'europe-west1',retry:true,maxInstances:2},async event=>{
 const before=event.data?.before,after=event.data?.after;
 await deliver({eventID:event.id,workspaceID:event.params.workspaceID,listID:event.params.listID,before:before?.exists?before.data():null,after:after?.exists?after.data():null,updateTime:after?.updateTime},io);
 // Bounded opportunistic expiry; no scheduler/TTL billing and no raw tokens or names in receipts.
 const expired=await db.collection('_notificationReceipts').where('expiresAt','<',Timestamp.now()).limit(20).get();
 if(!expired.empty){const batch=db.batch();expired.docs.forEach(row=>batch.delete(row.ref));await batch.commit();}
});

// Auth deletion is also handled server-side: older installed clients may not know
// about actor markers/devices written by a newer client for the same account.
// Auth deletion triggers are first-generation; Firebase does not expose this trigger in v2.
export const cleanupDeletedAccount=region('europe-west1').runWith({failurePolicy:true,maxInstances:2}).auth.user().onDelete(async user=>{
 for(;;){const rows=await db.collectionGroup('items').where('lastActorUID','==',user.uid).limit(200).get();if(rows.empty)break;
  const batch=db.batch();for(const row of rows.docs){if(!/^workspaces\/[^/]+\/lists\/[^/]+\/items\/[^/]+$/.test(row.ref.path))throw new Error('Unexpected actor collection path');batch.update(row.ref,{lastActorUID:FieldValue.delete(),lastActionAt:FieldValue.delete()},{lastUpdateTime:row.updateTime})}await batch.commit();
 }
 for(;;){const rows=await db.collection(`users/${user.uid}/devices`).limit(200).get();if(rows.empty)break;const batch=db.batch();rows.docs.forEach(row=>batch.delete(row.ref));await batch.commit()}
});
