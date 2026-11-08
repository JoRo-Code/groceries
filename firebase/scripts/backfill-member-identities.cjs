// Missing-only identity sharing inside existing households. Never logs identities.
const {selectAccount,setActiveAccount}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {Client}=require('firebase-tools/lib/apiv2');
(async()=>{
 const emulator=process.argv.includes('--emulator'),apply=process.argv.includes('--apply'),project=emulator?'demo-handla':'groceries-ros';
 if(!emulator){const options={project,projectId:project,projectRoot:process.cwd()};const account=selectAccount(undefined,process.cwd());if(!account)throw Error();setActiveAccount(options,account);await requireAuth(options)}
 const firestore=new Client({urlPrefix:emulator?'http://127.0.0.1:8185':'https://firestore.googleapis.com',apiVersion:'v1',auth:!emulator});
 const auth=new Client({urlPrefix:emulator?'http://127.0.0.1:9099/identitytoolkit.googleapis.com':'https://identitytoolkit.googleapis.com',apiVersion:'v1',auth:!emulator});
 const options={skipLog:{body:true,resBody:true},...(emulator?{headers:{Authorization:'Bearer owner'}}:{})};
 const root=`projects/${project}/databases/(default)/documents`;
 const stats={project,mode:apply?'apply':'dry-run',members:0,missing:0,eligible:0,unresolvable:0,updated:0,conflicts:0};let cursor;
 for(;;){
  const structuredQuery={from:[{collectionId:'members',allDescendants:true}],orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:100};if(cursor)structuredQuery.startAt={values:[{referenceValue:cursor}],before:false};
  const docs=(await firestore.post(`${root}:runQuery`,{structuredQuery},options)).body.filter(r=>r.document).map(r=>r.document);
  for(const doc of docs){
   if(!doc.name.startsWith(root+'/workspaces/')||!/^workspaces\/[^/]+\/members\/[^/]+$/.test(doc.name.slice(root.length+1)))throw Error();
   stats.members++;if(doc.fields?.displayName?.stringValue?.trim())continue;stats.missing++;
   const uid=doc.name.split('/').at(-1),lookup=(await auth.post(`projects/${project}/accounts:lookup`,{localId:[uid]},options)).body;
   const user=lookup.users?.find(u=>u.localId===uid),name=(user?.displayName?.trim()||user?.email?.trim()||'').slice(0,160);
   if(!name){stats.unresolvable++;continue}stats.eligible++;
   if(apply){try{await firestore.post(`${root}:commit`,{writes:[{update:{name:doc.name,fields:{displayName:{stringValue:name}}},updateMask:{fieldPaths:['displayName']},currentDocument:{updateTime:doc.updateTime}}]},options);stats.updated++}catch(e){if([409,412].includes(e.status)){stats.conflicts++}else throw e}}
  }
  if(docs.length<100)break;cursor=docs.at(-1).name;
 }
 console.log(JSON.stringify(stats));if(stats.conflicts)process.exitCode=2;
})().catch(()=>{console.error('Member identity backfill stopped safely; no identity details logged.');process.exitCode=1});
