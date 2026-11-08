import { readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets = (await readdir('dist/assets')).filter(name => /\.(js|css)$/.test(name)).map(name => `/assets/${name}`);
const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0,12);
await writeFile('dist/sw.js', `const CACHE='handla-${version}';
const ASSETS=${JSON.stringify(['/', '/index.html', '/icon.svg', '/manifest.webmanifest', ...assets])};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('handla-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const request=event.request;const url=new URL(request.url);if(request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/__/'))return;
if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match('/index.html')));return;}
if(ASSETS.includes(url.pathname)){event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));}
});\n`);
