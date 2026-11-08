import { chromium, expect } from '/Users/joro/src/smile/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const base='https://groceries-ros.web.app';
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}});
 await page.goto(base);
 await expect(page.getByRole('button',{name:'Fortsätt med Google',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Fortsätt med Apple',exact:true})).toBeEnabled();
 await expect(page.getByText('Apple-inloggning förbereds.',{exact:false})).toHaveCount(0);
 const opening=page.waitForEvent('popup');
 await page.getByRole('button',{name:'Fortsätt med Apple',exact:true}).click();
 const popup=await opening;
 await popup.waitForURL(url=>url.hostname==='appleid.apple.com',{timeout:30000});
 await popup.waitForLoadState('domcontentloaded');
 const target=new URL(popup.url());
 const body=await popup.locator('body').innerText();
 await popup.screenshot({path:'qa/browser/apple-authorization-start.png'});
 console.log(JSON.stringify({appleHost:target.hostname,clientId:target.searchParams.get('client_id'),returnURL:target.searchParams.get('redirect_uri'),authorizationPage:body.slice(0,900)}));
 if(/invalid_client|invalid_request|invalid redirect|configuration error/i.test(body))throw new Error('Apple authorization page reports invalid client or redirect configuration.');
 if(target.searchParams.get('client_id')!=='se.groceriesros.handla.web')throw new Error('Apple authorization used unexpected Services ID.');
 if(target.searchParams.get('redirect_uri')!=='https://groceries-ros.firebaseapp.com/__/auth/handler')throw new Error('Apple authorization used unexpected return URL.');
 await expect.poll(async()=>{for(const frame of popup.frames()){if(await frame.locator('input[type="text"]:visible, input[type="email"]:visible').count())return true;}return false;},{timeout:25000}).toBe(true);
 await popup.screenshot({path:'qa/browser/apple-authorization-start.png'});
 console.log(JSON.stringify({url:base,googleButtonEnabled:true,appleButtonEnabled:true,appleHost:target.hostname,applePath:target.pathname,clientId:target.searchParams.get('client_id'),returnURL:target.searchParams.get('redirect_uri'),appleSignInFormVisible:true,personalLoginAttempted:false,endToEndSignInVerified:false}));
 await popup.close();
 const aasa=await(await fetch(base+'/.well-known/apple-app-site-association')).json();
 expect(aasa.applinks.details[0].appIDs).toContain('P92GB9QRA5.se.groceriesros.handla');
 console.log(JSON.stringify({liveAASA:'P92GB9QRA5.se.groceriesros.handla'}));
}finally{await browser.close();}
