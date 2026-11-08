const {selectAccount,setActiveAccount}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {Client}=require('firebase-tools/lib/apiv2');
(async()=>{
 const project='groceries-ros',bundleId='se.groceriesros.handla',options={project,projectId:project,projectRoot:process.cwd()};
 const account=selectAccount(undefined,process.cwd());if(!account)throw Error('Firebase login required.');
 setActiveAccount(options,account);await requireAuth(options);
 const client=new Client({urlPrefix:'https://identitytoolkit.googleapis.com/admin',apiVersion:'v2'}),name=`projects/${project}/defaultSupportedIdpConfigs/apple.com`;
 const current=(await client.get(name,{skipLog:{resBody:true}})).body;
 const bundleIds=[...new Set([...(current.appleSignInConfig?.bundleIds??[]),bundleId])];
 if(!current.appleSignInConfig?.bundleIds?.includes(bundleId))await client.patch(name,{appleSignInConfig:{bundleIds}},{queryParams:{updateMask:'appleSignInConfig.bundleIds'},skipLog:{body:true,resBody:true}});
 const final=(await client.get(name,{skipLog:{resBody:true}})).body;
 console.log(JSON.stringify({project,enabled:final.enabled,clientId:final.clientId,bundleIds:final.appleSignInConfig?.bundleIds,teamId:final.appleSignInConfig?.codeFlowConfig?.teamId,keyId:final.appleSignInConfig?.codeFlowConfig?.keyId}));
})().catch(e=>{console.error('Could not verify/update the native Apple bundle allowlist.');process.exitCode=1;});
