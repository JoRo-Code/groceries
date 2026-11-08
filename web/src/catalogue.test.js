import test from 'node:test';
import assert from 'node:assert/strict';
import {builtIn,normalize,suggest,categoryFor,mergeCatalogue,categoryMap} from './catalogue.js';
test('all 309 native groceries have distinct normalized names and valid categories',()=>{
 assert.equal(builtIn.length,309);assert.equal(new Set(builtIn.map(p=>normalize(p.name))).size,309);
 assert.ok(builtIn.every(p=>categoryMap[p.category]));
});
test('suggestions ignore case, accents, repeated spaces; prefix matches come first',()=>{
 assert.equal(normalize('  CRÈME   FRAICHE '),'creme fraiche');
 assert.ok(suggest('mj').some(p=>p.name==='Mjölk'));
 assert.ok(normalize(suggest('mj')[0].name).startsWith('mj'));
 assert.equal(suggest('agg')[0].name,'Ägg');
});
test('workspace groceries override bundled spelling and category',()=>{
 const custom=[{name:'MJÖLK',category:'drinks'}];
 assert.equal(categoryFor('mjölk',custom),'drinks');
 assert.equal(mergeCatalogue(custom).filter(p=>normalize(p.name)==='mjolk').length,1);
});
test('changing a selected known product recomputes category, custom unknown falls back',()=>{
 assert.equal(categoryFor('Mjölk'),'dairy');assert.equal(categoryFor('Bananer'),'produce');
 assert.equal(categoryFor('Min egen vara'),'other');
});

test('opening hints are balanced, prioritize active items, and retain all catalogue/search entries',async()=>{
 const {defaultHints,suggest}=await import('./catalogue.js');
 const hints=defaultHints([], [{name:'Gurka',checked:false},{name:'Tomater',checked:false},{name:'Bananer',checked:false},{name:'Mjölk',checked:false},{name:'Ägg',checked:false}]);
 const counts={};for(const item of hints)counts[item.category]=(counts[item.category]??0)+1;
 assert.ok(Object.keys(counts).length>=5);assert.ok(Object.values(counts).every(count=>count<=4));
 assert.deepEqual(hints.filter(item=>item.category==='produce').slice(0,3).map(item=>item.name),['Bananer','Tomater','Gurka']);
 assert.ok(hints.some(item=>item.name==='Mjölk'));assert.ok(hints.some(item=>item.name==='Ägg'));
 assert.equal(mergeCatalogue().length,309);assert.equal(suggest('',[],400).length,309);
 const custom=[{name:'Min specialvara',category:'produce'}];
 assert.equal(defaultHints(custom,[{name:'Min specialvara',checked:false}])[0].name,'Min specialvara');
});
