const {selectAccount,setActiveAccount}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {Client}=require('firebase-tools/lib/apiv2');
(async()=>{
 const project='groceries-ros',options={project,projectId:project,projectRoot:process.cwd()};
 const account=selectAccount(undefined,process.cwd());if(!account)throw Error('Firebase login required');
 setActiveAccount(options,account);await requireAuth(options);
 const client=new Client({urlPrefix:'https://identitytoolkit.googleapis.com/admin',apiVersion:'v2'});
 const response=await client.get(`projects/${project}/defaultSupportedIdpConfigs`,{skipLog:{resBody:true}});
 console.log(JSON.stringify({project,providers:(response.body.defaultSupportedIdpConfigs??[]).map(p=>({name:p.name,enabled:p.enabled,hasClientId:!!p.clientId,hasClientSecret:!!p.clientSecret,hasAppleKey:!!p.appleSignInConfig?.codeFlowConfig?.privateKey}))}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
