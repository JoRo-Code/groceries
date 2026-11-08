import {chromium,expect} from '/Users/joro/src/smile/node_modules/@playwright/test/index.mjs';
const base=process.env.HANDLA_QA_URL||'http://127.0.0.1:4179';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?demo=1`);
 await page.getByRole('button',{name:'Ändra Bananer, mängd 6 st',exact:true}).click();
 await expect(page.locator('.item-dates>div').first()).toContainText('Kim Svensson');
 await expect(page.locator('.item-dates>div').last()).toContainText('Du');
 await expect(page.getByText('Äldre appversioner registrerar inte vem som ändrat.',{exact:true})).toBeVisible();
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/handla-item-attribution-web.png'});
 await page.getByLabel('Mängd',{exact:true}).fill('8 st');
 await page.getByRole('button',{name:'Spara ändringar',exact:true}).click();
 await page.getByRole('button',{name:'Ändra Bananer, mängd 8 st',exact:true}).click();
 await expect(page.locator('.item-dates>div').first()).toContainText('Kim Svensson');
 await expect(page.locator('.item-dates>div').last()).toContainText('Du');
 expect(errors).toEqual([]);
 console.log(JSON.stringify({passed:true,creatorPreserved:true,lastEditorVisible:true,widths:[320,390,1280],noOverflow:true,pageErrors:0}));
}finally{await browser.close()}
