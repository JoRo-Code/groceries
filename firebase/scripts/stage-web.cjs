const fs=require('fs');
const path=require('path');
const source=path.resolve(__dirname,'../../web/dist');
const target=path.resolve(__dirname,'../hosting-dist');
if(!fs.existsSync(path.join(source,'index.html')))throw Error('Build web first: cd ../web && npm run build');
fs.rmSync(target,{recursive:true,force:true});
fs.cpSync(source,target,{recursive:true});
console.log('Staged final web/dist into firebase/hosting-dist.');
