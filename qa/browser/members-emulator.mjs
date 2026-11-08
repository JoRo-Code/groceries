import {chromium,expect} from '/Users/joro/src/smile/node_modules/@playwright/test/index.mjs';
import {createBackend} from '../../web/src/backend.js';
import {updateProfile} from '../../web/node_modules/firebase/auth/dist/index.mjs';
import {terminate,getDocs,collection} from '../../web/node_modules/firebase/firestore/dist/index.mjs';
import {deleteApp} from '../../web/node_modules/firebase/app/dist/index.mjs';
import {execFileSync} from 'node:child_process';
const stamp=crypto.randomUUID(),password='TestPassword123!';
const services=['owner','guest','outsider'].map(role=>createBackend({projectId:'demo-handla'},{appName:`member-${role}-${stamp}`,emulators:true}));
const [owner,guest,outsider]=services;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 for(let i=0;i<services.length;i++)await services[i].signUp(`member-${i}-${stamp}@example.test`,password);
 await updateProfile(owner.auth.currentUser,{displayName:'Anna QA'});await updateProfile(guest.auth.currentUser,{displayName:'Robin QA'});
 const workspace=await owner.createWorkspace('Member QA');const token=(await owner.createInvite(workspace)).split('/').at(-1);await guest.joinWorkspace(token);
 let denied=false;try{await getDocs(collection(outsider.db,'workspaces',workspace,'members'))}catch(e){denied=e.code==='permission-denied'}expect(denied).toBe(true);
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5174');await page.getByRole('button',{name:'Fortsätt med e-post',exact:true}).click();await page.getByLabel('E-postadress',{exact:true}).fill(`member-0-${stamp}@example.test`);await page.getByLabel('Lösenord',{exact:true}).fill(password);await page.getByRole('button',{name:'Logga in',exact:true}).click();
 await page.getByRole('button',{name:'Hushållets medlemmar, 2',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByText('Anna QA',{exact:true})).toBeVisible();await expect(dialog.getByText('Robin QA',{exact:true})).toBeVisible();await expect(dialog.getByText('Ägare · Du',{exact:true})).toBeVisible();
 const path=`projects/demo-handla/databases/(default)/documents/workspaces/${workspace}/members/${guest.auth.currentUser.uid}`;
 const response=await fetch('http://127.0.0.1:8185/v1/projects/demo-handla/databases/(default)/documents:commit',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({writes:[{update:{name:path,fields:{}},updateMask:{fieldPaths:['displayName']}}]})});expect(response.status).toBe(200);
 await expect(dialog.getByText('Medlem utan namn',{exact:true})).toBeVisible();
 const stats=JSON.parse(execFileSync(process.execPath,['scripts/backfill-member-identities.cjs','--emulator','--apply'],{cwd:new URL('../../firebase',import.meta.url),encoding:'utf8'}));expect(stats.updated).toBeGreaterThanOrEqual(1);expect(stats.conflicts).toBe(0);
 await expect(dialog.getByText('Robin QA',{exact:true})).toBeVisible();await expect(dialog.getByText('Medlem utan namn',{exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Skapa inbjudningslänk',exact:true})).toBeVisible();expect(errors).toEqual([]);
 console.log(JSON.stringify({status:'passed',namedOwnerAndGuest:true,currentUserMarker:true,outsiderDenied:true,legacyAdminBackfillAppearsLive:true,invitePreserved:true,productionWrites:false}));
}finally{await browser.close();await Promise.all(services.map(s=>terminate(s.db)));await Promise.all(services.map(s=>deleteApp(s.app)))}
