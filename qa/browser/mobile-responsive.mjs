import {chromium,expect} from '/Users/joro/src/smile/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const base=process.env.HANDLA_QA_URL||'http://localhost:5173';
const results=[];
try {
 for(const width of [320,375,390,430,1280]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<700,hasTouch:width<700,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const overflow=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto(`${base}/?demo=1&history=1`);
  await expect(page.getByRole('heading',{name:'Veckohandling',exact:true})).toBeVisible();await overflow();
  expect(await page.locator('.grocery-row').first().evaluate(el=>getComputedStyle(el,'::before').width)).toBe('8px');
  if([320,390,1280].includes(width))await page.screenshot({path:`qa/browser/mobile-${width}-list.png`,fullPage:true});
  const before=await page.locator('.new-item-field').boundingBox();
  await page.getByRole('button',{name:'Ny vara',exact:true}).click();
  const search=page.getByRole('searchbox',{name:'Sök eller lägg till vara',exact:true});await expect(search).toBeFocused();
  const after=await page.locator('.new-item-field').boundingBox();for(const key of ['x','y','width','height'])expect(Math.abs(before[key]-after[key])).toBeLessThan(1);
  await overflow();
  expect(await page.locator('.grocery-chip').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44))).toBe(true);
  if([320,390].includes(width))await page.screenshot({path:`qa/browser/mobile-${width}-hints.png`,fullPage:true});
  const longName='Extra lång specialvara med osötad havredryck och hushållspapper';
  const longQuantity='12 förpackningar à 750 milliliter till hela familjen';
  await search.fill(longName);await page.getByLabel('Mängd för ny vara').fill(longQuantity);await page.locator('#new-category').selectOption('household');await overflow();
  if(width===320)await page.screenshot({path:'qa/browser/mobile-320-custom.png',fullPage:true});
  await page.getByRole('button',{name:longName,exact:true}).click();
  await expect(page.getByRole('button',{name:`Ändra ${longName}, mängd ${longQuantity}`,exact:true})).toBeVisible();await overflow();
  await page.getByRole('button',{name:`Ändra ${longName}, mängd ${longQuantity}`,exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.setViewportSize({width,height:420});await page.getByRole('button',{name:'Spara ändringar',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Spara ändringar',exact:true})).toBeInViewport();
  await page.getByRole('button',{name:'Spara ändringar',exact:true}).click();await page.setViewportSize({width,height:844});
  await page.getByRole('button',{name:'Hushållets medlemmar, 2',exact:true}).click();
  await expect(page.getByRole('list',{name:'Hushållets medlemmar',exact:true}).getByRole('listitem')).toHaveCount(2);
  expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await overflow();
  if([320,390].includes(width))await page.screenshot({path:`qa/browser/mobile-${width}-household.png`});
  await page.getByRole('button',{name:'Stäng',exact:true}).click();
  await page.getByRole('button',{name:'Mina listor, 2 listor',exact:true}).click();await expect(page.getByRole('heading',{name:'Mina listor',exact:true})).toBeVisible();await overflow();
  if(width===390)await page.screenshot({path:'qa/browser/mobile-390-overview.png'});
  expect(errors).toEqual([]);results.push({width,status:'passed',stripe:8,stableComposer:true,noHorizontalOverflow:true,longContent:true,shortViewportDialog:true,household:true});await context.close();
 }
 console.log(JSON.stringify({status:'passed',results,productionWrites:false}));
}finally{await browser.close()}
