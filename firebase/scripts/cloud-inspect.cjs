const {selectAccount,setActiveAccount}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {ensure}=require('firebase-tools/lib/ensureApiEnabled');
const {getConfig}=require('firebase-tools/lib/gcp/identityPlatform');
(async()=>{
 const project='groceries-ros', options={project,projectId:project,projectRoot:process.cwd()};
 const account=selectAccount(undefined,process.cwd()); if(!account)throw Error('Firebase login required');
 setActiveAccount(options,account); await requireAuth(options);
 await ensure(project,'firestore.googleapis.com','firestore',true);
 await ensure(project,'identitytoolkit.googleapis.com','auth',true);
 try {const config=await getConfig(project);console.log(JSON.stringify({authConfigured:true,subtype:config.subtype,email:config.signIn?.email,anonymous:config.signIn?.anonymous,authorizedDomains:config.authorizedDomains}));}
 catch(e){console.log(JSON.stringify({authConfigured:false,message:e.message}));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
