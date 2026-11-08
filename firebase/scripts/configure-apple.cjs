const fs=require('fs');
const crypto=require('crypto');
const {selectAccount,setActiveAccount}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {Client}=require('firebase-tools/lib/apiv2');
(async()=>{
 const project='groceries-ros';
 const teamId=process.env.HANDLA_APPLE_TEAM_ID,clientId=process.env.HANDLA_APPLE_SERVICE_ID,keyId=process.env.HANDLA_APPLE_KEY_ID,keyPath=process.env.HANDLA_APPLE_KEY_PATH;
 if(!/^[A-Z0-9]{10}$/.test(teamId??'')||!/^[A-Z0-9]{10}$/.test(keyId??''))throw Error('Valid 10-character Apple Team ID and Key ID required.');
 if(!clientId||!/^[A-Za-z0-9.-]+$/.test(clientId)||!clientId.includes('.'))throw Error('Valid Apple Services ID required.');
 if(!keyPath||!require('path').isAbsolute(keyPath))throw Error('Absolute local .p8 key path required.');
 const privateKey=fs.readFileSync(keyPath,'utf8');
 const key=crypto.createPrivateKey(privateKey);
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('Apple Sign in key must be an EC P-256 private key.');
 if(process.argv.includes('--dry-run')){console.log(JSON.stringify({project,clientId,teamId,keyId,localKeyValidated:true,cloudChanged:false}));return;}
 const options={project,projectId:project,projectRoot:process.cwd()},account=selectAccount(undefined,process.cwd());
 if(!account)throw Error('Firebase login required.');setActiveAccount(options,account);await requireAuth(options);
 const client=new Client({urlPrefix:'https://identitytoolkit.googleapis.com/admin',apiVersion:'v2'});
 const name=`projects/${project}/defaultSupportedIdpConfigs/apple.com`;
 let existing;
 try {existing=(await client.get(name,{skipLog:{resBody:true}})).body;}
 catch(e){if(e.status!==404 && !e.message?.includes('404'))throw Error('Could not inspect existing Apple provider.');}
 if(existing?.clientId&&existing.clientId!==clientId)throw Error('A different Apple Services ID is already configured; inspect it before replacing.');
 const appleSignInConfig={...(existing?.appleSignInConfig??{}),codeFlowConfig:{teamId,keyId,privateKey}};
 const data={name,enabled:true,clientId,appleSignInConfig};
 const requestOptions={skipLog:{body:true,resBody:true}};
 try{
  if(existing)await client.patch(name,data,{...requestOptions,queryParams:{updateMask:'enabled,clientId,appleSignInConfig'}});
  else await client.post(`projects/${project}/defaultSupportedIdpConfigs`,data,{...requestOptions,queryParams:{idpId:'apple.com'}});
 }catch{throw Error('Apple provider update failed. Check Apple identifiers and Firebase permissions. Private request details were not logged.');}
 console.log(JSON.stringify({project,provider:'apple.com',clientId,enabled:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
