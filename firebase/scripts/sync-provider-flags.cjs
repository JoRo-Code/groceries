const fs=require('fs');
const path=require('path');
const {selectAccount,setActiveAccount}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {Client}=require('firebase-tools/lib/apiv2');
(async()=>{
 const project='groceries-ros',options={project,projectId:project,projectRoot:process.cwd()},account=selectAccount(undefined,process.cwd());
 if(!account)throw Error('Firebase login required.');setActiveAccount(options,account);await requireAuth(options);
 const client=new Client({urlPrefix:'https://identitytoolkit.googleapis.com/admin',apiVersion:'v2'});
 const result=(await client.get(`projects/${project}/defaultSupportedIdpConfigs`,{skipLog:{resBody:true}})).body;
 const providers=result.defaultSupportedIdpConfigs??[];
 const enabled=id=>providers.some(p=>p.name.endsWith('/'+id)&&p.enabled&&p.clientId);
 const google=enabled('google.com'),apple=enabled('apple.com');
 const file=path.resolve(__dirname,'../../web/.env.local');
 let env=fs.readFileSync(file,'utf8');
 env=env.replace(/^VITE_(GOOGLE|APPLE)_SIGN_IN=.*\n?/gm,'');
 fs.writeFileSync(file,env.trimEnd()+`\nVITE_GOOGLE_SIGN_IN=${google}\nVITE_APPLE_SIGN_IN=${apple}\n`);
 console.log(JSON.stringify({project,googleEnabled:google,appleEnabled:apple,webFlagsUpdated:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
