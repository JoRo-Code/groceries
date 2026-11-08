const fs=require('fs');
const path=require('path');
const source=path.resolve(__dirname,'../../web/dist');
const target=path.resolve(__dirname,'../hosting-dist');
const appOnly=process.argv.includes('--app-only');
const legal=['privacy.html','support.html'];
if(!fs.existsSync(path.join(source,'index.html')))throw Error('Build web first: cd ../web && npm run build');
if(!appOnly)for(const file of legal){const page=path.join(source,file);if(fs.existsSync(page)&&/_PLACEHOLDER/.test(fs.readFileSync(page,'utf8')))throw Error('Do not publish privacy/support placeholders; supply verified operator and contact first.')}
fs.rmSync(target,{recursive:true,force:true});
fs.cpSync(source,target,{recursive:true,filter:file=>!appOnly||!legal.includes(path.basename(file))});
if(appOnly){
 const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../firebase.json'),'utf8'));
 config.hosting.rewrites=config.hosting.rewrites.filter(rule=>!['/privacy','/support'].includes(rule.source));
 fs.writeFileSync(path.resolve(__dirname,'../firebase.app-only.generated.json'),JSON.stringify(config,null,2)+'\n');
 console.log('Staged app only; draft legal pages excluded, existing SPA fallback retained. Deploy with --config firebase.app-only.generated.json --only hosting.');
}else console.log('Staged final web/dist into firebase/hosting-dist.');
