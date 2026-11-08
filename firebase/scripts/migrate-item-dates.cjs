// Additive, preconditioned migration; default is dry-run. Never logs grocery/user contents.
const {selectAccount,setActiveAccount}=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {Client}=require('firebase-tools/lib/apiv2');
(async()=>{
 const emulator=process.argv.includes('--emulator');
 const project=emulator?'demo-handla':'groceries-ros',apply=process.argv.includes('--apply');
 const options={project,projectId:project,projectRoot:process.cwd()};
 if(!emulator){const account=selectAccount(undefined,process.cwd());if(!account)throw Error('Firebase login required');
 setActiveAccount(options,account);await requireAuth(options);}
 const client=new Client({urlPrefix:emulator?'http://127.0.0.1:8185':'https://firestore.googleapis.com',apiVersion:'v1',auth:!emulator});
 const root=`projects/${project}/databases/(default)/documents`;
 const requestOptions={skipLog:{body:true,resBody:true},...(emulator?{headers:{Authorization:'Bearer owner'}}:{})};
 const stats={project,mode:apply?'apply':'dry-run',scanned:0,missingCreatedAt:0,missingCheckedAt:0,unknownCompleted:0,planned:0,updated:0,conflicts:0};
 let cursor;
 for(;;){
  const structuredQuery={from:[{collectionId:'items',allDescendants:true}],orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:200};
  if(cursor)structuredQuery.startAt={values:[{referenceValue:cursor}],before:false};
  const rows=(await client.post(`${root}:runQuery`,{structuredQuery},requestOptions)).body;
  const docs=rows.filter(r=>r.document).map(r=>r.document);
  for(const d of docs){
   if(!d.name.startsWith(root+'/workspaces/')||!/^workspaces\/[^/]+\/lists\/[^/]+\/items\/[^/]+$/.test(d.name.slice(root.length+1)))throw Error('Unexpected item path; migration stopped');
   stats.scanned++;const fields={};
   if(!d.fields?.createdAt){if(!d.createTime)throw Error('Missing authoritative createTime');fields.createdAt={timestampValue:d.createTime};stats.missingCreatedAt++}
   if(!d.fields?.checkedAt){fields.checkedAt={nullValue:null};stats.missingCheckedAt++}
   if(d.fields?.checked?.booleanValue===true&&(!d.fields.checkedAt||'nullValue'in d.fields.checkedAt))stats.unknownCompleted++;
   if(!Object.keys(fields).length)continue;stats.planned++;
   if(apply){try{
    await client.post(`${root}:commit`,{writes:[{update:{name:d.name,fields},updateMask:{fieldPaths:Object.keys(fields)},currentDocument:{updateTime:d.updateTime}}]},requestOptions);stats.updated++;
   }catch(e){if([409,412].includes(e.status)||['ABORTED','FAILED_PRECONDITION'].includes(e.context?.body?.error?.status)){stats.conflicts++;}else throw e}}
  }
  if(docs.length<200)break;cursor=docs.at(-1).name;
 }
 console.log(JSON.stringify(stats));if(stats.conflicts)process.exitCode=2;
})().catch(()=>{console.error('Migration stopped; no document contents logged. Inspect authenticated project/API state before retry.');process.exitCode=1;});
