import {chromium,expect} from '/Users/joro/src/smile/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.HANDLA_QA_URL||'http://localhost:5173'}/?demo=1`);
 await page.getByRole('button',{name:'Hushållets medlemmar, 2',exact:true}).click();
 const roster=page.getByRole('list',{name:'Hushållets medlemmar',exact:true});
 await expect(roster.getByRole('listitem')).toHaveCount(2);
 await expect(roster.getByRole('listitem').nth(0)).toContainText('Alex Andersson');await expect(roster.getByRole('listitem').nth(0)).toContainText('Ägare · Du');
 await expect(roster.getByRole('listitem').nth(1)).toContainText('Kim Svensson');await expect(roster.getByRole('listitem').nth(1)).toContainText('Medlem');await expect(roster).not.toContainText('demo@example.test');
 expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:'qa/browser/members-mobile.png'});
 console.log(JSON.stringify({status:'passed',twoNames:true,roles:true,currentUser:true,noRedundantEmail:true,noOverflow:true,productionWrites:false}));
} finally {await browser.close()}
