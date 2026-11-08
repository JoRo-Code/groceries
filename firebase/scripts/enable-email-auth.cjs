const {selectAccount,setActiveAccount}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {getConfig,updateConfig}=require('firebase-tools/lib/gcp/identityPlatform');
(async()=>{
 const project='groceries-ros', options={project,projectId:project,projectRoot:process.cwd()};
 const account=selectAccount(undefined,process.cwd());if(!account)throw Error('Firebase login required');
 setActiveAccount(options,account);await requireAuth(options);
 // Only enable the free email/password sign-in method. Never initialize/upgrade Identity Platform.
 await updateConfig(project,{signIn:{email:{enabled:true,passwordRequired:true}}},'signIn.email');
 const config=await getConfig(project);
 console.log(JSON.stringify({project,subtype:config.subtype,email:config.signIn?.email,authorizedDomains:config.authorizedDomains}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
