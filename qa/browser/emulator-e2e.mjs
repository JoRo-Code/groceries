import { chromium, expect } from '/Users/joro/src/smile/node_modules/@playwright/test/index.mjs';
import { randomUUID } from 'node:crypto';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const stamp=randomUUID(), password=`Qa-${randomUUID()}`;
const ownerContext=await browser.newContext({viewport:{width:1365,height:1000}});
const guestContext=await browser.newContext({viewport:{width:1365,height:1000}});
const owner=await ownerContext.newPage(),guest=await guestContext.newPage(),errors=[];
for(const p of [owner,guest]) { p.on('pageerror',error=>{errors.push(error.message);console.log('PAGEERROR',error.message)}); p.on('console',msg=>{if(msg.text().includes('HANDLA'))console.log(msg.text())}); }
const results=[];
const passed=title=>{results.push(title);console.log('PASS:',title)};
async function google(page,email){
 const opening=page.waitForEvent('popup');await page.getByRole('button',{name:'Fortsätt med Google',exact:true}).click();
 const popup=await opening;await popup.getByText('Add new account',{exact:true}).click();
 await popup.locator('#email-input').fill(email);await popup.locator('#display-name-input').fill('QA Handla');
 await popup.getByRole('button',{name:'Sign in with Provider',exact:true}).click();
 await popup.waitForEvent('close').catch(()=>{});
}
async function emailForm(page){await page.getByRole('button',{name:'Fortsätt med e-post',exact:true}).click()}
async function signup(page,email){await emailForm(page);await page.getByRole('button',{name:'Skapa konto',exact:true}).click();await page.getByLabel('E-postadress',{exact:true}).fill(email);await page.getByLabel('Lösenord',{exact:true}).fill(password);await page.getByRole('button',{name:'Skapa konto',exact:true}).click();}
async function row(page,name,checked=false,category='Mejeri & ägg') {return page.getByRole('button',{name:`${name}, ${checked?'köpt, lägg tillbaka':'bocka av'}, ${category}`,exact:true})}
try{
 await owner.goto('http://localhost:5173/');
 await expect(owner.getByRole('button',{name:'Fortsätt med Google',exact:true})).toBeEnabled();
 await expect(owner.getByRole('button',{name:'Fortsätt med Apple',exact:true})).toBeDisabled();
 await owner.screenshot({path:'qa/browser/auth-desktop.png',fullPage:true});
 await emailForm(owner);await owner.getByRole('button',{name:'Skapa konto',exact:true}).click();
 await owner.getByLabel('E-postadress',{exact:true}).fill(`owner-${stamp}@example.test`);
 await owner.getByLabel('Lösenord',{exact:true}).fill(password);
 await owner.getByRole('button',{name:'Skapa konto',exact:true}).click();
 await owner.getByLabel('Vad heter ert hushåll?').fill(`QA hushåll ${stamp.slice(0,6)}`);
 await owner.getByRole('button',{name:'Skapa hushåll',exact:false}).click();
 await expect(owner.getByRole('heading',{name:'Veckohandling',exact:true})).toBeVisible();passed('email signup and atomic workspace creation');
 await owner.getByRole('combobox',{name:'Lägg till en vara'}).fill('mj');
 await expect(owner.getByRole('listbox').getByRole('button').first()).toContainText('Mjölk');
 await owner.getByRole('listbox').getByRole('button').first().click();
 await expect(owner.locator('#new-category')).toHaveValue('dairy');
 await owner.getByLabel('Mängd för ny vara').fill('2 l');await owner.getByRole('button',{name:'Lägg till vara',exact:true}).click();
 await expect(await row(owner,'Mjölk')).toBeVisible();passed('catalogue suggestion category and quantity saved');
 await owner.getByRole('button',{name:/Hushållets medlemmar/}).click();
 await owner.getByRole('button',{name:'Skapa inbjudningslänk',exact:true}).click();
 await expect(owner.getByLabel('Inbjudningslänk',{exact:true})).toHaveValue(/\/join\/[a-f0-9-]{72}$/);
 const invitation=await owner.getByLabel('Inbjudningslänk',{exact:true}).inputValue();
 await owner.getByRole('button',{name:'Stäng',exact:true}).click();
 await guest.goto(invitation);await signup(guest,`guest-${stamp}@example.test`);
 await expect(guest.getByRole('dialog',{name:'Du är inbjuden'})).toBeVisible();
 await guest.getByRole('button',{name:'Anslut till hushållet',exact:true}).click();
 await expect(await row(guest,'Mjölk')).toBeVisible();passed('invitation survives email signup; guest joins shared list');
 await (await row(guest,'Mjölk')).click();
 await expect(await row(owner,'Mjölk',true)).toBeVisible();passed('guest checkoff syncs to owner');
 await owner.getByRole('button',{name:'Ändra Mjölk, mängd 2 l',exact:true}).click();
 await owner.locator('#edit-quantity').fill('3 l');await owner.locator('#edit-category').selectOption('pantry');
 await owner.getByRole('button',{name:'Spara ändringar',exact:true}).click();
 await expect(await row(guest,'Mjölk',true,'Skafferi')).toBeVisible();
 await expect(guest.getByRole('button',{name:'Ändra Mjölk, mängd 3 l',exact:true})).toBeVisible();passed('editing quantity/category syncs without losing checked state');
 await ownerContext.setOffline(true);
 await owner.getByRole('combobox',{name:'Lägg till en vara'}).fill('Bananer');
 await owner.getByLabel('Mängd för ny vara').fill('5 st');await owner.getByRole('button',{name:'Lägg till vara',exact:true}).click();
 await expect(await row(owner,'Bananer',false,'Frukt & grönt')).toBeVisible();
 await ownerContext.setOffline(false);
 await expect(await row(guest,'Bananer',false,'Frukt & grönt')).toBeVisible({timeout:20000});passed('offline edit visible locally and syncs after reconnect');
 await owner.getByRole('button',{name:'Ny lista',exact:true}).click();await owner.getByLabel('Listans namn').fill('Sommarstugan');
 await owner.getByRole('button',{name:'Skapa lista',exact:true}).click();
 await expect(guest.getByRole('navigation',{name:'Inköpslistor'}).getByRole('button',{name:'Sommarstugan',exact:true})).toBeVisible();passed('second list syncs to guest');
 await owner.getByRole('navigation',{name:'Inköpslistor'}).getByRole('button',{name:'Veckohandling',exact:true}).click();
 await owner.getByRole('button',{name:/Hushållets medlemmar/}).click();
 await owner.getByRole('button',{name:'Återkalla tidigare inbjudningslänk',exact:true}).click();
 await expect(owner.getByLabel('Inbjudningslänk',{exact:true})).toHaveCount(0);
 await owner.getByRole('button',{name:'Stäng',exact:true}).click();
 await guest.goto(invitation);await expect(guest.getByRole('alert')).toContainText(/inte tillgång|inbjudan/);passed('revoked invite cannot be opened again');
 await owner.getByRole('button',{name:/Hushållets medlemmar/}).click();await owner.getByRole('button',{name:/^Logga ut /}).click();
 await expect(owner.getByRole('button',{name:'Fortsätt med Google',exact:true})).toBeVisible();
 await expect(owner.getByRole('navigation',{name:'Inköpslistor'})).toHaveCount(0);
 await expect(owner.getByText(`QA hushåll ${stamp.slice(0,6)}`,{exact:true})).toHaveCount(0);
 await signup(owner,`outsider-${stamp}@example.test`);
 await expect(owner.getByRole('heading',{name:'Välkommen hem.',exact:true})).toBeVisible();
 await expect(owner.getByRole('navigation',{name:'Inköpslistor'})).toHaveCount(0);passed('logout clears household UI; different account sees no prior data');
 await owner.getByRole('button',{name:'Logga ut',exact:true}).click();await emailForm(owner);
 await owner.getByLabel('E-postadress',{exact:true}).fill(`owner-${stamp}@example.test`);await owner.getByLabel('Lösenord',{exact:true}).fill(password);
 await owner.getByRole('button',{name:'Logga in',exact:true}).click();
 await expect(owner.getByRole('navigation',{name:'Inköpslistor'}).getByRole('button',{name:'Sommarstugan',exact:true})).toBeVisible();passed('email signin restores original account workspace');
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({status:'passed',tests:results,productionWrites:false}));
}catch(error){console.error('OWNER:',(await owner.locator('body').innerText()).slice(0,5000));console.error('GUEST:',(await guest.locator('body').innerText()).slice(0,5000));await owner.screenshot({path:'qa/browser/e2e-failure-owner.png',fullPage:true});throw error}
finally{await ownerContext.setOffline(false);await browser.close()}
