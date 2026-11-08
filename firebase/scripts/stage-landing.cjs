const fs=require('node:fs');const path=require('node:path');
const source=path.resolve(__dirname,'../../landing'),target=path.resolve(__dirname,'../landing-dist');
if(!fs.existsSync(path.join(source,'index.html')))throw Error('Landing source missing');
fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});
for(const name of ['index.html','styles.css','main.js','icon.svg'])fs.copyFileSync(path.join(source,name),path.join(target,name));
console.log('Staged reviewed static landing assets.');
