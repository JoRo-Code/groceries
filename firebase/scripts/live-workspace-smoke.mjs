import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createBackend } from '../../web/src/backend.js';
const env = fs.readFileSync(new URL('../../web/.env.local',import.meta.url),'utf8');
const config = JSON.parse(env.split('\n').find(line=>line.startsWith('VITE_FIREBASE_CONFIG=')).slice('VITE_FIREBASE_CONFIG='.length));
if(config.projectId !== 'groceries-ros')throw new Error('Unexpected project');
const stamp=crypto.randomUUID(), password=crypto.randomUUID()+'Aa1!';
const owner=createBackend(config,{appName:`live-owner-${stamp}`}),guest=createBackend(config,{appName:`live-guest-${stamp}`});
let workspaceID, ownerUID, guestUID;
const waits=[];
const watchUntil=(observe,predicate)=>new Promise((resolve,reject)=>{
 let stop=()=>{};const timer=setTimeout(()=>{stop();reject(new Error('Live listener timed out'));},20000);
 stop=observe(value=>{if(predicate(value)){clearTimeout(timer);stop();resolve(value);}},reject);waits.push(stop);
});
const cliDelete=path=>execFileSync(process.execPath,['node_modules/firebase-tools/lib/bin/firebase.js','firestore:delete',path,'--recursive','--force','--project','groceries-ros'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
let failure;
try {
 await owner.signUp(`handla-e2e-owner-${stamp}@example.test`,password);ownerUID=owner.auth.currentUser.uid;
 await guest.signUp(`handla-e2e-guest-${stamp}@example.test`,password);guestUID=guest.auth.currentUser.uid;
 workspaceID=await owner.createWorkspace(`Handla test ${stamp}`);
 fs.writeFileSync('/tmp/handla-live-smoke-ids.json',JSON.stringify({workspaceID,ownerUID,guestUID}));
 const inviteURL=await owner.createInvite(workspaceID),token=inviteURL.split('/').at(-1);
 await guest.joinWorkspace(token);
 const listID=await owner.addList(workspaceID,'Testlista');
 const itemID=await owner.addItem(workspaceID,listID,{name:'Mjölk',quantity:'2 l',category:'dairy'});
 const observe=(next,error)=>guest.watchItems(workspaceID,listID,next,error);
 await watchUntil(observe,items=>items.some(i=>i.id===itemID&&i.quantity==='2 l'));
 const created=await watchUntil(observe,items=>items.some(i=>i.id===itemID&&i.createdAt));
 const createdMillis=created.find(i=>i.id===itemID).createdAt.toMillis();
 await guest.toggleItem(workspaceID,listID,itemID,true);
 const recent=await watchUntil((next,error)=>owner.watchRecentItems(workspaceID,listID,new Date(Date.now()-86400000),next,error),items=>items.some(i=>i.id===itemID&&i.checkedAt));
 const checkedMillis=recent.find(i=>i.id===itemID).checkedAt.toMillis();
 const older=await owner.listOlderItems(workspaceID,listID,new Date(Date.now()-86400000));
 if(older.items.length||older.hasMore)throw Error('Unexpected synthetic history');
 await owner.updateItem(workspaceID,listID,itemID,{name:'Mjölk',quantity:'3 l',category:'dairy'});
 await watchUntil(observe,items=>items.some(i=>i.id===itemID&&i.checked&&i.quantity==='3 l'));
 await guest.toggleItem(workspaceID,listID,itemID,false);
 const restored=await watchUntil((next,error)=>owner.watchActiveItems(workspaceID,listID,next,error),items=>items.some(i=>i.id===itemID&&!i.checked));
 const dates=restored.find(i=>i.id===itemID);
 if(dates.createdAt.toMillis()!==createdMillis||dates.checkedAt.toMillis()!==checkedMillis)throw Error('Date preservation failed');
 await owner.revokeInvite(workspaceID);
 let rejected=false;try{await guest.getInvite(token);}catch{rejected=true;}
 if(!rejected)throw new Error('Revoked invite remained readable');
 console.log(JSON.stringify({project:'groceries-ros',liveSharedWorkspace:true,inviteJoin:true,realtimeSync:true,editPreservesChecked:true,restore:true,revoke:true,datePreservation:true,historyQueries:true}));
} catch(error) {failure=error;console.error(error.message);}
finally {
 waits.forEach(stop=>stop());
 if(workspaceID){try{await owner.revokeInvite(workspaceID);}catch{}cliDelete(`workspaces/${workspaceID}`);}
 for(const uid of [ownerUID,guestUID].filter(Boolean))cliDelete(`users/${uid}`);
 for(const service of [owner,guest])if(service.auth.currentUser)await service.auth.currentUser.delete();
 console.log(JSON.stringify({syntheticWorkspaceAndProfilesDeleted:true,syntheticAuthUsersDeleted:true}));
}
process.exit(failure?1:0);
