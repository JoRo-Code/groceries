export const DAY_MS=24*60*60*1000;
export function timestampMillis(value) {
 if(value==null)return null;
 let millis;
 if(typeof value.toMillis==='function')millis=value.toMillis();
 else if(value instanceof Date)millis=value.getTime();
 else if(typeof value==='number')millis=value;
 else if(typeof value.seconds==='number')millis=value.seconds*1000+(value.nanoseconds??0)/1e6;
 else return null;
 return Number.isFinite(millis)?millis:null;
}
export function formatItemDate(value) {
 const millis=timestampMillis(value);
 return millis==null?'Datum saknas':new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(millis));
}
export function deduplicateItems(items) {return [...new Map(items.map(item=>[item.id,item])).values()]}
export function historyOrder(a,b) {
 const left=timestampMillis(a.checkedAt),right=timestampMillis(b.checkedAt);
 if(left==null&&right!=null)return 1;if(right==null&&left!=null)return -1;
 return (right??0)-(left??0)||a.id.localeCompare(b.id);
}
export function combineHistory(active,recent,older,optimistic,cutoff) {
 // More current sources override paged snapshots; a restored item is never shown twice.
 const merged=deduplicateItems([...older,...recent,...active,...Object.values(optimistic)]);
 return {
  active:merged.filter(item=>!item.checked),
  recent:merged.filter(item=>item.checked&&(item._pending||timestampMillis(item.checkedAt)>=cutoff&&timestampMillis(item.checkedAt)!=null)).sort(historyOrder),
  older:merged.filter(item=>item.checked&&!item._pending&&(timestampMillis(item.checkedAt)==null||timestampMillis(item.checkedAt)<cutoff)).sort(historyOrder)
 };
}
export function demoOlderPage(items,cutoff,cursor=0,pageSize=20) {
 const older=items.filter(item=>item.checked&&(timestampMillis(item.checkedAt)==null||timestampMillis(item.checkedAt)<cutoff)).sort(historyOrder);
 return {items:older.slice(cursor,cursor+pageSize),cursor:cursor+pageSize,hasMore:older.length>cursor+pageSize};
}
