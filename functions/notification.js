import {createHash} from 'node:crypto';
export const digest = value => createHash('sha256').update(value).digest('hex');
const equalTime=(a,b)=>Boolean(a&&b&&a.seconds===b.seconds&&a.nanoseconds===b.nanoseconds);
/** Old clients retain stale markers: only a marker from this exact commit can name an actor. */
export function classify(before,after,updateTime){
 if(!after||typeof after.lastActorUID!=='string'||!equalTime(after.lastActionAt,updateTime))return null;
 if(!before)return {actor:after.lastActorUID,type:'itemAdded'};
 if(before.checked===false&&after.checked===true)return {actor:after.lastActorUID,type:'itemChecked'};
 return null;
}
export function payload({workspaceID,listID,type,eventID,recipientUID},token){
 return {token,notification:{title:'Handla',body:type==='itemAdded'?'En vara har lagts till.':'En vara har bockats av.'},
 data:{workspaceID,listID,type,eventID,recipientUID},apns:{headers:{'apns-collapse-id':digest(eventID).slice(0,64)}}};
}
export const expiredToken = error => ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(error?.code);
/** Dependencies are injected so tests never send real messages. */
export async function deliver({eventID,workspaceID,listID,before,after,updateTime},io){
 const action=classify(before,after,updateTime);if(!action)return {sent:0,skipped:true};
 const members=await io.members(workspaceID);if(!members.includes(action.actor))return {sent:0,skipped:true};
 let sent=0;const tokens=new Set();
 for(const recipientUID of members.filter(id=>id!==action.actor)){
  for(const device of await io.devices(recipientUID)){
   if(typeof device.token!=='string'||tokens.has(device.token))continue;
   // Verify current token owner globally. A newer registration wins across account switches.
   if(!await io.currentOwner(device.token,recipientUID,device.path))continue;
   if(!await io.eligible(workspaceID,listID,recipientUID,action.actor))continue;
   tokens.add(device.token);
   const key=digest(eventID+'\0'+device.token),claim=await io.claim(key);
   if(claim==='sent')continue;
   if(claim==='busy')throw new Error('Notification delivery lease still active');
   try{
    // Recheck after claim: membership or token ownership may change during async work.
    if(!await io.currentOwner(device.token,recipientUID,device.path)||!await io.eligible(workspaceID,listID,recipientUID,action.actor)){await io.complete(key);continue;}
    await io.send(payload({workspaceID,listID,type:action.type,eventID,recipientUID},device.token));
    await io.complete(key);sent++;
   }catch(error){
    if(expiredToken(error)){await io.removeExpired(device);await io.complete(key);}
    else {await io.release(key);throw error;}
   }
  }
 }
 return {sent};
}
