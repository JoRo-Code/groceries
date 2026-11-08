import groceries from './groceries.json' with { type: 'json' };
export const categories = [
  ['produce', 'Frukt & grönt', '#75a94c'], ['dairy', 'Mejeri & ägg', '#72b6d8'],
  ['meat', 'Kött & fågel', '#d97d83'], ['fish', 'Fisk & skaldjur', '#60b5b6'],
  ['bakery', 'Bröd & bageri', '#cda165'], ['pantry', 'Skafferi', '#dfbc52'],
  ['frozen', 'Fryst', '#8b9acb'], ['drinks', 'Dryck', '#aa87b8'],
  ['snacks', 'Godis & snacks', '#dc9566'], ['household', 'Hem & städ', '#8f9ca8'],
  ['hygiene', 'Hygien', '#ca91ae'], ['other', 'Övrigt', '#b3b1a9']
].map(([id,title,color],order)=>({id,title,color,order}));
export const categoryMap = Object.fromEntries(categories.map(item=>[item.id,item]));
export const normalize = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('sv-SE').trim().replace(/\s+/g,' ');
const alphabetic = (a,b) => normalize(a.name).localeCompare(normalize(b.name),'sv') || a.name.localeCompare(b.name,'sv');
export const builtIn = groceries;
export const inferCategory = name => groceries.find(item=>normalize(item.name)===normalize(name))?.category ?? 'other';
export function mergeCatalogue(custom=[]) {
  const entries = new Map(groceries.map(item=>[normalize(item.name),item]));
  // Canonical category-aware records win over older document IDs for the same name.
  const ordered = [...custom].filter(item=>typeof item.name==='string'&&item.name.trim()).sort((a,b)=>
    Number(!!a.canonical)-Number(!!b.canonical) || Number(!!categoryMap[a.category])-Number(!!categoryMap[b.category]) || alphabetic(a,b));
  for (const item of ordered) {
    const name=item.name.trim();
    entries.set(normalize(name),{name,category:categoryMap[item.category]?item.category:inferCategory(name)});
  }
  return [...entries.values()].sort(alphabetic);
}
export function suggest(query,custom=[],limit=6) {
  const needle=normalize(query);
  return mergeCatalogue(custom).filter(item=>normalize(item.name).includes(needle)).sort((a,b)=>
    Number(normalize(b.name).startsWith(needle))-Number(normalize(a.name).startsWith(needle)) || alphabetic(a,b)).slice(0,limit);
}
export function categoryFor(name,custom=[]) {
  return mergeCatalogue(custom).find(item=>normalize(item.name)===normalize(name))?.category ?? 'other';
}
export function sortItems(items) {
  return [...items].sort((a,b)=>(categoryMap[a.category]?.order??11)-(categoryMap[b.category]?.order??11)||alphabetic(a,b));
}

// The opening screen is a short set of useful hints, not the entire dictionary.
// Full catalogue mode and typed searches still include every bundled/custom item.
const essentials = {
 produce:['Bananer','Tomater','Gurka','Äpplen'],
 dairy:['Mjölk','Ägg','Smör','Ost'],
 meat:['Kycklingfilé','Nötfärs','Bacon','Falukorv'],
 fish:['Lax','Räkor','Torsk','Sej'],
 bakery:['Bröd','Knäckebröd','Frallor','Tortillabröd'],
 pantry:['Pasta','Ris','Havregryn','Krossade tomater'],
 frozen:['Frysta ärtor','Glass','Fryst broccoli','Frysta bär'],
 drinks:['Kaffe','Te','Juice','Mineralvatten'],
 snacks:['Choklad','Chips','Nötter','Popcorn'],
 household:['Toalettpapper','Diskmedel','Tvättmedel','Hushållspapper'],
 hygiene:['Tandkräm','Schampo','Tvål','Deodorant'],
 other:[]
};
export function defaultHints(custom=[],items=[],limitPerCategory=4) {
 const catalogue=mergeCatalogue(custom);
 const active=new Set(items.filter(item=>!item.checked).map(item=>normalize(item.name)));
 return categories.flatMap(category=>{
  const common=(essentials[category.id]??[]).map(normalize);
  const rank=item=>{const index=common.indexOf(normalize(item.name));return index<0?1000:index};
  return catalogue.filter(item=>item.category===category.id).sort((a,b)=>
   Number(active.has(normalize(b.name)))-Number(active.has(normalize(a.name))) || rank(a)-rank(b) || alphabetic(a,b)
  ).slice(0,limitPerCategory);
 });
}
