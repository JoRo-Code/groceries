import React, {useEffect, useId, useMemo, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import * as api from './backend.js';
import {invitationToken} from './inviteLinks.js';
import {useShoppingHistory} from './useShoppingHistory.js';
import {DAY_MS,timestampMillis,formatItemDate} from './history.js';
import {categories, categoryMap, categoryFor, normalize, suggest, sortItems, mergeCatalogue, defaultHints} from './catalogue.js';

const TOKEN=/^[a-f0-9-]{72}$/;
const DEMO=new URLSearchParams(location.search).get('demo')==='1';
const demoLists=[{id:'week',name:'Veckohandling'},{id:'weekend',name:'Till helgen'}];
const demoCreatedAt=new Date(Date.now()-3*DAY_MS);
const demoItems=[
 {id:'banana',name:'Bananer',quantity:'6 st',category:'produce',checked:false},
 {id:'cucumber',name:'Gurka',quantity:'1 st',category:'produce',checked:false},
 {id:'tomato',name:'Tomater',quantity:'500 g',category:'produce',checked:false},
 {id:'milk',name:'Mjölk',quantity:'2 l',category:'dairy',checked:false},
 {id:'eggs',name:'Ägg',quantity:'12 st',category:'dairy',checked:false},
 {id:'pasta',name:'Pasta',quantity:'500 g',category:'pantry',checked:false},
 {id:'bread',name:'Bröd',quantity:'1 st',category:'bakery',checked:true},
 {id:'coffee',name:'Kaffe',quantity:'1 pkt',category:'drinks',checked:true}
].map(item=>({...item,createdAt:demoCreatedAt,checkedAt:item.checked?new Date(Date.now()-2*60*60*1000):null}));
const demoHistory=new URLSearchParams(location.search).get('history')==='1'?[...demoItems,
 ...Array.from({length:43},(_,index)=>({id:`older-${String(index).padStart(2,'0')}`,name:`Äldre vara ${String(index+1).padStart(2,'0')}`,quantity:'1 st',category:'other',checked:true,createdAt:new Date(Date.now()-90*DAY_MS),checkedAt:new Date(Date.now()-(index+2)*DAY_MS)})),
 ...Array.from({length:2},(_,index)=>({id:`unknown-${index}`,name:`Odaterad vara ${index+1}`,quantity:'',category:'other',checked:true,createdAt:null,checkedAt:null}))
]:demoItems;
const paths={back:<path d="m15 5-7 7 7 7"/>,stack:<><path d="M6 3h14v15M3 6h14v15H3zM7 11h6m-6 4h6"/></>,catalogue:<><path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1m0-16c4-3 8-2 10-1v16c-4-2-7-1-10 1V5Z"/></>,basket:<><path d="M3 9h18l-2.5 12h-13L3 9ZM7 9l4-6m6 6-4-6M9 13v4m6-4v4"/></>,plus:<path d="M12 5v14M5 12h14"/>,people:<><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4"/></>,chevron:<path d="m8 5 7 7-7 7"/>,down:<path d="m6 9 6 6 6-6"/>,check:<path d="m5 12 4 4L19 6"/>,close:<path d="m6 6 12 12M6 18 18 6"/>,more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,edit:<><path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14l-1 7Z"/></>,logout:<><path d="M9 4H4v16h5m5-4 4-4-4-4m-6 4h10"/></>,copy:<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/></>,wifi:<><path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0M12 20h.01"/></>,list:<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,arrow:<path d="M12 19V5m-6 6 6-6 6 6"/>,trash:<><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>};
function Icon({name,...props}) {return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]??paths.basket}</svg>}
function humanError(error) {
 const code=error?.code??'';
 const text={
  'auth/invalid-email':'Kontrollera att e-postadressen är rätt skriven.',
  'auth/invalid-credential':'E-postadressen eller lösenordet stämmer inte.',
  'auth/wrong-password':'E-postadressen eller lösenordet stämmer inte.',
  'auth/user-not-found':'E-postadressen eller lösenordet stämmer inte.',
  'auth/email-already-in-use':'Det finns redan ett konto med den e-postadressen. Logga in i stället.',
  'auth/weak-password':'Välj ett lösenord med minst 6 tecken.',
  'auth/too-many-requests':'Lite för många försök. Vänta en stund och försök igen.',
  'auth/network-request-failed':'Ingen kontakt just nu. Kontrollera internetanslutningen.',
  'permission-denied':'Du har inte tillgång till detta, eller så gäller inbjudan inte längre.',
  'unavailable':'Ingen kontakt just nu. Kontrollera internetanslutningen och försök igen.',
  'auth/operation-not-allowed':'Inloggningen är inte tillgänglig just nu. Försök igen senare.',
  'auth/popup-blocked':'Webbläsaren blockerade inloggningsfönstret. Tillåt popupfönster för Handla och försök igen.',
  'auth/popup-closed-by-user':'Inloggningen avbröts. Du kan försöka igen när du vill.',
  'auth/cancelled-popup-request':'Ett inloggningsfönster är redan öppet.',
  'auth/account-exists-with-different-credential':'Kontot finns redan med en annan inloggningsmetod. Använd samma metod som tidigare.',
  'auth/unauthorized-domain':'Inloggningen är inte aktiverad för den här adressen ännu.'
 };
 return text[code] || (error?.message && !error.message.startsWith('Firebase:') ? error.message : 'Det gick inte att slutföra. Försök igen.');
}
function savedToken() {
 const match=location.pathname.match(/^\/join\/([^/]+)\/?$/);
 if(match&&TOKEN.test(match[1])) {try{localStorage.setItem('handla.pendingInvite',match[1])}catch{}return match[1]}
 try {const token=localStorage.getItem('handla.pendingInvite');return TOKEN.test(token??'')?token:null}catch{return null}
}
function CategorySelect({value,onChange,id,label='Kategori'}) {
 return <label className="category-control" htmlFor={id}>
  <span className="category-dot" style={{background:categoryMap[value]?.color}}/>
  <span className="sr-only">{label}</span>
  <select id={id} value={value} onChange={event=>onChange(event.target.value)}>{categories.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select>
  <Icon name="down" width="13" height="13"/>
 </label>
}
function Modal({title,children,onClose,busy=false}) {
 const ref=useRef(null);const titleID=useId();
 useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>dialog.close()},[]);
 return <dialog className="dialog" ref={ref} aria-labelledby={titleID} onCancel={e=>{e.preventDefault();if(!busy)onClose()}} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
  <div className="dialog-card"><header className="dialog-header"><h2 id={titleID}>{title}</h2><button className="icon-button" aria-label="Stäng" onClick={onClose} disabled={busy}><Icon name="close"/></button></header>{children}</div>
 </dialog>
}
function Notice({children,onClose,error=false}) {return <div className={`notice ${error?'error':''}`} role={error?'alert':'status'}><span>{children}</span>{onClose&&<button className="icon-button" onClick={onClose} aria-label="Stäng meddelande"><Icon name="close" width="17"/></button>}</div>}
function Brand({small=false}) {return <div className={`brand ${small?'small':''}`}><span className="brand-mark"><Icon name="basket"/></span><span>handla<span className="brand-period">.</span></span></div>}

function UpdateNotice() {
 const [ready,setReady]=useState(()=>!!window.__handlaUpdateReady);
 const [waiting,setWaiting]=useState(false);
 useEffect(()=>{const updated=()=>setReady(true);if(window.__handlaUpdateReady)updated();window.addEventListener('handla:update-ready',updated);return()=>window.removeEventListener('handla:update-ready',updated)},[]);
 if(!ready)return null;
 return <div className="update-notice" role="status"><div><strong>En uppdatering finns.</strong><span>{waiting?'Ändringar väntar på synkning. Anslut till internet innan du uppdaterar.':'Avsluta det du skriver innan du laddar om.'}</span></div><button onClick={()=>{if(api.hasPendingWrites()){setWaiting(true);return}location.reload()}}>Uppdatera</button></div>;
}
export default function App(){return <><UpdateNotice/><AppContent/></>}
function AppContent() {
 const [user,setUser]=useState(DEMO?{uid:'demo',email:'demo@example.test'}:undefined);
 const [profile,setProfile]=useState(DEMO?{workspaceID:'demo'}:undefined);
 const [workspace,setWorkspace]=useState(DEMO?{id:'demo',name:'Hemma hos oss',ownerID:'demo'}:null);
 const [lists,setLists]=useState(DEMO?demoLists:[]);
 const [products,setProducts]=useState([]);const [members,setMembers]=useState(DEMO?[{id:'demo',role:'owner',displayName:'Alex Andersson'},{id:'demo-member',role:'member',displayName:'Kim Svensson'}]:[]);
 const [membersRetry,setMembersRetry]=useState(0);
 const [membersStatus,setMembersStatus]=useState(DEMO?'ready':'loading');
 const [demoData,setDemoData]=useState({week:demoHistory,weekend:[]});
 const [selected,setSelected]=useState(null);
 const [reveal,setReveal]=useState(null);
 const [screen,setScreen]=useState(DEMO?new URLSearchParams(location.search).get('screen')||'list':'list');
 const [listPreviews,setListPreviews]=useState(DEMO?{week:demoItems,weekend:[]}:{});
 const [error,setError]=useState('');const [info,setInfo]=useState('');const [busy,setBusy]=useState(false);
 const [online,setOnline]=useState(navigator.onLine);
 const [dialog,setDialog]=useState(null);
 const [pendingToken,setPendingToken]=useState(savedToken);const [invite,setInvite]=useState(null);const [inviteLoading,setInviteLoading]=useState(false);const [inviteRetry,setInviteRetry]=useState(0);
 const [inviteLink,setInviteLink]=useState('');const [installEvent,setInstallEvent]=useState(null);
 const activeUser=useRef(user?.uid);activeUser.current=user?.uid;
 const redirectChecked=useRef(false);
 const addSearchInput=useRef(null);
 const workspaceID=profile?.workspaceID;
 const selectedList=lists.find(list=>list.id===selected)??lists[0]??null;
 const listID=selectedList?.id;
 const owner=workspace?.ownerID===user?.uid;
 useEffect(()=>{if(lists.length&&!lists.some(list=>list.id===selected))setSelected(lists.some(list=>list.id===profile?.lastViewedListID)?profile.lastViewedListID:lists[0].id)},[lists,selected,profile?.lastViewedListID]);
 const report=error=>setError(humanError(error));
 const shopping=useShoppingHistory({userID:user?.uid,workspaceID,listID,demoItems:DEMO?demoData[listID]:undefined,report});
 const normalizeRow=item=>({...item,category:categoryMap[item.category]?item.category:categoryFor(item.name,products)});
 const items=shopping.items.map(normalizeRow);
 const itemsLoading=shopping.loading,metadata=shopping.metadata;
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);const install=e=>{e.preventDefault();setInstallEvent(e)};window.addEventListener('beforeinstallprompt',install);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);window.removeEventListener('beforeinstallprompt',install)}},[]);
 useEffect(()=>{
  if(DEMO)return;
  if(!api.configured){setUser(null);return}
  if(!redirectChecked.current){redirectChecked.current=true;api.completeRedirect().catch(report)}
  return api.onAuth(next=>{setProfile(undefined);setWorkspace(null);setLists([]);setProducts([]);setMembers([]);setMembersStatus('loading');setSelected(null);setReveal(null);setListPreviews({});setScreen("list");setInvite(null);setError('');setUser(next)});
 },[]);
 useEffect(()=>{
  if(DEMO||!user)return;
  let active=true;const stop=api.watchProfile(user.uid,(value,meta)=>{if(active&&!meta?.hasPendingWrites)setProfile(value)},err=>{if(active)report(err)});
  return()=>{active=false;stop?.()};
 },[user?.uid]);
 useEffect(()=>{
  if(DEMO||!workspaceID||!user)return;
  let active=true;setMembers([]);setMembersStatus('loading');const callback=fn=>value=>{if(active)fn(value)};const fail=callback(report);
  const stops=[api.watchWorkspace(workspaceID,callback(setWorkspace),fail),api.watchLists(workspaceID,callback(setLists),fail),api.watchProducts(workspaceID,callback(setProducts),fail),api.watchMembers(workspaceID,callback(value=>{setMembers(value);setMembersStatus('ready')}),callback(()=>setMembersStatus('error')))];
  return()=>{active=false;stops.forEach(stop=>stop?.())};
 },[workspaceID,user?.uid,membersRetry]);
 useEffect(()=>{
  if(screen!=='lists')return;
  if(DEMO){setListPreviews(demoData);return}
  if(!workspaceID||!user)return;
  let active=true;
  const stops=lists.map(list=>api.watchActiveItems(workspaceID,list.id,(value,meta)=>{
   if(active&&(!meta?.fromCache||value.length))setListPreviews(previous=>({...previous,[list.id]:value}));
  },err=>{if(active)report(err)}));
  return()=>{active=false;stops.forEach(stop=>stop?.())};
 },[screen,workspaceID,lists.map(list=>list.id).join('|'),user?.uid,DEMO?demoData:null]);
 useEffect(()=>{
  if(DEMO||!pendingToken||!user)return;
  let active=true;setInviteLoading(true);
  api.getInvite(pendingToken).then(value=>{if(active){if(!value)throw new Error('Inbjudan finns inte längre.');setInvite({...value,token:pendingToken})}}).catch(err=>{if(active){report(err);if(['permission-denied','not-found'].includes(err.code))clearInvite()}}).finally(()=>{if(active)setInviteLoading(false)});
  return()=>{active=false};
 },[pendingToken,user?.uid,inviteRetry]);
 function openAddScreen() {
  // Commit the input before focusing, while still inside Safari's tap gesture.
  // A delayed effect can focus the field without opening the iPhone keyboard.
  flushSync(()=>setScreen('add'));
  addSearchInput.current?.focus({preventScroll:true});
 }
 function revealItem(name) {
  setReveal({name:normalize(name),listID,workspaceID,userID:user?.uid,token:crypto.randomUUID()});
  setScreen('list');
 }
 function finishReveal(token) {setReveal(current=>current?.token===token?null:current)}
 function clearInvite() {setInvite(null);setPendingToken(null);try{localStorage.removeItem('handla.pendingInvite')}catch{}if(location.pathname.startsWith('/join/'))history.replaceState(null,'','/'+location.search)}
 async function run(action) {if(busy)return false;setBusy(true);setError('');setInfo('');try{await action();return true}catch(err){report(err);return false}finally{setBusy(false)}}
 function queue(action) {setError('');const uid=user?.uid;try{Promise.resolve(action()).catch(err=>{if(activeUser.current===uid)report(err)});return true}catch(err){report(err);return false}}
 function rememberViewedList(id){if(DEMO)setProfile(previous=>({...previous,lastViewedListID:id}));else queue(()=>api.setLastViewedList(workspaceID,id))}
 function updateDemo(update) {setLists(previous=>api.sortLists(previous.map(list=>list.id===listID?{...list,lastChangedAt:new Date()}:list)));setDemoData(data=>({...data,[listID]:update(data[listID]??[])}))}
 function remember(product){setProducts(previous=>[...previous.filter(p=>normalize(p.name)!==normalize(product.name)),product])}
 function addItem(data) {if(DEMO){updateDemo(items=>[...items,{id:crypto.randomUUID(),...data,checked:false,createdAt:new Date(),checkedAt:null}]);remember(data);return true}return queue(()=>api.addItem(workspaceID,listID,data))}
 function renameList(list,name) {
  const trimmed=name.trim();
  if(!trimmed||trimmed.length>80){setError('Ange ett namn med högst 80 tecken.');return false}
  if(DEMO){setLists(previous=>api.sortLists(previous.map(value=>value.id===list.id?{...value,name:trimmed,lastChangedAt:new Date()}:value)));return true}
  return queue(()=>api.renameList(workspaceID,list.id,trimmed));
 }
 function editItem(item,data) {
  if(DEMO){updateDemo(items=>items.map(p=>p.id===item.id?{...p,...data}:p));remember(data);shopping.patchOlderItem({...item,...data});return true}
  let operation;const accepted=queue(()=>operation=api.updateItem(workspaceID,listID,item.id,data));
  if(accepted){shopping.patchOlderItem({...item,...data});Promise.resolve(operation).then(shopping.refreshHistory,shopping.refreshHistory)}
  return accepted;
 }
 function toggle(item) {
  const checked=!item.checked,next={...item,checked,checkedAt:checked?new Date():item.checkedAt};
  if(DEMO){updateDemo(items=>items.map(p=>p.id===item.id?next:p));shopping.patchOlderItem(next);return true}
  let operation;const accepted=queue(()=>operation=api.toggleItem(workspaceID,listID,item.id,checked));
  if(accepted){shopping.markOptimistic(next);Promise.resolve(operation).then(shopping.refreshHistory,()=>{shopping.clearOptimistic(item.id);shopping.refreshHistory()})}
  return accepted;
 }
 function removeItem(item) {
  if(DEMO){updateDemo(items=>items.filter(p=>p.id!==item.id));shopping.dropOlderItem(item.id);setDialog(null);return}
  let operation;if(queue(()=>operation=api.deleteItem(workspaceID,listID,item.id))){shopping.dropOlderItem(item.id);setDialog(null);Promise.resolve(operation).then(shopping.refreshHistory,shopping.refreshHistory)}
 }
 function openInvite(input) {try{const token=invitationToken(input,location.origin);try{localStorage.setItem('handla.pendingInvite',token)}catch{}setPendingToken(token);setInviteRetry(n=>n+1);setError('')}catch{setError('Klistra in en giltig inbjudningslänk till Handla.')}}
 async function copyInvite() {try{await navigator.clipboard.writeText(inviteLink);setInfo('Inbjudningslänken är kopierad.')}catch{setInfo('Markera och kopiera länken i fältet nedan.')}}
 const errorNotice=error&&<Notice error onClose={()=>setError('')}>{error}</Notice>;
 const infoNotice=info&&<Notice onClose={()=>setInfo('')}>{info}</Notice>;
 if(!DEMO&&!api.configured)return <div className="entry-page"><Brand/><div className="entry-card"><h1>Vi gör oss redo.</h1><p>Handla behöver anslutas innan du kan skapa ett konto. Prova gärna förhandsvisningen under tiden.</p><a className="primary button" href="/?demo=1">Se förhandsvisningen</a></div></div>;
 if(user===undefined)return <Loading online={online}/>;
 if(!user)return <AuthPage pendingInvite={!!pendingToken} busy={busy} error={error} info={info} run={run} clearError={()=>setError('')} setInfo={setInfo}/>;
 if(profile===undefined)return <div className="entry-page"><Brand/><div className="entry-card"><h1>Hämtar ditt hushåll…</h1><p>{online?'Det tar bara ett ögonblick.':'Anslut till internet för att öppna ditt hushåll. Inköpslistor som redan är öppna fungerar utan nät.'}</p>{errorNotice}{error&&<button className="secondary button" onClick={()=>location.reload()}>Försök igen</button>}</div></div>;
 const inviteDialog=invite&&<Modal title="Du är inbjuden" onClose={clearInvite} busy={busy}><div className="invite-symbol"><Icon name="people" width="32" height="32"/></div><h3 className="invite-name">{invite.name}</h3><p>Alla listor och sparade varor på samma ställe. När du ansluter kan ni handla tillsammans.</p>{workspaceID&&workspaceID!==invite.workspaceID?<Notice>Du tillhör redan ett annat hushåll. Byte av hushåll stöds inte ännu.</Notice>:<button className="primary button wide" disabled={busy||!online} onClick={()=>run(async()=>{await api.joinWorkspace(invite.token);clearInvite();setInfo('Välkommen till hushållet!')})}>{busy?'Ansluter…':workspaceID===invite.workspaceID?'Öppna hushållet':'Anslut till hushållet'}</button>}{errorNotice}<button className="text-button wide" onClick={clearInvite} disabled={busy}>Inte nu</button></Modal>;
 if(!workspaceID)return <div className="entry-page"><header className="entry-top"><Brand/><button className="text-button" disabled={busy} onClick={()=>run(()=>api.signOut())}>Logga ut</button></header><div className="entry-card"><span className="eyebrow">ALLA HEMMA, SAMMA LISTA</span><h1>Välkommen hem.</h1><p>Ge ert hushåll ett namn. Sedan kan du bjuda in de andra med en länk.</p>{errorNotice}{infoNotice}{pendingToken&&<Notice>{inviteLoading?'Hämtar din inbjudan…':'Du har en väntande inbjudan.'}{!inviteLoading&&!invite&&<button className="text-button" onClick={()=>setInviteRetry(n=>n+1)}>Försök igen</button>}</Notice>}<WorkspaceCreate busy={busy||!online} onCreate={name=>run(()=>api.createWorkspace(name))}/><div className="or-rule"><span>eller</span></div><InviteInput onSubmit={openInvite}/><p className="small-note">Ett hushåll per konto. Du kan också ansluta genom att öppna en inbjudningslänk.</p></div>{inviteDialog}</div>;
 return <div className="handla-app">
  {DEMO&&<div className="demo-banner">Förhandsvisning · exempeldata <a href="/">Öppna appen</a></div>}
  {screen==='lists'?<ListOverview lists={lists} previews={listPreviews} onSelect={id=>{rememberViewedList(id);setReveal(null);setSelected(id);setScreen('list')}} onCreate={()=>setDialog({type:'new-list'})} onBack={()=>setScreen('list')}/>:screen==='add'&&selectedList?<AddScreen key={listID} inputRef={addSearchInput} listName={selectedList.name} listCount={lists.length} memberCount={members.length} onLists={()=>setScreen('lists')} onMembers={()=>{setInfo('');setDialog({type:'workspace'})}} products={products} items={items} onAdd={addItem} onRestore={toggle} onAdded={revealItem} onBack={()=>setScreen('list')} error={error}/>:<main className="shopping-screen">
   <ShoppingHeader listName={selectedList?.name??'Inköpslista'} listCount={lists.length} memberCount={members.length} onLists={()=>setScreen('lists')} onMembers={()=>{setInfo('');setDialog({type:'workspace'})}} onOptions={()=>setDialog({type:'options'})} onAdd={selectedList?openAddScreen:null}/>
   <div className="messages">{errorNotice}{infoNotice}{!online&&<Notice>Du är offline. Håll appen öppen tills ändringarna har synkats.</Notice>}{pendingToken&&!invite&&<Notice>{inviteLoading?'Hämtar inbjudan…':'En inbjudan väntar.'}<button className="text-button" onClick={()=>setInviteRetry(n=>n+1)}>Öppna</button></Notice>}</div>
   {!selectedList?<div className="empty-state"><p>Skapa er första inköpslista.</p><button className="primary button" onClick={()=>setDialog({type:'new-list'})}>Skapa lista</button></div>:<GroceryList key={listID} items={items} recentItems={shopping.recent.map(normalizeRow)} olderItems={shopping.older.map(normalizeRow)} history={shopping.history} onLoadOlder={shopping.loadOlder} reveal={reveal?.listID===listID&&reveal?.workspaceID===workspaceID&&reveal?.userID===user?.uid?reveal:null} onRevealDone={finishReveal} loading={itemsLoading} onToggle={toggle} onEdit={item=>setDialog({type:'edit',item})}/>}
   {(metadata.hasPendingWrites||!online)&&<div className="sync-status" role="status">{metadata.hasPendingWrites?'Ändringar väntar på synkning.':'Synkas när anslutningen är tillbaka.'}</div>}
  </main>}
  {inviteDialog}
  {!invite&&dialog?.type==='options'&&<Modal title="Alternativ" onClose={()=>setDialog(null)}><div className="options-actions">{selectedList&&<button onClick={()=>setDialog({type:'rename-list',list:selectedList})}><Icon name="edit"/>Byt namn</button>}<button onClick={()=>{setDialog(null);setScreen('lists')}}><Icon name="stack"/>Mina listor</button><button onClick={()=>setDialog({type:'new-list'})}><Icon name="plus"/>Ny inköpslista</button><button onClick={()=>setDialog({type:'workspace'})}><Icon name="people"/>Hushåll och inbjudningar</button></div></Modal>}
  {!invite&&dialog?.type==='rename-list'&&<Modal title="Byt namn på listan" onClose={()=>setDialog(null)}><RenameList list={dialog.list} onCancel={()=>setDialog(null)} onSave={name=>{if(renameList(dialog.list,name))setDialog(null)}}/></Modal>}
  {!invite&&dialog?.type==='new-list'&&<Modal title="Ny inköpslista" onClose={()=>setDialog(null)}><NewList onCreate={name=>{if(DEMO){const id=crypto.randomUUID();setLists(lists=>api.sortLists([...lists,{id,name,lastChangedAt:new Date()}]));setDemoData(data=>({...data,[id]:[]}));setSelected(id);setDialog(null);setScreen('list');return}if(queue(()=>api.addList(workspaceID,name).then(id=>{setSelected(id);setScreen('list')})))setDialog(null)}}/></Modal>}
  {!invite&&dialog?.type==='edit'&&<Modal title="Ändra vara" onClose={()=>setDialog(null)}><ItemEditor item={items.find(item=>item.id===dialog.item.id)??dialog.item} onSave={data=>{if(editItem(dialog.item,data))setDialog(null)}} onDelete={()=>removeItem(dialog.item)}/></Modal>}
  {!invite&&dialog?.type==='workspace'&&<Modal title="Ert hushåll" onClose={()=>setDialog(null)} busy={busy}><div className="workspace-summary"><span className="workspace-icon"><Icon name="people" width="28" height="28"/></span><div><h3>{workspace?.name}</h3><p>{membersStatus==='ready'?`${members.length} ${members.length===1?'medlem':'medlemmar'} · gemensamma listor`:'Gemensamma listor'}</p></div></div><MemberRoster members={members} status={membersStatus} user={user} ownerID={workspace?.ownerID} onRetry={()=>setMembersRetry(value=>value+1)}/>{DEMO?<Notice>Det här är exempeldata. Inbjudningar fungerar i den riktiga appen.</Notice>:owner?<section className="invite-controls"><h3>Bjud in till hushållet</h3><p>Skicka en länk till de du vill handla tillsammans med. Länken gäller i sju dagar.</p>{inviteLink&&<><label className="field-label" htmlFor="invite-link">Inbjudningslänk</label><input id="invite-link" className="text-input link-input" value={inviteLink} readOnly onFocus={e=>e.target.select()}/><div className="button-row"><button className="secondary button" onClick={copyInvite}><Icon name="copy" width="17"/>Kopiera</button>{!!navigator.share&&<button className="primary button" onClick={async()=>{try{await navigator.share({title:'Handla tillsammans',text:'Gå med i vårt hushåll i Handla.',url:inviteLink})}catch(err){if(err.name!=='AbortError')report(err)}}}>Dela</button>}</div></>}<button className={`${inviteLink?'secondary':'primary'} button wide`} disabled={busy||!online} onClick={()=>run(async()=>setInviteLink(await api.createInvite(workspaceID)))}>{busy?'Arbetar…':inviteLink?'Skapa en ny länk':'Skapa inbjudningslänk'}</button><button className="text-button danger" disabled={busy||!online} onClick={()=>run(async()=>{await api.revokeInvite(workspaceID);setInviteLink('');setInfo('Inbjudningslänken är återkallad. Befintliga medlemmar påverkas inte.')})}>Återkalla tidigare inbjudningslänk</button><p className="small-note">Alla som har länken kan ansluta. En ny länk ersätter den gamla.</p></section>:<p>Be den som skapade hushållet att dela en inbjudningslänk för att bjuda in fler.</p>}{errorNotice}{infoNotice}<section className="install-box"><h3>Ha listan nära till hands</h3>{installEvent?<button className="secondary button" onClick={async()=>{await installEvent.prompt();setInstallEvent(null)}}>Lägg till på hemskärmen</button>:<p>På iPhone: öppna i Safari, tryck på Dela och välj <strong>Lägg till på hemskärmen</strong>.</p>}</section>{!DEMO&&<button className="text-button logout" disabled={busy} onClick={()=>run(async()=>{await api.signOut();setDialog(null);setInviteLink('')})}><Icon name="logout" width="17"/>Logga ut <span>{user.email}</span></button>}</Modal>}
 </div>;
}

function Loading({online}) {return <div className="entry-page"><Brand/><div className="entry-card"><div className="loading-dots" aria-hidden="true">•••</div><h1>Strax redo.</h1><p role="status">{online?'Öppnar Handla…':'Anslut till internet för att öppna ditt hushåll.'}</p></div></div>}
function AuthPage({pendingInvite,busy,error,info,run,clearError,setInfo}) {
 const [mode,setMode]=useState('social');const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 function changeMode(value){setMode(value);clearError();setInfo('')}
 async function emailSubmit(event){event.preventDefault();await run(async()=>{if(mode==='signup')await api.signUp(email.trim(),password);else if(mode==='reset'){await api.resetPassword(email.trim());setInfo('Om ett konto finns för adressen får du ett mejl med en återställningslänk.')}else await api.signIn(email.trim(),password)})}
 return <div className="auth-page"><header className="entry-top"><Brand/><span className="top-tag">FÖR ALLA HEMMA</span></header><div className="auth-layout"><section className="auth-intro"><span className="eyebrow">MINDRE ATT KOMMA IHÅG</span><h1>Mjölk. Bröd.<br/>Och lite mer<br/><em>tillsammans.</em></h1><p>En inköpslista som alla hemma har koll på.<br/>Skriv upp, dela och bocka av längs vägen.</p><div className="intro-detail"><span className="category-dot" style={{background:'#75a94c'}}/><span className="category-dot" style={{background:'#72b6d8'}}/><span className="category-dot" style={{background:'#dfbc52'}}/><span>Ordning på det lilla i vardagen.</span></div></section><section className="auth-card social-auth"><span className="card-overline">VÄLKOMMEN TILL HANDLA</span><h2>Alla hemma.<br/>Samma lista.</h2><p>{pendingInvite?'En inbjudan väntar. Logga in för att ansluta till hushållet.':'Logga in för att skapa ert hushåll eller öppna era listor.'}</p>{error&&<Notice error>{error}</Notice>}{info&&<Notice>{info}</Notice>}<div className="social-buttons"><button className="google-button" disabled={busy||!api.googleSignInAvailable} onClick={()=>run(()=>api.signInWithGoogle())}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.1h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2 1-3.4 1-2.6 0-4.9-1.8-5.7-4.1H2.9v2.7A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.3 13.9A6 6 0 0 1 6 12c0-.7.1-1.3.3-1.9V7.4H2.9A10 10 0 0 0 2 12c0 1.6.4 3.2.9 4.6l3.4-2.7Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9.1 5.4l3.4 2.7C7.1 7.8 9.4 6 12 6Z"/></svg>{busy?'Loggar in…':'Fortsätt med Google'}<Icon name="chevron" width="16"/></button><button className="apple-button" disabled={busy||!api.appleSignInAvailable} onClick={()=>run(()=>api.signInWithApple())}><span aria-hidden="true"></span>Fortsätt med Apple<Icon name="chevron" width="16"/></button>{!api.appleSignInAvailable&&<p className="provider-pending">Apple-inloggning förbereds. Använd Google eller e-post så länge.</p>}</div>{mode==='social'?<button className="text-button email-alternative" onClick={()=>changeMode('signin')} disabled={busy}>Fortsätt med e-post</button>:<div className="email-fallback"><div className="or-rule"><span>{mode==='signup'?'Skapa konto med e-post':mode==='reset'?'Återställ lösenord':'Logga in med e-post'}</span></div><form onSubmit={emailSubmit}><label className="field-label" htmlFor="email">E-postadress</label><input id="email" name="email" className="text-input" type="email" autoComplete="email" placeholder="du@exempel.se" value={email} onChange={e=>setEmail(e.target.value)} required disabled={busy}/>{mode!=='reset'&&<><label className="field-label" htmlFor="password">Lösenord</label><input id="password" name="password" className="text-input" type="password" autoComplete={mode==='signup'?'new-password':'current-password'} minLength={6} placeholder={mode==='signup'?'Minst 6 tecken':'Ditt lösenord'} value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></>}<button className="primary button wide" type="submit" disabled={busy}>{busy?'Ett ögonblick…':mode==='signup'?'Skapa konto':mode==='reset'?'Skicka återställningslänk':'Logga in'}</button></form><div className="email-links">{mode==='signin'?<><button className="text-button" onClick={()=>changeMode('signup')} disabled={busy}>Skapa konto</button><button className="text-button" onClick={()=>changeMode('reset')} disabled={busy}>Glömt lösenordet?</button></>:<button className="text-button" onClick={()=>changeMode('signin')} disabled={busy}>Tillbaka till inloggning</button>}</div></div>}<div className="social-detail"><Icon name="people" width="20"/><p>Skapa en lista på några sekunder.<br/>Bjud in resten av hushållet med en länk.</p></div><p className="small-note">Dela bara dina listor med dem du bjuder in.</p></section></div><footer className="auth-footer">Det enkla sättet att handla tillsammans.</footer></div>
}
function WorkspaceCreate({busy,onCreate}) {const [name,setName]=useState('');return <form onSubmit={e=>{e.preventDefault();onCreate(name.trim())}}><label className="field-label" htmlFor="workspace-name">Vad heter ert hushåll?</label><input id="workspace-name" className="text-input" placeholder="Till exempel Hemma hos oss" value={name} onChange={e=>setName(e.target.value)} maxLength={80} required/><button className="primary button wide" disabled={busy||!name.trim()}>Skapa hushåll<Icon name="chevron" width="18"/></button></form>}
function InviteInput({onSubmit}) {const [link,setLink]=useState('');return <form onSubmit={e=>{e.preventDefault();onSubmit(link.trim())}}><label className="field-label" htmlFor="paste-invite">Har du fått en inbjudan?</label><input id="paste-invite" className="text-input" placeholder="Klistra in länken här" type="url" value={link} onChange={e=>setLink(e.target.value)} required/><button className="secondary button wide" disabled={!link.trim()}>Öppna inbjudan</button></form>}
function NewList({onCreate}) {const [name,setName]=useState('');return <form onSubmit={e=>{e.preventDefault();if(name.trim())onCreate(name.trim())}}><label className="field-label" htmlFor="list-name">Listans namn</label><input autoFocus className="text-input" id="list-name" value={name} onChange={e=>setName(e.target.value)} placeholder="Till exempel Veckohandling" maxLength={80} required/><button className="primary button wide" disabled={!name.trim()}>Skapa lista</button></form>}
function RenameList({list,onSave,onCancel}) {
 const [name,setName]=useState(list.name);
 const [error,setError]=useState('');
 function submit(event){
  event.preventDefault();const trimmed=name.trim();
  if(!trimmed||trimmed.length>80){setError('Ange ett namn med högst 80 tecken.');return}
  onSave(trimmed);
 }
 return <form onSubmit={submit}><label className="field-label" htmlFor="rename-list">Listans namn</label><input autoFocus id="rename-list" className="text-input" value={name} onChange={event=>{setName(event.target.value);setError('')}} maxLength={80} required/>{error&&<Notice error>{error}</Notice>}<button className="primary button wide" disabled={!name.trim()}>Spara namn</button><button className="text-button wide" type="button" onClick={onCancel}>Avbryt</button></form>
}
function ShoppingHeader({listName,listCount,memberCount,onLists,onMembers,onOptions,onAdd,adding=false,inputRef,query,onQuery,onSubmit,onClose,catalogueOpen,onCatalogue}) {
 return <><header className="list-toolbar"><button className="list-count-button" aria-label={`Mina listor, ${listCount} listor`} onClick={onLists}><Icon name="stack" width="27" height="27"/><span>{listCount}</span></button><div className="toolbar-right"><button className="member-button" aria-label={`Hushållets medlemmar, ${memberCount}`} onClick={onMembers}><Icon name="people" width="25" height="25"/><span>{memberCount}</span></button>{adding?<button className="icon-button" aria-label="Stäng lägg till vara" onClick={onClose}><Icon name="close" width="25" height="25"/></button>:<button className="icon-button" aria-label="Fler alternativ" onClick={onOptions}><Icon name="more" width="27" height="27"/></button>}</div></header><div className="shopping-title"><h1>{listName}</h1>{adding?<div className="new-item-field editable"><Icon name="plus" width="22" height="22"/><input ref={inputRef} type="search" aria-label="Sök eller lägg till vara" placeholder="Ny vara" value={query} maxLength={120} onChange={event=>onQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&query.trim()){event.preventDefault();onSubmit()}}}/><button className={`input-catalogue ${catalogueOpen?'active':''}`} aria-label="Visa kategorier" aria-expanded={catalogueOpen} onClick={onCatalogue}><Icon name="catalogue" width="23" height="23"/></button></div>:onAdd&&<button className="new-item-field" onClick={onAdd}><Icon name="plus" width="22" height="22"/><span>Ny vara</span></button>}</div></>;
}
function GroceryList({items,recentItems,olderItems,history,onLoadOlder,reveal,onRevealDone,loading,onToggle,onEdit}) {
 const rowElements=useRef(new Map());
 const [highlighted,setHighlighted]=useState(null);
 const targetID=reveal?items.find(item=>!item.checked&&normalize(item.name)===reveal.name)?.id:null;
 useEffect(()=>{
  if(!reveal||!targetID){setHighlighted(null);return}
  const node=rowElements.current.get(targetID);
  if(!node)return;
  setHighlighted(targetID);
  node.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  const token=reveal.token;
  const timer=window.setTimeout(()=>{setHighlighted(null);onRevealDone(token)},1600);
  return()=>window.clearTimeout(timer);
 },[reveal?.token,targetID,loading]);
 const active=sortItems(items.filter(item=>!item.checked));const bought=recentItems;
 const datedOlder=olderItems.filter(item=>timestampMillis(item.checkedAt)!=null),unknownOlder=olderItems.filter(item=>timestampMillis(item.checkedAt)==null);
 if(loading)return <p className="list-loading" role="status">Hämtar listan…</p>;

 const row=item=><li className={`grocery-row ${item.checked?'checked':''} ${highlighted===item.id?'recently-added':''}`} key={item.id} ref={node=>{if(node)rowElements.current.set(item.id,node);else rowElements.current.delete(item.id)}} style={{'--category':categoryMap[item.category]?.color??categoryMap.other.color}}><button className="grocery-name" onClick={()=>onToggle(item)} aria-label={`${item.name}, ${item.checked?'köpt, lägg tillbaka':'bocka av'}, ${categoryMap[item.category]?.title??'Övrigt'}`}><span>{item.name}</span></button><button className="grocery-quantity" onClick={()=>onEdit(item)} aria-label={`Ändra ${item.name}, mängd ${item.quantity||'inte angiven'}`}>{item.quantity||<Icon name="edit" width="15" height="15"/>}</button></li>;
 return <div className="shopping-rows"><ul className="grocery-list active-items" aria-label="Varor att handla">{active.map(row)}</ul>{!active.length&&<div className="empty-state"><p>Inga varor att handla.</p><p className="muted">Lägg till det ni behöver med Ny vara.</p></div>}<div className="list-breathing-space" aria-hidden="true"/><div className="bought-items">{bought.length>0&&<><p className="history-label">Senaste dygnet</p><ul className="grocery-list" aria-label="Köpta varor">{bought.map(row)}</ul></>}{history.expanded&&<>{datedOlder.length>0&&<><p className="history-label">Äldre inköp</p><ul className="grocery-list" aria-label="Äldre inköp">{datedOlder.map(row)}</ul></>}{unknownOlder.length>0&&<><p className="history-label">Datum saknas</p><ul className="grocery-list" aria-label="Inköp utan datum">{unknownOlder.map(row)}</ul></>}</>}<div className="history-controls">{history.error&&<Notice error>{history.error}</Notice>}{history.loading?<p role="status">Hämtar äldre inköp…</p>:history.error?<button className="text-button" onClick={onLoadOlder}>Försök igen</button>:!history.expanded||history.hasMore?<button className="text-button" onClick={onLoadOlder}>{history.expanded?'Visa fler äldre inköp':'Visa äldre inköp'}</button>:<p>{olderItems.length?'Inga fler äldre inköp.':'Inga äldre inköp.'}</p>}</div></div></div>
}
const listColors=['#0787a0','#b74080','#4d6bd8','#24855d','#ad6632','#8257aa'];
function ListOverview({lists,previews,onSelect,onCreate,onBack}) {
 return <main className="overview-screen"><header className="list-toolbar"><button className="icon-button" aria-label="Tillbaka till inköpslistan" onClick={onBack}><Icon name="back" width="26" height="26"/></button></header><h1>Mina listor</h1><nav aria-label="Inköpslistor" className="overview-lists">{lists.map((list,index)=>{
  const active=previews[list.id]?.filter(item=>!item.checked);
  const description=active?active.length?active.slice(0,7).map(item=>item.name).join(', ')+(active.length>7?' …':''):'Inga varor att handla':'Hämtar varor…';
  return <button className="overview-row" key={list.id} onClick={()=>onSelect(list.id)}><span className="overview-name" style={{color:listColors[index%listColors.length]}}>{list.name}</span><span className="overview-preview">{description}</span></button>
 })}</nav>{!lists.length&&<p className="overview-empty">Skapa din första lista med plusknappen.</p>}<button className="floating-add" aria-label="Ny inköpslista" onClick={onCreate}><Icon name="plus" width="29" height="29"/></button></main>
}
const chipColors={produce:'#4b7f2a',dairy:'#25779e',meat:'#ac4051',fish:'#267c80',bakery:'#896029',pantry:'#806a20',frozen:'#565f9b',drinks:'#78528d',snacks:'#a35b25',household:'#586977',hygiene:'#995077',other:'#666966'};
function AddScreen({inputRef,listName,listCount,memberCount,onLists,onMembers,products,items,onAdd,onRestore,onAdded,onBack,error}) {
 const [query,setQuery]=useState('');const [quantity,setQuantity]=useState('');const [category,setCategory]=useState('other');const [manual,setManual]=useState(false);const [filter,setFilter]=useState('all');const [catalogueOpen,setCatalogueOpen]=useState(false);const [localError,setLocalError]=useState('');const [recent,setRecent]=useState({});
 useEffect(()=>{if(error)setRecent({})},[error]);
 const merged=useMemo(()=>mergeCatalogue(products),[products]);
 const matching=useMemo(()=>query.trim()?suggest(query,products,400):catalogueOpen?merged:defaultHints(products,items),[query,products,items,merged,catalogueOpen]);
 const groups=query.trim()?[{category:{id:'search',title:'Matchande varor'},items:matching.filter(item=>filter==='all'||item.category===filter)}]:categories.map(category=>({category,items:matching.filter(item=>item.category===category.id)})).filter(group=>group.items.length&&(filter==='all'||group.category.id===filter));
 const existing=new Map(items.map(item=>[normalize(item.name),item]));
 function changeQuery(value){setQuery(value);setLocalError('');if(!value.trim()){setManual(false);setCategory('other')}else if(!manual)setCategory(categoryFor(value,products))}
 function add(product){
  const name=product.name.trim();const key=normalize(name);const current=existing.get(key);
  if(current&&!current.checked){onAdded(current.name);return}
  if(recent[key]&&!current)return;
  if(current?.checked){if(onRestore(current)!==false)onAdded(current.name);return}
  if(!name||name.length>120||quantity.length>80){setLocalError('Ange ett varunamn på högst 120 tecken och en mängd på högst 80 tecken.');return}
  if(onAdd({name,quantity:quantity.trim(),category:product.category})){setRecent(previous=>({...previous,[key]:true}));setLocalError('');setQuantity('');onAdded(name)}
 }
 const blankPointer=useRef(null);
 const blankTarget=target=>target instanceof Element&&target.matches('.add-screen,.search-content,.chip-groups,.chip-group');
 function blankDown(event){
  blankPointer.current=event.button===0&&blankTarget(event.target)?{id:event.pointerId,x:event.clientX,y:event.clientY,scrollY:window.scrollY}:null;
 }
 function blankMove(event){const start=blankPointer.current;if(start&&(Math.abs(event.clientX-start.x)>8||Math.abs(event.clientY-start.y)>8))blankPointer.current=null}
 function blankUp(event){const start=blankPointer.current;blankPointer.current=null;if(start&&start.id===event.pointerId&&blankTarget(event.target)&&Math.abs(window.scrollY-start.scrollY)<3)onBack()}
 const customName=query.trim();
 const isAdded=item=>{const current=existing.get(normalize(item.name));return current?!current.checked:!!recent[normalize(item.name)]};
 return <main className="add-screen" onPointerDown={blankDown} onPointerMove={blankMove} onPointerUp={blankUp} onPointerCancel={()=>{blankPointer.current=null}}><ShoppingHeader listName={listName} listCount={listCount} memberCount={memberCount} onLists={onLists} onMembers={onMembers} adding inputRef={inputRef} query={query} onQuery={changeQuery} onSubmit={()=>add({name:customName,category})} onClose={onBack} catalogueOpen={catalogueOpen} onCatalogue={()=>{setCatalogueOpen(!catalogueOpen);setFilter('all')}}/>

  {catalogueOpen&&<div className="category-filters"><button className={filter==='all'?'selected':''} onClick={()=>setFilter('all')}>Alla</button>{categories.map(item=><button className={filter===item.id?'selected':''} key={item.id} onClick={()=>setFilter(item.id)}>{item.title}</button>)}</div>}
  <div className="search-content">{(error||localError)&&<Notice error>{localError||error}</Notice>}{customName&&<div className="custom-product"><button className="custom-add" onClick={()=>add({name:customName,category})}><Icon name={isAdded({name:customName})?'check':'plus'} width="19" height="19"/><span>{isAdded({name:customName})?'Tillagd: ':''}{customName}</span></button></div>}{customName&&<div className="add-details"><label>Mängd<input aria-label="Mängd för ny vara" value={quantity} placeholder="T.ex. 2 l" onChange={e=>setQuantity(e.target.value)} maxLength={80}/></label><div className="add-category"><span>Kategori</span><CategorySelect id="new-category" value={category} onChange={value=>{setCategory(value);setManual(true)}}/></div></div>}
  <h1 className="suggestions-heading">{catalogueOpen&&!query.trim()?'Alla varor':'Förslag'}</h1><div className="chip-groups">{groups.map(group=><section className="chip-group" key={group.category.id} aria-label={group.category.title}>{group.items.map(item=><button key={normalize(item.name)} className={`grocery-chip ${isAdded(item)?'added':''}`} style={{backgroundColor:chipColors[item.category]}} onClick={()=>add({...item,category:manual&&normalize(query)===normalize(item.name)?category:item.category})} aria-label={`${item.name}, ${isAdded(item)?'redan på listan':'lägg till'}, ${categoryMap[item.category].title}`} aria-pressed={isAdded(item)}>{item.name}{isAdded(item)&&<Icon name="check" width="14" height="14"/>}</button>)}</section>)}</div>{!groups.some(group=>group.items.length)&&<p className="no-suggestions">Ingen sparad vara matchar. Lägg till din egen vara ovan.</p>}</div>
 </main>
}
function ItemEditor({item,onSave,onDelete}) {const [name,setName]=useState(item.name);const [quantity,setQuantity]=useState(item.quantity??'');const [category,setCategory]=useState(item.category??'other');return <form onSubmit={e=>{e.preventDefault();if(name.trim())onSave({name:name.trim(),quantity:quantity.trim(),category})}}><label className="field-label" htmlFor="edit-name">Vara</label><input className="text-input" id="edit-name" value={name} onChange={e=>setName(e.target.value)} maxLength={120} required/><label className="field-label" htmlFor="edit-quantity">Mängd</label><input className="text-input" id="edit-quantity" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="Till exempel 2 l eller 500 g" maxLength={80}/><label className="field-label" htmlFor="edit-category">Kategori</label><CategorySelect id="edit-category" value={category} onChange={setCategory}/><dl className="item-dates"><div><dt>Tillagd</dt><dd>{formatItemDate(item.createdAt)}</dd></div><div><dt>Senast avbockad</dt><dd>{formatItemDate(item.checkedAt)}</dd></div></dl>{item._pending&&<p className="small-note">Tidpunkten bekräftas när ändringen har synkats.</p>}<button className="primary button wide" disabled={!name.trim()}>Spara ändringar</button><button className="text-button danger wide" type="button" onClick={onDelete}><Icon name="trash" width="17"/>Ta bort varan</button></form>}

function MemberRoster({members,status,user,ownerID,onRetry}) {
 if(status==='loading')return <p className="member-status" role="status">Hämtar medlemmar…</p>;
 if(status==='error')return <div className="member-status" role="alert"><p>Medlemmarna kunde inte hämtas. Kontrollera anslutningen.</p><button className="text-button" onClick={onRetry}>Försök igen</button></div>;
 if(!members.length)return <p className="member-status">Inga medlemmar har hämtats ännu.</p>;
 return <ul className="member-roster" aria-label="Hushållets medlemmar">{[...members].sort((a,b)=>Number(b.id===ownerID)-Number(a.id===ownerID)).map(member=>{
  const current=member.id===user.uid;
  const name=member.displayName?.trim()||(current?(user.displayName?.trim()||user.email):null)||'Medlem utan namn';
  const initials=name==='Medlem utan namn'?'?':name.includes('@')?name.slice(0,1).toLocaleUpperCase('sv'):name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase('sv');
  return <li key={member.id}><span className="member-initials" aria-hidden="true">{initials}</span><div className="member-identity"><span className="member-name">{name}</span><span className="member-role">{member.id===ownerID||member.role==='owner'?'Ägare':'Medlem'}{current?' · Du':''}</span></div></li>;
 })}</ul>;
}
