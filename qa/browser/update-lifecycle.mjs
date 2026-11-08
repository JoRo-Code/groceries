import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,expect} from '/Users/joro/src/smile/node_modules/@playwright/test/index.mjs';
let version=1;
const dist=resolve('web/dist');
const server=createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const path=resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));if(!path.startsWith(dist+'/')){res.writeHead(403).end();return}
 const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json'}[extname(path)]??'application/octet-stream';
 let body=await readFile(path);if(pathname==='/sw.js')body=Buffer.concat([body,Buffer.from(`\n// lifecycle test version ${version}\n`)]);
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'}).end(body);
}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/?demo=1`);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}))});
 await page.getByRole('button',{name:'Ny vara',exact:true}).click();const input=page.getByRole('searchbox',{name:'Sök eller lägg till vara',exact:true});await input.fill('Osparat utkast');
 const navigationCount=await page.evaluate(()=>performance.getEntriesByType('navigation').length);
 version=2;await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update()});
 await expect(page.getByText('En uppdatering finns.',{exact:false})).toBeVisible();
 await expect(input).toHaveValue('Osparat utkast');expect(await page.evaluate(()=>performance.getEntriesByType('navigation').length)).toBe(navigationCount);
 console.log(JSON.stringify({status:'passed',firstInstallThenUpdateDetected:true,draftPreserved:true,noAutomaticReload:true}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
