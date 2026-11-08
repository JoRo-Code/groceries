import {useEffect,useMemo,useRef,useState} from 'react';
import * as api from './backend.js';
import {DAY_MS,timestampMillis,deduplicateItems,combineHistory,demoOlderPage} from './history.js';
const blankLive=key=>({key,active:[],recent:[],activeReady:false,recentReady:false,activeMeta:{},recentMeta:{}});
const blankHistory=(key,cutoff,expanded=false)=>({key,cutoff,items:[],cursor:null,expanded,hasMore:true,loading:false,error:''});

export function useShoppingHistory({userID,workspaceID,listID,demoItems,report}) {
 const enabled=!!(userID&&workspaceID&&listID);
 const key=enabled?`${userID}/${workspaceID}/${listID}`:'';
 const [cutoff,setCutoff]=useState(()=>Date.now()-DAY_MS);
 const [live,setLive]=useState(()=>blankLive(key));
 const [history,setHistory]=useState(()=>blankHistory(key,cutoff));
 const [optimisticState,setOptimistic]=useState(()=>({key,items:{}}));
 const optimistic=optimisticState.key===key?optimisticState.items:{};
 const historyRef=useRef(history);historyRef.current=history;
 const liveRef=useRef(live);liveRef.current=live;
 const context=useRef({key,cutoff});context.current={key,cutoff};
 const generation=useRef(0);const reportRef=useRef(report);reportRef.current=report;
 const demoRef=useRef(demoItems);demoRef.current=demoItems;
 const [historyRefresh,setHistoryRefresh]=useState(0);
 function updateHistory(value){historyRef.current=value;setHistory(value)}
 function updateOptimistic(transform){if(context.current.key===key)setOptimistic(previous=>({key,items:transform(previous.key===key?previous.items:{})}))}
 function clearOptimistic(id){updateOptimistic(previous=>{if(!previous[id])return previous;const next={...previous};delete next[id];return next})}
 function reconcile(rows,checked){
  const current=historyRef.current;
  const ids=new Set(rows.map(item=>item.id));
  if(current.key===key&&current.items.some(item=>ids.has(item.id)))updateHistory({...current,items:current.items.filter(item=>!ids.has(item.id))});
  updateOptimistic(previous=>{
   let changed=false;const next={...previous};
   for(const item of rows)if(next[item.id]?.checked===checked){delete next[item.id];changed=true}
   return changed?next:previous;
  });
 }
 useEffect(()=>{
  setLive(blankLive(key));setOptimistic({key,items:{}});setCutoff(Date.now()-DAY_MS);
  if(!enabled)return;
  const refresh=()=>{if(document.visibilityState==='visible')setCutoff(Date.now()-DAY_MS)};
  const timer=window.setInterval(()=>{if(!historyRef.current.expanded)refresh()},60000);
  document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh)};
 },[key]);
 useEffect(()=>{
  if(!enabled||demoItems!==undefined)return;
  let active=true;
  const stop=api.watchActiveItems(workspaceID,listID,(rows,meta)=>{
   if(!active)return;
   setLive(previous=>({...previous,key,active:rows,activeReady:true,activeMeta:meta??{}}));
   reconcile(rows,false);
  },error=>{if(active){reportRef.current(error);setLive(previous=>({...previous,key,activeReady:true}))}});
  return()=>{active=false;stop?.()};
 },[key]);
 useEffect(()=>{
  if(!enabled||demoItems!==undefined)return;
  let active=true;
  setLive(previous=>({...previous,key,recentReady:false}));
  const stop=api.watchRecentItems(workspaceID,listID,new Date(cutoff),(rows,meta)=>{
   if(!active)return;
   setLive(previous=>({...previous,key,recent:rows,recentReady:true,recentMeta:meta??{}}));
   reconcile(rows,true);
  },error=>{if(active){reportRef.current(error);setLive(previous=>({...previous,key,recentReady:true}))}});
  return()=>{active=false;stop?.()};
 },[key,cutoff]);
 useEffect(()=>{
  if(!enabled||demoItems===undefined)return;
  const active=demoItems.filter(item=>!item.checked);
  const recent=demoItems.filter(item=>item.checked&&timestampMillis(item.checkedAt)!=null&&timestampMillis(item.checkedAt)>=cutoff);
  setLive({key,active,recent,activeReady:true,recentReady:true,activeMeta:{},recentMeta:{}});
  reconcile(active,false);reconcile(recent,true);
 },[key,cutoff,demoItems]);
 useEffect(()=>{
  generation.current+=1;
  const previous=historyRef.current;
  const next=blankHistory(key,cutoff,previous.key===key&&previous.expanded);
  updateHistory(next);
  if(enabled&&next.expanded)fetchPage(next);
  return()=>{generation.current+=1};
 },[key,cutoff,historyRefresh]);
 async function fetchPage(current=historyRef.current) {
  if(!enabled||current.loading||!current.hasMore)return;
  const request=++generation.current;
  const expected={key,cutoff:current.cutoff};
  const loading={...current,expanded:true,loading:true,error:''};updateHistory(loading);
  try{
   const result=demoRef.current!==undefined?demoOlderPage(demoRef.current,current.cutoff,current.cursor??0):await api.listOlderItems(workspaceID,listID,new Date(current.cutoff),{cursor:current.cursor,pageSize:20});
   if(request!==generation.current||context.current.key!==expected.key||context.current.cutoff!==expected.cutoff)return;
   const latest=liveRef.current;
   const liveIDs=new Set(latest.key===key?[...latest.active,...latest.recent.filter(item=>timestampMillis(item.checkedAt)>=current.cutoff)].map(item=>item.id):[]);
   updateHistory({...loading,items:deduplicateItems([...current.items,...result.items]).filter(item=>!liveIDs.has(item.id)),cursor:result.cursor,hasMore:result.hasMore,loading:false});
  }catch(error){
   if(request!==generation.current||context.current.key!==expected.key)return;
   updateHistory({...loading,loading:false,error:'Historiken kunde inte hämtas. Kontrollera anslutningen och försök igen.'});
  }
 }
 const currentLive=live.key===key?live:blankLive(key);
 const currentHistory=history.key===key?history:blankHistory(key,cutoff);
 const combined=useMemo(()=>combineHistory(currentLive.active,currentLive.recent,currentHistory.items,optimistic,cutoff),[currentLive.active,currentLive.recent,currentHistory.items,optimistic,cutoff]);
 const metadata={hasPendingWrites:!!(currentLive.activeMeta.hasPendingWrites||currentLive.recentMeta.hasPendingWrites||Object.keys(optimistic).length),fromCache:!!(currentLive.activeMeta.fromCache||currentLive.recentMeta.fromCache)};
 return {
  ...combined,items:[...combined.active,...combined.recent,...combined.older],metadata,
  loading:enabled&&!(currentLive.activeReady&&currentLive.recentReady),
  history:currentHistory,loadOlder:()=>fetchPage(),
  refreshHistory:()=>{if(historyRef.current.expanded)setHistoryRefresh(value=>value+1)},
  patchOlderItem:item=>{const current=historyRef.current;if(current.key===key)updateHistory({...current,items:item.checked?current.items.map(value=>value.id===item.id?{...value,...item}:value):current.items.filter(value=>value.id!==item.id)})},
  dropOlderItem:id=>{const current=historyRef.current;if(current.key===key)updateHistory({...current,items:current.items.filter(item=>item.id!==id)})},
  markOptimistic:item=>updateOptimistic(previous=>({...previous,[item.id]:{...item,_pending:true}})),clearOptimistic
 };
}
