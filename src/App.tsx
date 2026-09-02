import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArchiveRestore, Check, ChevronLeft, FileWarning, Inbox, LockKeyhole, Mail, Monitor, Moon, Paperclip, Search, ShieldCheck, Sparkles, Star, Sun, Trash2, X } from 'lucide-react';
import { sampleEmails } from './data';
import { applyFilters, domainOf, formatBytes, isProtected, safeTrashIds } from './logic';
import type { AuditEvent, Email, Filters, ConnectionMode } from './types';
import { defaultState, effectiveTheme, loadState, saveState, STORAGE_KEY, type ThemePreference } from './persistence';
import { bff, bootstrap, BffError, type GmailMetadata, type ServerPreview, type ServerAuditEvent, type BrandSummary, type BrandDetail, type EmailCategory } from './bff';

const defaultFilters: Filters = { search:'', read:'all', starred:false, attachment:false, category:'All', age:'all' };
type View = 'inbox' | 'trash' | 'protected' | 'activity' | 'brands';

function senderInitial(name: string) { return name.trim().slice(0,1).toUpperCase(); }
function normalizeAddress(address:string){return address.trim().toLowerCase()}
function formatDate(date: string) { return new Intl.DateTimeFormat('en', { month:'short', day:'numeric', year:'numeric' }).format(new Date(date)); }
function fromGmail(message:GmailMetadata):Email{return{id:message.id,sender:message.fromName||message.fromAddress,address:normalizeAddress(message.fromAddress),subject:message.subject||'(No subject)',preview:'Metadata-only Gmail view',date:message.receivedAt,size:message.sizeEstimate,read:!message.unread,starred:message.starred,attachment:message.hasAttachment,category:'Primary',trashed:message.labels.includes('TRASH')}}
function fromServerAudit(row:ServerAuditEvent):AuditEvent{const result=row.event;return{id:row.id,action:result.action==='restore'?'Restored':'Moved to Trash',count:result.succeeded,detail:`${result.skipped} skipped · ${result.unknown} awaiting reconciliation`,at:row.createdAt}}

export function App() {
  const initial = useMemo(() => loadState(), []);
  const [emails, setEmails] = useState(initial.emails.map(e=>({...e,address:normalizeAddress(e.address)})));
  const [view, setView] = useState<View>('inbox');
  const [filters, setFilters] = useState(defaultFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedSenders, setSelectedSenders] = useState<Set<string>>(new Set());
  const [activeSender, setActiveSender] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [brandDetail, setBrandDetail] = useState<BrandDetail | null>(null);
  const [brandCategoryDescriptors, setBrandCategoryDescriptors] = useState<Array<{key:EmailCategory;label:string;description:string;defaultProtected:boolean}>>([]);
  const [brandPreview, setBrandPreview] = useState<ServerPreview | null>(null);
  const [protectedSenders, setProtectedSenders] = useState(new Set(initial.protectedSenders.map(normalizeAddress)));
  const [protectedDomains, setProtectedDomains] = useState(new Set(initial.protectedDomains.map(d=>d.trim().toLowerCase())));
  const [protectionVersion,setProtectionVersion]=useState(0);
  const [keepNewest, setKeepNewest] = useState(0);
  const [excludeStarred, setExcludeStarred] = useState(true);
  const [senderSort, setSenderSort] = useState<'count'|'size'|'latest'>('count');
  const [expandedSenders, setExpandedSenders] = useState<Set<string>>(new Set());
  const toggleSenderExpand = (address: string) => setExpandedSenders(prev => { const n = new Set(prev); n.has(address) ? n.delete(address) : n.add(address); return n; });
  const [brandSort, setBrandSort] = useState<'count'|'size'|'latest'>('count');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState('');
  const [audit, setAudit] = useState<AuditEvent[]>(initial.audit);
  const [theme, setTheme] = useState<ThemePreference>(initial.theme);
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const [undoIds, setUndoIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('demo');
  const [connectionError,setConnectionError]=useState('');
  const [protectionSaving,setProtectionSaving]=useState(false);
  const [protectionSaveError,setProtectionSaveError]=useState('');
  const [serverPreview,setServerPreview]=useState<ServerPreview|null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const update = () => setPrefersDark(media.matches);
    update(); media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  useEffect(()=>{
    if(view==='brands'&&connectionMode!=='demo'&&brands.length===0){
      Promise.all([bff.brands(),bff.categories()]).then(([b,c])=>{setBrands(b.brands);setBrandCategoryDescriptors(c.categories)}).catch(e=>setConnectionError(e instanceof Error?e.message:'Failed to load brands'));
    }
    if(view!=='brands'){setBrandDetail(null);setBrandPreview(null)}
  },[view,connectionMode,brands.length]);
  useEffect(()=>{bootstrap().then(async s=>{setConnectionMode(s.mode);if(s.mode==='readonly'||s.mode==='cleanup'){setEmails([]);setProtectedSenders(new Set());setProtectedDomains(new Set());setAudit([]);const [synced,rules,history]=await Promise.all([bff.sync(),bff.protections(),bff.activity()]);setEmails(synced.messages.map(fromGmail));setProtectedSenders(new Set(rules.senders.map(normalizeAddress)));setProtectedDomains(new Set(rules.domains.map(d=>d.trim().toLowerCase())));setProtectionVersion(rules.version);setAudit(history.events.map(fromServerAudit))}}).catch(e=>{setConnectionError(e instanceof Error?e.message:'Backend unavailable');setConnectionMode('demo')})},[]);
  useEffect(() => {
    const applied = effectiveTheme(theme, prefersDark);
    document.documentElement.dataset.theme = applied;
    document.documentElement.style.colorScheme = applied;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', applied === 'dark' ? '#0f1726' : '#f7f8fb');
  }, [theme, prefersDark]);
  useEffect(() => {
    if (connectionMode!=='demo') return;
    if (!saveState({ version:1, emails, protectedSenders:[...protectedSenders], protectedDomains:[...protectedDomains], audit, theme })) {
      setNotice('Changes work in this tab, but your browser could not save them for the next visit. Check private-browsing or storage settings.');
    }
  }, [emails, protectedSenders, protectedDomains, audit, theme, connectionMode]);

  const themeOptions: ThemePreference[] = ['system','light','dark'];
  function cycleTheme() { setTheme(themeOptions[(themeOptions.indexOf(theme)+1)%themeOptions.length]); }

  const base = emails.filter(e => view === 'trash' ? e.trashed : !e.trashed);
  const senderScoped = activeSender && activeSender !== '__all__' ? base.filter(e => e.address === activeSender) : base;
  const visible = applyFilters(senderScoped, filters);
  const selectedEmails = emails.filter(e => selected.has(e.id));
  const selectedSenderEmails = emails.filter(e => !e.trashed && selectedSenders.has(e.address));
  const selectedSenderSize = selectedSenderEmails.reduce((sum,e)=>sum+e.size,0);
  const protectedSelected = selectedEmails.filter(e => isProtected(e, protectedSenders, protectedDomains));
  const starredSelected = excludeStarred ? selectedEmails.filter(e => e.starred && !isProtected(e, protectedSenders, protectedDomains)) : [];
  const eligibleSet = safeTrashIds(emails, new Set([...selected].filter(id => !starredSelected.some(e => e.id === id))), protectedSenders, protectedDomains, keepNewest);
  const eligible = emails.filter(e => eligibleSet.has(e.id));
  const skippedNewest = Math.max(0, selected.size - protectedSelected.length - starredSelected.length - eligible.length);
  const totalEligibleSize = eligible.reduce((sum,e) => sum + e.size, 0);
  const visibleSelectedCount = visible.filter(e => selected.has(e.id)).length;
  const hiddenSelectedCount = Math.max(0, selected.size - visibleSelectedCount);
  const affectedSenders = [...new Set(eligible.map(e => e.sender))];
  const affectedDomains = [...new Set(eligible.map(e => domainOf(e.address)))];
  const filterSummary = [filters.search && `search “${filters.search}”`, filters.read !== 'all' && filters.read, filters.starred && 'starred', filters.attachment && 'attachments', filters.category !== 'All' && filters.category, filters.age !== 'all' && `last ${filters.age} days`].filter(Boolean).join(', ') || 'all messages';

  const groups = useMemo(() => {
    const map = new Map<string, Email[]>();
    for (const email of applyFilters(base, filters)) map.set(email.address, [...(map.get(email.address) ?? []), email]);
    return [...map.entries()].map(([address,items]) => ({ address, sender:items[0].sender, count:items.length, unread:items.filter(e=>!e.read).length, size:items.reduce((s,e)=>s+e.size,0), latest:items.sort((a,b)=>+new Date(b.date)-+new Date(a.date))[0].date, protected:isProtected(items[0],protectedSenders,protectedDomains), items })).sort((a,b)=>senderSort==='size'?(b.size-a.size):senderSort==='count'?(b.count-a.count):+new Date(b.latest)-+new Date(a.latest));
  }, [base, filters, protectedDomains, protectedSenders, senderSort]);

  useEffect(() => {
    if (!confirmOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : reviewButtonRef.current;
    const focusable = () => [...(modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
    focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setConfirmOpen(false); return; }
      if (event.key !== 'Tab') return;
      const items = focusable(); if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [confirmOpen]);

  useEffect(() => {
    if (!confirmOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [confirmOpen]);

  function changeView(next: View) {
    setView(next); setActiveSender(null); setSelected(new Set()); setSelectedSenders(new Set()); setFilters(defaultFilters); setNotice(null);
  }
  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleVisible() {
    const all = visible.length > 0 && visible.every(e => selected.has(e.id));
    setSelected(prev => { const n = new Set(prev); visible.forEach(e => all ? n.delete(e.id) : n.add(e.id)); return n; });
  }
  function toggleSender(address:string){address=normalizeAddress(address);setSelectedSenders(prev=>{const next=new Set(prev);next.has(address)?next.delete(address):next.add(address);return next})}
  function toggleVisibleSenders(){const addresses=groups.map(g=>g.address),all=addresses.length>0&&addresses.every(a=>selectedSenders.has(a));setSelectedSenders(prev=>{const next=new Set(prev);addresses.forEach(a=>all?next.delete(a):next.add(a));return next})}
  function reviewSelectedSenders(){
    if(selectedSenderEmails.length>500){setNotice(`Cleanup stopped safely: ${selectedSenderEmails.length} messages match the selected senders. Narrow the selection to 500 messages or fewer; nothing was truncated.`);return}
    setSelected(new Set(selectedSenderEmails.map(e=>e.id)));setExcludeStarred(true);void reviewCleanupForIds(new Set(selectedSenderEmails.map(e=>e.id)));
  }
  async function reviewCleanupForIds(candidate:Set<string>){
    if(protectionSaving||protectionSaveError){setConnectionError(protectionSaveError||'Wait for protected-mail changes to finish before reviewing cleanup.');return}
    setTypedConfirm('');setServerPreview(null);
    const ids=safeTrashIds(emails,new Set([...candidate].filter(id=>!emails.find(e=>e.id===id)?.starred)),protectedSenders,protectedDomains,keepNewest);
    if(!ids.size){setNotice('Nothing can move. Every selected message is protected, starred, or excluded by your safety rules.');return}
    if(connectionMode==='demo'){setConfirmOpen(true);return}
    if(connectionMode!=='cleanup'){setNotice('Cleanup permission is required before Gmail messages can move to Trash.');return}
    try{const preview=await bff.preview('trash',[...ids]);setServerPreview(preview);setConfirmOpen(true)}catch(e){setConnectionError(e instanceof Error?e.message:'Gmail preview failed safely')}
  }
  async function reviewCleanup(){
    if(protectionSaving||protectionSaveError){setConnectionError(protectionSaveError||'Wait for protected-mail changes to finish before reviewing cleanup.');return}
    setTypedConfirm('');setServerPreview(null);
    if(connectionMode==='demo'){setConfirmOpen(true);return}
    if(connectionMode!=='cleanup'){setNotice('Cleanup permission is required before Gmail messages can move to Trash.');return}
    const ids=safeTrashIds(emails,new Set([...selected].filter(id=>!(excludeStarred&&emails.find(e=>e.id===id)?.starred))),protectedSenders,protectedDomains,keepNewest);
    if(!ids.size){setNotice('Nothing can move. Every selected message is protected or excluded by your safety rules.');return}
    try{const preview=await bff.preview('trash',[...ids]);setServerPreview(preview);setConfirmOpen(true)}catch(e){setConnectionError(e instanceof Error?e.message:'Gmail preview failed safely')}
  }
  async function protectSelectedSenders(){
    const additions=[...selectedSenders].filter(address=>!protectedSenders.has(address)&&!protectedDomains.has(domainOf(address)));
    if(!additions.length){setNotice('Every selected sender is already protected directly or by domain.');setSelectedSenders(new Set());return}
    if(connectionMode==='demo'){const ok=await saveProtections(new Set([...protectedSenders,...additions]),protectedDomains);if(ok){setSelectedSenders(new Set());setNotice(`${additions.length} sender${additions.length===1?'':'s'} protected. Existing protections were preserved.`)}return}
    if(protectionSaving)return;setProtectionSaving(true);setProtectionSaveError('');setConnectionError('');
    try{const saved=await bff.addProtectedSenders(additions);setProtectedSenders(new Set(saved.senders.map(normalizeAddress)));setProtectedDomains(new Set(saved.domains.map(d=>d.toLowerCase())));setProtectionVersion(saved.version);setSelectedSenders(new Set());setNotice(`${additions.length} sender${additions.length===1?'':'s'} protected. Existing protections were preserved.`)}catch(e){const message=e instanceof Error?e.message:'Protection update failed safely';setProtectionSaveError(message);setConnectionError(message)}finally{setProtectionSaving(false)}
  }
  async function moveToTrash() {
    // Recalculate at commit time so newly protected senders can never slip through.
    let ids = safeTrashIds(emails, new Set([...selected].filter(id => !(excludeStarred && emails.find(e=>e.id===id)?.starred))), protectedSenders, protectedDomains, keepNewest);
    const moved = emails.filter(e => ids.has(e.id));
    if (!moved.length) { setConfirmOpen(false); setNotice('Nothing moved. Every selected message is protected by your safety rules.'); return; }
    if(connectionMode!=='demo'){
      if(protectionSaving||protectionSaveError){setConnectionError(protectionSaveError||'Protected-mail changes are still saving. Cleanup was not started.');return}
      if(connectionMode!=='cleanup'){setConfirmOpen(false);setNotice('Cleanup permission is required before Gmail messages can move to Trash.');return}
      if(!serverPreview){setConnectionError('The server preview is missing or expired. Review cleanup again.');setConfirmOpen(false);return}
      if(typedConfirm!==serverPreview.confirmText){setConnectionError('Type the exact server confirmation before cleanup.');return}
      try{const result=await bff.execute(serverPreview.previewId,typedConfirm),succeeded=new Set(result.items.filter(i=>i.status==='succeeded').map(i=>i.id));setEmails(prev=>prev.map(e=>succeeded.has(e.id)?{...e,trashed:true}:e));setSelected(new Set());setConfirmOpen(false);setTypedConfirm('');setServerPreview(null);setUndoIds([...succeeded]);setAudit(prev=>[{id:result.jobId,action:'Moved to Trash',count:result.succeeded,detail:`${result.skipped} protected skipped · ${result.unknown} awaiting reconciliation`,at:new Date().toISOString()},...prev]);setNotice(`${result.succeeded} moved to Trash. ${result.skipped} skipped; ${result.unknown} outcome${result.unknown===1?' is':'s are'} being reconciled.`)}catch(e){setConnectionError(e instanceof Error?e.message:'Gmail cleanup failed safely')}return;
    }
    setEmails(prev => prev.map(e => ids.has(e.id) ? {...e, trashed:true} : e));
    setAudit(prev => [{ id:crypto.randomUUID(), action:'Moved to Trash', count:moved.length, detail:`${formatBytes(moved.reduce((s,e)=>s+e.size,0))} recoverable • ${moved.map(e=>e.sender).filter((v,i,a)=>a.indexOf(v)===i).join(', ')}`, at:new Date().toISOString() }, ...prev]);
    setUndoIds([...ids]); setSelected(new Set()); setConfirmOpen(false); setTypedConfirm('');
    setNotice(`${moved.length} message${moved.length===1?'':'s'} moved to Trash. Nothing was permanently deleted.`);
  }
  async function restore(ids: string[]) {
    if(connectionMode!=='demo'){try{const preview=await bff.preview('restore',ids),result=await bff.execute(preview.previewId),succeeded=new Set(result.items.filter(i=>i.status==='succeeded').map(i=>i.id));setEmails(prev=>prev.map(e=>succeeded.has(e.id)?{...e,trashed:false}:e));setSelected(new Set());setUndoIds([]);setAudit(prev=>[{id:result.jobId,action:'Restored',count:result.succeeded,detail:`${result.unknown} awaiting reconciliation`,at:new Date().toISOString()},...prev]);setNotice(`${result.succeeded} restored. ${result.unknown} outcome${result.unknown===1?' is':'s are'} being reconciled.`)}catch(e){setConnectionError(e instanceof Error?e.message:'Gmail restore failed safely')}return}
    const restored = emails.filter(e => ids.includes(e.id) && e.trashed);
    setEmails(prev => prev.map(e => ids.includes(e.id) ? {...e,trashed:false}:e));
    if (restored.length) setAudit(prev => [{id:crypto.randomUUID(), action:'Restored', count:restored.length, detail:restored.map(e=>e.sender).filter((v,i,a)=>a.indexOf(v)===i).join(', '), at:new Date().toISOString()}, ...prev]);
    setSelected(new Set()); setUndoIds([]); setNotice(`${restored.length} message${restored.length===1?'':'s'} restored to Inbox.`);
  }
  async function saveProtections(senders:Set<string>,domains:Set<string>){
    if(connectionMode==='demo'){setProtectedSenders(senders);setProtectedDomains(domains);setProtectionVersion(v=>v+1);return true}
    if(protectionSaving)return false;
    setProtectionSaving(true);setProtectionSaveError('');setConnectionError('');
    try{const saved=await bff.protect([...senders].map(normalizeAddress),[...domains].map(d=>d.trim().toLowerCase()),protectionVersion);setProtectedSenders(new Set(saved.senders.map(normalizeAddress)));setProtectedDomains(new Set(saved.domains.map(d=>d.trim().toLowerCase())));setProtectionVersion(saved.version);return true}
    catch(e){if(e instanceof BffError&&e.status===409){let reloaded=false;try{const latest=await bff.protections();setProtectedSenders(new Set(latest.senders.map(normalizeAddress)));setProtectedDomains(new Set(latest.domains.map(d=>d.trim().toLowerCase())));setProtectionVersion(latest.version);reloaded=true}catch{}const message=reloaded?'Protected mail changed in another session. Latest rules were reloaded. Review them and retry your change.':'Protected mail changed in another session, but the latest rules could not be reloaded. No change was applied. Refresh before retrying.';setProtectionSaveError(message);setConnectionError(message);return false}const message=e instanceof Error?e.message:'Protection update failed safely';setProtectionSaveError(message);setConnectionError(message);return false}
    finally{setProtectionSaving(false)}
  }
  async function replaceProtectedSenders(next:Set<string>){await saveProtections(next,protectedDomains)}
  async function replaceProtectedDomains(next:Set<string>){await saveProtections(protectedSenders,next)}
  async function toggleProtect(address: string) {address=normalizeAddress(address);const next=new Set(protectedSenders);next.has(address)?next.delete(address):next.add(address);await saveProtections(next,protectedDomains)}
  function resetDemo() {
    const fresh = defaultState();
    setEmails(fresh.emails); setProtectedSenders(new Set(fresh.protectedSenders)); setProtectedDomains(new Set(fresh.protectedDomains));
    setAudit([]); setTheme(fresh.theme); setSelected(new Set()); setSelectedSenders(new Set()); setUndoIds([]); setActiveSender(null); setView('inbox'); setFilters(defaultFilters);
    localStorage.removeItem(STORAGE_KEY); setNotice('Sample data and safety preferences were reset.');
  }
  async function syncLive(){setSelectedSenders(new Set());setSelected(new Set());const result=await bff.sync();setEmails(result.messages.map(fromGmail));setNotice(`${result.messages.length} Gmail metadata records synced.`)}
  function useDemo(){const fresh=defaultState();setConnectionMode('demo');setEmails(fresh.emails);setProtectedSenders(new Set(fresh.protectedSenders));setProtectedDomains(new Set(fresh.protectedDomains));setAudit(fresh.audit);setSelected(new Set());setSelectedSenders(new Set());setUndoIds([])}

  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to main content</a>
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Mail size={20}/></div><div><strong>Inbox Keeper</strong><span>Calm inbox, safer cleanup</span></div></div>
      <div className="sample-pill"><Sparkles size={14}/> {connectionMode==='demo'?'Sample data only':connectionMode==='disconnected'?'Gmail not connected':'Gmail metadata'}</div>
      <button className="theme-toggle" onClick={cycleTheme} aria-label={`Theme: ${theme}. Activate to use ${themeOptions[(themeOptions.indexOf(theme)+1)%themeOptions.length]} theme`} title={`Theme: ${theme}`}>
        {theme==='system'?<Monitor aria-hidden="true"/>:theme==='dark'?<Moon aria-hidden="true"/>:<Sun aria-hidden="true"/>}<span>{theme}</span>
      </button>
    </header>

    <div className="privacy-banner" role="status"><ShieldCheck size={17}/><span><strong>{connectionMode === 'demo' ? 'Demo mode.' : connectionMode==='disconnected'?'Gmail disconnected.':'Gmail connected.'}</strong> {connectionMode==='demo'?'Every message shown is fictional sample data.':connectionMode==='disconnected'?'No email account or token is connected.':'Only message metadata is displayed; bodies and attachments are not stored.'}</span></div>
    <ConnectionPanel mode={connectionMode} setMode={m=>{setConnectionMode(m);setSelectedSenders(new Set());setSelected(new Set());if(m==='disconnected')setEmails([])}} onSync={syncLive} onDemo={useDemo} error={connectionError} setError={setConnectionError}/>

    <div className="workspace">
      <aside className="sidebar" aria-label="Primary navigation">
        <nav>
          <button aria-current={view==='inbox'?'page':undefined} className={view==='inbox'?'active':''} onClick={()=>changeView('inbox')}><Inbox/> Inbox <span>{emails.filter(e=>!e.trashed).length}</span></button>
          <button aria-current={view==='trash'?'page':undefined} className={view==='trash'?'active':''} onClick={()=>changeView('trash')}><Trash2/> Trash <span>{emails.filter(e=>e.trashed).length}</span></button>
          <button aria-current={view==='protected'?'page':undefined} className={view==='protected'?'active':''} onClick={()=>changeView('protected')}><LockKeyhole/> Protected</button>
          <button aria-current={view==='brands'?'page':undefined} className={view==='brands'?'active':''} onClick={()=>changeView('brands')}><Sparkles/> Brands <span>{brands.length}</span></button>
          <button aria-current={view==='activity'?'page':undefined} className={view==='activity'?'active':''} onClick={()=>changeView('activity')}><Activity/> Activity</button>
        </nav>
        <div className="sidebar-card"><ShieldCheck/><strong>Safe by design</strong><p>Bulk actions always move to Trash. Protected senders override every cleanup rule.</p>{connectionMode==='demo'&&<button className="reset-demo" onClick={resetDemo}>Reset sample data</button>}</div>
      </aside>

      <main id="main-content" className="main" onKeyDown={e=>{if(e.key==='/' && !(e.target instanceof HTMLInputElement)){e.preventDefault();searchRef.current?.focus();}}}>
        {notice && <div className="notice" role="status"><Check size={18}/><span>{notice}</span>{undoIds.length>0 && <button onClick={()=>restore(undoIds)}>Undo</button>}<button aria-label="Dismiss notice" onClick={()=>setNotice(null)}><X size={16}/></button></div>}
        {view==='brands' ? <BrandsView brands={brands} descriptors={brandCategoryDescriptors} brandSort={brandSort} setBrandSort={setBrandSort} onSelectBrand={async(key)=>{setConnectionError('');try{const d=await bff.brandDetail(key);setBrandDetail(d)}catch(e){setConnectionError(e instanceof Error?e.message:'Failed to load brand')}}} onPreview={async(brandKey,category)=>{setConnectionError('');try{const p=await bff.previewByBrand(brandKey,category);setBrandPreview(p);setServerPreview(p);setConfirmOpen(true)}catch(e){setConnectionError(e instanceof Error?e.message:'Preview failed safely')}}} onRename={async(brandKey,displayName)=>{try{await bff.renameBrand(brandKey,displayName);const [b]=await Promise.all([bff.brands()]);setBrands(b.brands)}catch(e){setConnectionError(e instanceof Error?e.message:'Rename failed')}}} detail={brandDetail} onBack={()=>setBrandDetail(null)} preview={brandPreview} onClosePreview={()=>{setBrandPreview(null);setConfirmOpen(false)}}/> : view==='protected' ? <ProtectedView senders={protectedSenders} domains={protectedDomains} setSenders={replaceProtectedSenders} setDomains={replaceProtectedDomains} pending={protectionSaving} saveError={protectionSaveError}/> : view==='activity' ? <ActivityView audit={audit}/> : <>
          <section className="heading-row">
            <div>{activeSender && <button className="back" onClick={()=>{setActiveSender(null);setSelected(new Set())}}><ChevronLeft/> All senders</button>}<h1>{view==='trash'?'Trash':activeSender === '__all__' ? 'All messages' : activeSender ? emails.find(e=>e.address===activeSender)?.sender : 'Clean up your inbox'}</h1><p>{view==='trash'?'Messages stay recoverable here. Restore any time.':activeSender === '__all__' ? 'Review your full filtered inbox before selecting anything.' : activeSender ? activeSender : 'Review by sender, protect what matters, and reclaim space.'}</p>{!activeSender && view==='inbox' && <button className="review-all" onClick={()=>setActiveSender('__all__')}>Review all messages</button>}</div>
            <div className="storage-card"><span>Potential cleanup</span><strong>{formatBytes(emails.filter(e=>!e.trashed && !isProtected(e,protectedSenders,protectedDomains)).reduce((s,e)=>s+e.size,0))}</strong><small>excluding protected mail</small></div>
          </section>

          <section className="filters" aria-label="Email filters">
            <label className="search"><Search/><span className="sr-only">Search messages</span><input ref={searchRef} value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="Search sender, subject or message…"/><kbd>/</kbd></label>
            <select aria-label="Read status" value={filters.read} onChange={e=>setFilters({...filters,read:e.target.value as Filters['read']})}><option value="all">All mail</option><option value="unread">Unread</option><option value="read">Read</option></select>
            <select aria-label="Category" value={filters.category} onChange={e=>setFilters({...filters,category:e.target.value as Filters['category']})}><option>All</option><option>Primary</option><option>Updates</option><option>Promotions</option><option>Receipts</option></select>
            <select aria-label="Date range" value={filters.age} onChange={e=>setFilters({...filters,age:e.target.value as Filters['age']})}><option value="all">Any time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option></select>
            <button className={filters.starred?'filter-on':''} aria-pressed={filters.starred} onClick={()=>setFilters({...filters,starred:!filters.starred})}><Star/> Starred</button>
            <button className={filters.attachment?'filter-on':''} aria-pressed={filters.attachment} onClick={()=>setFilters({...filters,attachment:!filters.attachment})}><Paperclip/> Attachments</button>
          </section>

          {!activeSender && view==='inbox' ? <><div className="sender-toolbar"><label><TriStateCheckbox ariaLabel="Select all visible senders" checked={groups.length>0&&groups.every(g=>selectedSenders.has(g.address))} indeterminate={groups.some(g=>selectedSenders.has(g.address))&&!groups.every(g=>selectedSenders.has(g.address))} onChange={toggleVisibleSenders}/>Select all visible senders <span>{groups.length}</span></label><small>Cleanup selection includes all current non-Trash messages from each selected address, even when filters hide some messages.</small></div><label className="sort-select">Sort by <select aria-label="Sort senders" value={senderSort} onChange={e=>setSenderSort(e.target.value as typeof senderSort)}><option value="count">Most messages</option><option value="size">Biggest storage</option><option value="latest">Most recent</option></select></label><section className="sender-grid" aria-label="Senders">
            {groups.map(g=>{const isExpanded=expandedSenders.has(g.address);const expandedSelectedCount=g.items.filter(e=>selected.has(e.id)).length;return <article className={`sender-card ${selectedSenders.has(g.address)?'selected':''} ${isExpanded?'expanded':''}`} key={g.address}>
              <div className="sender-card-header"><input type="checkbox" aria-label={`Select sender ${g.sender} (${g.address})`} checked={selectedSenders.has(g.address)} onChange={()=>toggleSender(g.address)}/><div className="avatar">{senderInitial(g.sender)}</div><div className="sender-info"><div><strong>{g.sender}</strong>{g.protected&&<span className="lock-label"><LockKeyhole/>Protected</span>}</div><span>{g.address}</span><small>{g.count} visible messages · {g.unread} unread</small></div><div className="sender-meta"><strong>{formatBytes(g.size)}</strong><span>{formatDate(g.latest)}</span><button className="expand-btn" aria-expanded={isExpanded} aria-label={isExpanded?`Collapse messages from ${g.sender}`:`Expand messages from ${g.sender}`} onClick={()=>toggleSenderExpand(g.address)}>{isExpanded?'Hide':'Show'} messages</button></div></div>
              {isExpanded && <div className="sender-card-expanded" aria-label={`Messages from ${g.sender}`}><ul className="inline-email-list">{g.items.map(item=>{const protectedItem=isProtected(item,protectedSenders,protectedDomains);return <li key={item.id} className={`inline-email ${selected.has(item.id)?'selected':''} ${protectedItem?'protected':''}`}><input type="checkbox" aria-label={`Select message ${item.subject}`} checked={selected.has(item.id)} disabled={protectedItem} onChange={()=>toggle(item.id)}/><div className="inline-email-info"><span className="inline-email-subject">{item.subject}</span><span className="inline-email-meta">{item.read?'Read':'Unread'} · {formatBytes(item.size)} · {formatDate(item.date)}{item.starred?' · ★':''}</span></div>{protectedItem&&<span className="lock-label"><LockKeyhole size={12}/>Protected</span>}</li>})}</ul>{expandedSelectedCount>0&&<div className="inline-email-summary">{expandedSelectedCount} selected · bulk cleanup preview available in the dock below</div>}</div>}
            </article>})}
          </section></> : <MessageTable emails={visible} selected={selected} toggle={toggle} toggleVisible={toggleVisible} protectedSenders={protectedSenders} protectedDomains={protectedDomains} onProtect={toggleProtect} trash={view==='trash'} onRestore={id=>restore([id])}/>} 

          {(activeSender || view==='trash') && visible.length===0 && <div className="empty"><Mail/><h2>No messages match</h2><p>Try clearing a filter or selecting another sender.</p></div>}

          {hiddenSelectedCount>0 && <div className="hidden-selection" role="status"><FileWarning size={16}/><span><strong>{hiddenSelectedCount} selected message{hiddenSelectedCount===1?' is':'s are'} hidden</strong> by the current filters. Bulk review includes them unless you clear the selection.</span><button onClick={()=>setSelected(new Set(visible.filter(e=>selected.has(e.id)).map(e=>e.id)))}>Drop hidden selection</button></div>}

          {selected.size>0 && <div className="action-dock" role="region" aria-label="Bulk actions"><div><strong>{selected.size} selected</strong><span>{formatBytes(selectedEmails.reduce((s,e)=>s+e.size,0))}</span></div>{view==='trash'?<button className="primary" onClick={()=>restore([...selected])}><ArchiveRestore/>Restore selected</button>:<><label>Keep newest <select value={keepNewest} onChange={e=>setKeepNewest(Number(e.target.value))}><option value="0">None</option><option value="1">1</option><option value="3">3</option><option value="5">5</option></select></label><label className="checkbox-label"><input type="checkbox" checked={excludeStarred} onChange={e=>setExcludeStarred(e.target.checked)}/>Exclude starred</label><button ref={reviewButtonRef} className="danger" disabled={protectionSaving||!!protectionSaveError} onClick={reviewCleanup}><Trash2/>{protectionSaving?'Saving protections…':'Review cleanup'}</button></>}<button className="text-btn" onClick={()=>setSelected(new Set())}>Clear</button></div>}
          {!activeSender&&view==='inbox'&&selectedSenders.size>0&&<div className="action-dock sender-actions" role="region" aria-label="Selected sender actions"><div><strong>{selectedSenders.size} sender{selectedSenders.size===1?'':'s'}</strong><span>{selectedSenderEmails.length} total matched · {selectedSenderEmails.filter(e=>isProtected(e,protectedSenders,protectedDomains)).length} protected skipped · {selectedSenderEmails.filter(e=>!isProtected(e,protectedSenders,protectedDomains)&&!e.starred).length} eligible · {formatBytes(selectedSenderSize)}</span></div><button className="primary" disabled={protectionSaving} onClick={()=>void protectSelectedSenders()}><LockKeyhole/>{protectionSaving?'Saving…':'Protect selected'}</button><button ref={reviewButtonRef} className="danger" disabled={protectionSaving||!!protectionSaveError} onClick={reviewSelectedSenders}><Trash2/>Review cleanup</button><button className="text-btn" onClick={()=>setSelectedSenders(new Set())}>Clear</button></div>}
        </>}
      </main>
    </div>

    {confirmOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setConfirmOpen(false)}}><section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
      <div className="modal-icon"><FileWarning/></div><h2 id="confirm-title">Review before moving to Trash</h2><p id="confirm-description">Nothing will be permanently deleted. Safety rules are checked again when you confirm.</p>
      <dl className="review-list"><div><dt>Selected</dt><dd>{selected.size}</dd></div><div><dt>Selected and visible</dt><dd>{visibleSelectedCount}</dd></div><div><dt>Selected but hidden</dt><dd>{hiddenSelectedCount}</dd></div><div><dt>Visible in current view</dt><dd>{visible.length}</dd></div><div><dt>Filter scope</dt><dd>{filterSummary}</dd></div><div><dt>{serverPreview?'Server requested':'Will move to Trash'}</dt><dd>{serverPreview?.requestedCount??eligible.length}</dd></div>{serverPreview&&<><div><dt>Server eligible</dt><dd>{serverPreview.count}</dd></div><div><dt>Server protected exclusions</dt><dd>{serverPreview.excludedCount}</dd></div><div><dt>Server missing or changed</dt><dd>{serverPreview.missingCount}</dd></div></>}<div><dt>Affected senders</dt><dd>{affectedSenders.length ? affectedSenders.join(', ') : 'None'}</dd></div><div><dt>Affected domains</dt><dd>{affectedDomains.length ? affectedDomains.join(', ') : 'None'}</dd></div><div><dt>Protected skipped</dt><dd>{protectedSelected.length}</dd></div><div><dt>Starred skipped</dt><dd>{starredSelected.length}</dd></div><div><dt>Kept by newest rule</dt><dd>{skippedNewest}</dd></div><div><dt>Recoverable storage</dt><dd>{formatBytes(totalEligibleSize)}</dd></div></dl>
      {(serverPreview||eligible.length>=5) && <label className="typed-confirm">Type <strong>{serverPreview?.confirmText??`MOVE ${eligible.length}`}</strong> to confirm this exact {serverPreview?'server-validated result':'large action'}.<input autoFocus aria-label="Cleanup confirmation" value={typedConfirm} onChange={e=>setTypedConfirm(e.target.value)} /></label>}
      <div className="modal-actions"><button onClick={()=>{setConfirmOpen(false);setServerPreview(null)}}>Cancel</button><button className="danger" disabled={protectionSaving||!!protectionSaveError||(serverPreview?serverPreview.count===0||typedConfirm!==serverPreview.confirmText:eligible.length===0||(eligible.length>=5&&typedConfirm!==`MOVE ${eligible.length}`))} onClick={moveToTrash}><Trash2/>Move {serverPreview?.count??eligible.length} to Trash</button></div>
    </section></div>}
  </div>;
}

function ConnectionPanel({mode,setMode,onSync,onDemo,error,setError}:{mode:ConnectionMode;setMode:(mode:ConnectionMode)=>void;onSync:()=>Promise<void>;onDemo:()=>void;error:string;setError:(value:string)=>void}) {
  const labels:Record<ConnectionMode,string>={demo:'Demo',disconnected:'Disconnected',readonly:'Read-only',cleanup:'Cleanup enabled'};
  const act=(task:()=>Promise<unknown>)=>{setError('');task().catch(e=>setError(e instanceof Error?e.message:'Request failed safely'))};
  return <section className="connection-panel" aria-label="Email connection status"><div><span className={`connection-dot ${mode}`}/><div><strong>{labels[mode]}</strong><small>{mode==='demo'?'Fictional data only. Gmail access is disabled.':mode==='disconnected'?'No Google account or token is connected.':mode==='readonly'?'Metadata access only. Cleanup permission is not granted.':'Gmail modify permission granted. Trash and restore only.'}</small>{error&&<span role="alert" className="form-error">{error}</span>}</div></div><div className="connection-actions">{mode==='demo'?<button onClick={()=>setMode('disconnected')}>View connection setup</button>:mode==='disconnected'?<><button onClick={()=>act(()=>bff.connect(false))}>Connect Gmail read-only</button><button onClick={onDemo}>Return to demo</button></>:<><button onClick={()=>act(onSync)}>Sync metadata</button>{mode==='readonly'&&<button onClick={()=>act(()=>bff.connect(true))}>Enable cleanup permission</button>}<button onClick={()=>act(async()=>{await bff.disconnect();setMode('disconnected')})}>Disconnect</button><button onClick={onDemo}>Use demo</button></>}</div></section>;
}

function MessageTable({emails,selected,toggle,toggleVisible,protectedSenders,protectedDomains,onProtect,trash,onRestore}:{emails:Email[];selected:Set<string>;toggle:(id:string)=>void;toggleVisible:()=>void;protectedSenders:Set<string>;protectedDomains:Set<string>;onProtect:(s:string)=>void;trash:boolean;onRestore:(id:string)=>void}) {
  const all = emails.length>0 && emails.every(e=>selected.has(e.id));
  const some = emails.some(e=>selected.has(e.id));
  return <section className="message-panel"><div className="table-toolbar"><label><TriStateCheckbox ariaLabel="Select all visible messages" checked={all} indeterminate={some&&!all} onChange={toggleVisible}/>Select all visible <span>{emails.length}</span></label></div><div className="message-list">{emails.map(e=>{const senderLocked=protectedSenders.has(e.address.toLowerCase());const domainLocked=protectedDomains.has(domainOf(e.address));const locked=senderLocked||domainLocked;return <article className={`message-row ${!e.read?'unread':''}`} key={e.id}>
    <input type="checkbox" aria-label={`Select ${e.subject}`} checked={selected.has(e.id)} onChange={()=>toggle(e.id)}/><span className={`star ${e.starred?'on':''}`} aria-label={e.starred?'Starred':'Not starred'}><Star/></span><div className="message-main"><div><strong>{e.subject}</strong><span>{e.category}</span></div><p>{e.preview}</p><small>{formatDate(e.date)} · {formatBytes(e.size)} {e.attachment&&<>· <Paperclip/> attachment</>}</small></div>
    <div className="row-actions">{locked&&<span className="lock-label" title={domainLocked?`Protected by domain ${domainOf(e.address)}`:'Protected sender'}><LockKeyhole/>{domainLocked?'Domain protected':'Protected'}</span>}{trash?<button onClick={()=>onRestore(e.id)}><ArchiveRestore/>Restore</button>:domainLocked?<button disabled aria-label={`${e.address} is protected by domain ${domainOf(e.address)}`} title={`Remove ${domainOf(e.address)} from Protected domains to change this sender`}>Protected by domain</button>:<button aria-label={senderLocked?`Unprotect sender ${e.address}`:`Protect sender ${e.address}`} onClick={()=>onProtect(e.address)}>{senderLocked?'Unprotect sender':'Protect sender'}</button>}</div>
  </article>})}</div></section>;
}

function TriStateCheckbox({checked,indeterminate,onChange,ariaLabel}:{checked:boolean;indeterminate:boolean;onChange:()=>void;ariaLabel:string}) {
  const ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(ref.current)ref.current.indeterminate=indeterminate},[indeterminate]);
  return <input ref={ref} type="checkbox" aria-label={ariaLabel} aria-checked={indeterminate?'mixed':checked} checked={checked} onChange={onChange}/>;
}

function ProtectedView({senders,domains,setSenders,setDomains,pending,saveError}:{senders:Set<string>;domains:Set<string>;setSenders:(v:Set<string>)=>Promise<void>;setDomains:(v:Set<string>)=>Promise<void>;pending:boolean;saveError:string}) {
  const [entry,setEntry]=useState(''); const [type,setType]=useState<'sender'|'domain'>('sender');
  const [error,setError]=useState('');
  async function add(){const value=entry.trim().toLowerCase().replace(/^@/,'');const validSender=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);const validDomain=/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value);if(type==='sender'&&!validSender){setError('Enter a complete email address.');return}if(type==='domain'&&!validDomain){setError('Enter a valid domain, such as example.com.');return}if(type==='sender'&&senders.has(value)||type==='domain'&&domains.has(value)){setError('That protection already exists.');return}if(type==='sender')await setSenders(new Set([...senders,value]));else await setDomains(new Set([...domains,value]));setEntry('');setError('');}
  return <section className="settings-view"><div className="heading-row"><div><h1>Protected mail</h1><p>These safety rules override every bulk action, filter, and cleanup suggestion.</p></div><div className="shield-orb"><ShieldCheck/></div></div>{saveError&&<p className="form-error" role="alert">Protection changes were not saved: {saveError}. Cleanup stays disabled until a protection update succeeds.</p>}<div className="protect-form"><select disabled={pending} aria-label="Protection type" value={type} onChange={e=>{setType(e.target.value as 'sender'|'domain');setError('')}}><option value="sender">Email address</option><option value="domain">Entire domain</option></select><input disabled={pending} aria-label="Address or domain" aria-invalid={!!error} aria-describedby={error?'protect-error':undefined} placeholder={type==='sender'?'name@example.com':'example.com'} value={entry} onChange={e=>{setEntry(e.target.value);setError('')}} onKeyDown={e=>e.key==='Enter'&&void add()}/><button disabled={pending} className="primary" onClick={()=>void add()}><LockKeyhole/>{pending?'Saving…':'Protect'}</button>{error&&<p id="protect-error" className="form-error" role="alert">{error}</p>}</div><div className="protected-columns"><div><h2>Protected senders <span>{senders.size}</span></h2>{[...senders].map(s=><div className="protected-item" key={s}><div className="avatar">{s[0].toUpperCase()}</div><span>{s}</span><button disabled={pending} aria-label={`Remove ${s}`} onClick={()=>void setSenders(new Set([...senders].filter(x=>x!==s)))}><X/></button></div>)}</div><div><h2>Protected domains <span>{domains.size}</span></h2>{[...domains].map(d=><div className="protected-item" key={d}><div className="avatar">@</div><span>{d}</span><button disabled={pending} aria-label={`Remove ${d}`} onClick={()=>void setDomains(new Set([...domains].filter(x=>x!==d)))}><X/></button></div>)}</div></div></section>;
}

function ActivityView({audit}:{audit:AuditEvent[]}) { return <section className="settings-view"><div className="heading-row"><div><h1>Activity</h1><p>A transparent record of every cleanup and restore action.</p></div></div>{audit.length===0?<div className="empty"><Activity/><h2>No activity yet</h2><p>Your sample cleanup history will appear here.</p></div>:<div className="timeline">{audit.map(a=><article key={a.id}><div className={a.action==='Restored'?'restore':''}>{a.action==='Restored'?<ArchiveRestore/>:<Trash2/>}</div><div><strong>{a.action}</strong><p>{a.count} message{a.count===1?'':'s'} · {a.detail}</p><time>{new Date(a.at).toLocaleString()}</time></div></article>)}</div>}</section>; }

function BrandsView({brands,descriptors,onSelectBrand,onPreview,onRename,detail,onBack,preview,onClosePreview,execute,brandSort,setBrandSort}:{brands:BrandSummary[];descriptors:Array<{key:EmailCategory;label:string;description:string;defaultProtected:boolean}>;onSelectBrand:(key:string)=>Promise<void>;onPreview:(brandKey:string,category?:string)=>Promise<void>;onRename:(brandKey:string,displayName:string)=>Promise<void>;detail:BrandDetail|null;onBack:()=>void;preview:ServerPreview|null;onClosePreview:()=>void;execute?:(previewId:string,confirmation?:string)=>Promise<unknown>;brandSort:'count'|'size'|'latest';setBrandSort:(v:'count'|'size'|'latest')=>void}){
  const [renameOpen,setRenameOpen]=useState<string|null>(null);
  const [renameValue,setRenameValue]=useState('');
  if(detail){
    const total=detail.totalMessages;
    return <section className="settings-view"><div className="heading-row"><div><button className="back" onClick={onBack}><ChevronLeft/> All brands</button><h1>{detail.displayName}</h1><p>{total} message{total===1?'':'s'} grouped by root domain. Click a category to preview what would move to Trash.</p></div></div><div className="protected-columns"><div><h2>Brand details</h2><p style={{fontSize:'0.9em',color:'#666'}}>Brand key: <code>{detail.brandKey}</code></p>{detail.isCustom&&<p style={{fontSize:'0.9em'}}><span className="lock-label"><Sparkles size={14}/> Custom name</span></p>}<button className="primary" onClick={()=>{setRenameOpen(detail.brandKey);setRenameValue(detail.displayName)}}><Sparkles size={14}/> Rename brand</button></div><div><h2>All senders in this brand</h2><p style={{fontSize:'0.9em'}}>Lowe's receipts and Lowe's promos collapse into one card even when sender addresses differ.</p><p style={{fontSize:'0.85em',color:'#888'}}>Sample senders: {brands.find(b=>b.brandKey===detail.brandKey)?.sampleSenders.slice(0,3).join(', ')||'none'}</p></div></div><h2 style={{marginTop:'1.5rem'}}>Categories</h2><div className="sender-grid" aria-label="Category lanes">{descriptors.map(d=>{const msgs=detail.categories[d.key]||[];if(msgs.length===0&&!d.defaultProtected)return null;const isProtected=d.defaultProtected;return <article className={`sender-card ${isProtected?'selected':''}`} key={d.key}><div className="avatar">{d.label[0]}</div><div className="sender-info"><div><strong>{d.label}</strong>{isProtected&&<span className="lock-label"><LockKeyhole size={12}/>Default protected</span>}</div><span>{d.description}</span><small>{msgs.length} message{msgs.length===1?'':'s'}</small></div><div className="sender-meta"><button disabled={isProtected||msgs.length===0} onClick={()=>void onPreview(detail.brandKey,d.key)}>{isProtected?'Protected':'Preview Trash'}</button></div></article>})}</div>{renameOpen&&<div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><h3>Rename brand</h3><p>Give this brand a memorable name. Other senders from the same root domain stay grouped here.</p><input value={renameValue} onChange={e=>setRenameValue(e.target.value)} aria-label="New brand name"/><div className="modal-actions"><button onClick={()=>setRenameOpen(null)}>Cancel</button><button className="primary" disabled={!renameValue.trim()} onClick={async()=>{await onRename(detail.brandKey,renameValue.trim());setRenameOpen(null)}}>Save</button></div></div></div>}</section>;
  }
  return <section className="settings-view"><div className="heading-row"><div><div className="heading-row-flex"><h1>Brands</h1><label className="sort-select">Sort by <select aria-label="Sort brands" value={brandSort} onChange={e=>setBrandSort(e.target.value as typeof brandSort)}><option value="count">Most messages</option><option value="size">Biggest storage</option><option value="latest">Most recent</option></select></label></div><p>Emails grouped by company instead of exact sender address. Click a brand to see category lanes, then preview a Trash cleanup for that lane.</p></div><div className="shield-orb"><Sparkles/></div></div>{brands.length===0?<div className="empty"><Sparkles/><h2>No brands yet</h2><p>Connect Gmail and sync to populate brand groups.</p></div>:<div className="sender-grid" aria-label="Brands">{[...brands].sort((a,b)=>brandSort==='size'?(b.storageBytes-a.storageBytes):brandSort==='latest'?(b.lastMessageAt>a.lastMessageAt?1:-1):(b.totalMessages-a.totalMessages)).map(b=><article className="sender-card" key={b.brandKey}><div className="avatar">{b.displayName[0]?.toUpperCase()||'?'}</div><div className="sender-info"><div><strong>{b.displayName}</strong>{b.isCustom&&<span className="lock-label"><Sparkles size={12}/>Custom</span>}</div><span>{b.sampleSenders[0]||b.brandKey}</span><small>{b.totalMessages} message{b.totalMessages===1?'':'s'} · {formatBytes(b.storageBytes)}</small></div><div className="sender-meta"><strong>{formatBytes(b.storageBytes)}</strong><span>{formatDate(b.lastMessageAt)}</span><button aria-label={`View brand ${b.displayName}`} onClick={()=>void onSelectBrand(b.brandKey)}>View</button></div></article>)}</div>}</section>;
}

