const fs=require('fs');
const path=require('path');
const source=path.resolve(__dirname,'../../web/dist');
const target=path.resolve(__dirname,'../hosting-dist');
if(!fs.existsSync(path.join(source,'index.html')))throw Error('Build web first: cd ../web && npm run build');
for(const file of ['privacy.html','support.html']){
 const page=path.join(source,file);
 if(fs.existsSync(page)&&/_PLACEHOLDER/.test(fs.readFileSync(page,'utf8')))throw Error('Do not publish privacy/support placeholders; supply verified operator and contact first.');
}
fs.rmSync(target,{recursive:true,force:true});
fs.cpSync(source,target,{recursive:true});
console.log('Staged final web/dist into firebase/hosting-dist.');
