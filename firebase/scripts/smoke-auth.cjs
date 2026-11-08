const crypto=require('crypto');
const fs=require('fs');
(async()=>{
 const env=fs.readFileSync(require('path').resolve(__dirname,'../../web/.env.local'),'utf8');
 const config=JSON.parse(env.split('\n').find(line=>line.startsWith('VITE_FIREBASE_CONFIG=')).slice('VITE_FIREBASE_CONFIG='.length));
 if(config.projectId!=='groceries-ros')throw Error('Unexpected project');
 const email=`handla-e2e-${crypto.randomUUID()}@example.test`,password=crypto.randomBytes(24).toString('base64url');
 const call=async(method,data)=>{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${config.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw Error(`${method}: ${result.error?.message??response.status}`);return result;
 };
 let idToken;
 try{
  const created=await call('signUp',{email,password,returnSecureToken:true});idToken=created.idToken;
  const signed=await call('signInWithPassword',{email,password,returnSecureToken:true});idToken=signed.idToken;
  if(created.localId!==signed.localId)throw Error('UID mismatch');
  console.log(JSON.stringify({project:config.projectId,signup:true,signin:true,uid:created.localId}));
 }finally{if(idToken){await call('delete',{idToken});console.log(JSON.stringify({testUserDeleted:true}));}}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
