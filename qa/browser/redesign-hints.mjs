import {chromium,expect} from '/Users/joro/src/smile/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 await page.goto('http://localhost:5173/?demo=1');
 await page.getByRole('button',{name:'Ny vara',exact:true}).click();
 const chips=page.locator('.grocery-chip');
 const initialCount=await chips.count();
 expect(initialCount).toBeGreaterThan(25);expect(initialCount).toBeLessThanOrEqual(48);
 await expect(page.getByRole('button',{name:'Mjölk, redan på listan, Mejeri & ägg',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Bananer, redan på listan, Frukt & grönt',exact:true})).toHaveAttribute('aria-pressed','true');
 const colors=await chips.evaluateAll(nodes=>new Set(nodes.filter(node=>node.getBoundingClientRect().top<innerHeight).map(node=>node.style.backgroundColor)).size);
 expect(colors).toBeGreaterThanOrEqual(5);
 await page.screenshot({path:'qa/browser/redesign-add-mobile.png'});
 await page.getByRole('button',{name:'Visa kategorier',exact:true}).click();
 await expect(chips).toHaveCount(309);
 await page.getByRole('button',{name:'Visa kategorier',exact:true}).click();
 await expect(chips).toHaveCount(initialCount);
 await page.getByRole('searchbox',{name:'Sök eller lägg till vara',exact:true}).fill('palstern');
 await expect(page.getByRole('button',{name:'Palsternacka, lägg till, Frukt & grönt',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Palsternacka, lägg till, Frukt & grönt',exact:true}).click();
 await expect(page.getByRole('button',{name:'Palsternacka, redan på listan, Frukt & grönt',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Klart',exact:true}).click();
 await expect(page.getByRole('button',{name:'Palsternacka, bocka av, Frukt & grönt',exact:true})).toBeVisible();
 console.log(JSON.stringify({status:'passed',defaultHintCount:initialCount,visibleCategoryColors:colors,fullCatalogue:309,deepSearchAndAdd:true,screenshot:'qa/browser/redesign-add-mobile.png'}));
}finally{await browser.close()}
