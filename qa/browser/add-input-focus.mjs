import {chromium,expect} from '/Users/joro/src/smile/node_modules/@playwright/test/index.mjs';
const base=process.env.HANDLA_QA_URL||'http://localhost:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const checks=[];
try {
 for(const device of [
  {name:'desktop',viewport:{width:1280,height:900}},
  {name:'mobile-emulated',viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}
 ]) {
  const {name,...contextOptions}=device;
  const context=await browser.newContext(contextOptions);
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/?demo=1`);
  const search=page.getByRole('searchbox',{name:'Sök eller lägg till vara',exact:true});
  const openAdd=async()=>{
   const before=await page.locator('.new-item-field').boundingBox();
   await page.getByRole('button',{name:'Ny vara',exact:true}).click();
   await expect(search).toBeFocused();
   const after=await page.locator('.new-item-field').boundingBox();
   for(const coordinate of ['x','y','width','height'])expect(Math.abs(before[coordinate]-after[coordinate])).toBeLessThan(1);
   await expect(page.getByRole('button',{name:'Tillbaka till inköpslistan',exact:true})).toHaveCount(0);
  };
  const activeRow=product=>page.getByRole('list',{name:'Varor att handla',exact:true}).locator('li').filter({has:page.getByRole('button',{name:new RegExp(`^${product}, bocka av,`)})});
  const revealed=async product=>{
   await expect(search).toHaveCount(0);
   const row=activeRow(product);
   await expect(row).toHaveCount(1);
   await expect(row).toHaveClass(/recently-added/);
   await expect(row).toBeInViewport();
   return row;
  };
  await openAdd();
  // Type without fill/focus(): the first click must have focused the field.
  await page.keyboard.type('palstern');
  await expect(search).toHaveValue('palstern');
  await page.getByRole('button',{name:'Palsternacka, lägg till, Frukt & grönt',exact:true}).click();
  await revealed('Palsternacka');
  await expect(activeRow('Palsternacka')).not.toHaveClass(/recently-added/,{timeout:4000});
  await openAdd();
  await expect(search).toHaveValue('');
  await page.keyboard.type('Min specialvara');
  await page.getByRole('textbox',{name:'Mängd för ny vara',exact:true}).fill('3 pkt');
  await page.locator('#new-category').selectOption('pantry');
  await page.getByRole('button',{name:'Min specialvara',exact:true}).click();
  await revealed('Min specialvara');
  await expect(page.getByRole('button',{name:'Ändra Min specialvara, mängd 3 pkt',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ändra Min specialvara, mängd 3 pkt',exact:true}).click();
  await page.locator('#edit-category').selectOption('household');
  await page.getByRole('button',{name:'Spara ändringar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Min specialvara, bocka av, Hem & städ',exact:true})).toBeVisible();
  await openAdd();
  await page.getByRole('button',{name:'Mjölk, redan på listan, Mejeri & ägg',exact:true}).click();
  await revealed('Mjölk');
  await openAdd();
  await page.keyboard.type('Mjölk');
  await page.getByRole('button',{name:'Tillagd: Mjölk',exact:true}).click();
  await revealed('Mjölk');
  await openAdd();
  await page.getByRole('button',{name:'Bröd, lägg till, Bröd & bageri',exact:true}).click();
  await revealed('Bröd');
  await expect(page.getByRole('list',{name:'Köpta varor',exact:true}).getByRole('button',{name:/^Bröd,/})).toHaveCount(0);
  await openAdd();
  await page.keyboard.type('Entervara');
  await page.keyboard.press('Enter');
  await revealed('Entervara');
  await openAdd();
  await expect(search).toBeFocused();
  await page.getByRole('button',{name:'Stäng lägg till vara',exact:true}).click();
  await page.getByRole('button',{name:'Fler alternativ',exact:true}).click();
  await page.getByRole('button',{name:'Byt namn',exact:true}).click();
  const rename=page.getByRole('textbox',{name:'Listans namn',exact:true});
  await expect(rename).toHaveValue('Veckohandling');
  await expect(rename).toHaveAttribute('maxlength','80');
  await rename.fill('   ');
  await expect(page.getByRole('button',{name:'Spara namn',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Avbryt',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Veckohandling',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Fler alternativ',exact:true}).click();
  await page.getByRole('button',{name:'Byt namn',exact:true}).click();
  await rename.fill('  Familjens inköp  ');
  await page.getByRole('button',{name:'Spara namn',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Familjens inköp',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mina listor, 2 listor',exact:true}).click();
  await page.getByRole('navigation',{name:'Inköpslistor',exact:true}).getByRole('button',{name:/^Familjens inköp/}).click();
  await expect(page.getByRole('heading',{name:'Familjens inköp',exact:true})).toBeVisible();
  await openAdd();
  await page.keyboard.type('Osparad egen vara');
  await page.locator('#new-category').selectOption('hygiene');
  await page.keyboard.press('Tab');
  await expect(search).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new Event('handla:update-ready')));
  await expect(page.getByRole('button',{name:'Uppdatera',exact:true})).toBeVisible();
  await expect(search).toHaveValue('Osparad egen vara');
  // Blank-background dragging must not dismiss; an actual blank tap should.
  const blank=await page.locator('.search-content').boundingBox();
  const x=blank.x+30,y=Math.min(blank.y+blank.height-25,device.viewport.height-25);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+30,y-20);await page.mouse.up();
  await expect(search).toBeVisible();
  await page.mouse.click(x,y);
  await expect(search).toHaveCount(0);
  expect(errors).toEqual([]);
  checks.push({device:name,immediateFocus:true,chipReturn:true,customQuantityReturn:true,existingNoDuplicate:true,checkedRestored:true,enterReturn:true,temporaryHighlight:true,focusAfterReopen:true,renameTrimAndOverview:true,blankRenameRejected:true,renameCancel:true,stableInputRectangle:true,customCategoryCreateAndEdit:true,blankCloseAndDragGuard:true,updatePreservesDraft:true});
  await context.close();
 }
 console.log(JSON.stringify({status:'passed',checks,realIOSSoftwareKeyboardVerified:false,productionWrites:false}));
} finally {await browser.close()}
