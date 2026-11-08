const {selectAccount,setActiveAccount}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {Client}=require('firebase-tools/lib/apiv2');
(async()=>{
 const project='groceries-ros',options={project,projectId:project,projectRoot:process.cwd()};
 const account=selectAccount(undefined,process.cwd());if(!account)throw Error('Firebase login required');setActiveAccount(options,account);await requireAuth(options);
 const host=new Client({urlPrefix:'https://firebasehosting.googleapis.com',apiVersion:'v1beta1'});
 const auth=new Client({urlPrefix:'https://identitytoolkit.googleapis.com/admin',apiVersion:'v2'});
 if(process.argv.includes('--configure')){
  let site;try{site=await host.get(`projects/${project}/sites/palisty-landing`)}catch(e){if(e.status!==404)throw e;site=await host.post(`projects/${project}/sites`,{},{queryParams:{siteId:'palisty-landing'}})}
  console.log(JSON.stringify({landingSite:site.body.name}));
  for(const [siteID,domain] of [['groceries-ros','app.palisty.com'],['palisty-landing','palisty.com'],['palisty-landing','www.palisty.com']]){
   try{await host.get(`projects/${project}/sites/${siteID}/customDomains/${domain}`)}catch(e){if(e.status!==404)throw e;const r=await host.post(`projects/${project}/sites/${siteID}/customDomains`,domain==='www.palisty.com'?{redirectTarget:'palisty.com'}:{},{queryParams:{customDomainId:domain}});console.log(JSON.stringify({createdDomain:domain,operation:r.body.name}))}
  }
  const current=await auth.get(`projects/${project}/config`,{skipLog:{resBody:true}});
  const domains=[...new Set([...(current.body.authorizedDomains??[]),'app.palisty.com'])];
  if(domains.length!==(current.body.authorizedDomains??[]).length)await auth.patch(`projects/${project}/config`,{authorizedDomains:domains},{queryParams:{updateMask:'authorizedDomains'},skipLog:{reqBody:true,resBody:true}});
 }
 const sites=await host.get(`projects/${project}/sites`);console.log(JSON.stringify({sites:sites.body.sites}));
 const cfg=await auth.get(`projects/${project}/config`,{skipLog:{resBody:true}});console.log(JSON.stringify({authorizedDomains:cfg.body.authorizedDomains}));
 for(const site of sites.body.sites??[]){const r=await host.get(`${site.name}/customDomains`);console.log(JSON.stringify({site:site.name,domains:r.body.customDomains??[]}));}
})().catch(e=>{console.error(e.message);process.exitCode=1});
