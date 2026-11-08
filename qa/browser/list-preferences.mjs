import {chromium,expect} from '/Users/joro/src/smile/node_modules/@playwright/test/index.mjs';
import {createBackend} from '../../web/src/backend.js';
import {getDoc,doc,terminate} from '../../web/node_modules/firebase/firestore/dist/index.mjs';
import {deleteApp} from '../../web/node_modules/firebase/app/dist/index.mjs';
const api=createBackend({projectId:'demo-handla'},{appName:`list-prefs-${crypto.randomUUID()}`,emulators:true});
const email=`lists-${crypto.randomUUID()}@example.test`,password='TestPassword123!';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 await api.signUp(email,password);const w=await api.createWorkspace('List preference QA');const first=await api.addList(w,'Första listan'),second=await api.addList(w,'Andra listan');await api.setLastViewedList(w,first);
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:52861');await page.getByRole('button',{name:'Fortsätt med e-post',exact:true}).click();await page.getByLabel('E-postadress',{exact:true}).fill(email);await page.getByLabel('Lösenord',{exact:true}).fill(password);await page.getByRole('button',{name:'Logga in',exact:true}).click();await expect(page.getByRole('heading',{name:'Första listan',exact:true})).toBeVisible();
 const before=(await getDoc(doc(api.db,'workspaces',w,'lists',second))).data().lastChangedAt;
 await page.getByRole('button',{name:/^Mina listor,/}).click();const rows=page.getByRole('navigation',{name:'Inköpslistor'}).getByRole('button');await expect(rows.first()).toContainText('Andra listan');await rows.filter({hasText:'Andra listan'}).click();await expect(page.getByRole('heading',{name:'Andra listan',exact:true})).toBeVisible();
 await expect.poll(async()=>(await getDoc(doc(api.db,'users',api.auth.currentUser.uid))).data().lastViewedListID).toBe(second);
 expect((await getDoc(doc(api.db,'workspaces',w,'lists',second))).data().lastChangedAt.isEqual(before)).toBe(true);
 await api.addItem(w,first,{name:'Ny vara',quantity:'1',category:'other'});await expect(page.getByRole('heading',{name:'Andra listan',exact:true})).toBeVisible();await page.getByRole('button',{name:/^Mina listor,/}).click();await expect(rows.first()).toContainText('Första listan');await page.getByRole('button',{name:'Tillbaka till inköpslistan',exact:true}).click();await page.reload();await expect(page.getByRole('heading',{name:'Andra listan',exact:true})).toBeVisible();
 await api.setLastViewedList(w,first);await expect(page.getByRole('heading',{name:'Andra listan',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Första listan',exact:true})).toBeVisible();
 console.log(JSON.stringify({status:'passed',sharedMostRecentlyChanged:true,viewDoesNotReorder:true,personalPreferenceSurvivesReload:true,remotePreferenceDoesNotJumpCurrentSelection:true,otherDevicePreferenceUsedNextStart:true,productionWrites:false}));
}finally{await browser.close();await terminate(api.db);await deleteApp(api.app)}
