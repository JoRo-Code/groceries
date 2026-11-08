import {chromium,expect} from '/Users/joro/src/smile/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 for(const route of ['privacy','support']){
  const response=await page.goto(`https://groceries-ros.web.app/${route}`);expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('text/html');
  await expect(page.locator('h1')).toHaveText(route==='privacy'?'Din integritet i Handla':'Hjälp med Handla');
  await expect(page.locator('main')).toContainText('NorthSoft HB');await expect(page.locator('a[href="mailto:jonas@rosengren.info"]')).toHaveCount(1);
  expect(await page.locator('body').innerText()).not.toMatch(/PLACEHOLDER|707752750/);expect(await page.locator('#root').count()).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`qa/browser/public-${route}-mobile.png`,fullPage:true});
 }
 await page.goto('https://groceries-ros.web.app/');const scripts=await page.locator('script[src]').evaluateAll(xs=>xs.map(x=>new URL(x.src).pathname));expect(scripts).toContain('/assets/index-CKXYs7Pg.js');
 console.log(JSON.stringify({passed:true,publicWithoutLogin:true,privacyAndSupport:true,operatorAndContact:true,noPlaceholdersOrPrivatePhone:true,mobileNoOverflow:true,originalApplicationArtifactPreserved:true}));
}finally{await browser.close()}
