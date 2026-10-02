import React, { useState, useEffect, useCallback } from 'react';
import TopBar from './components/TopBar.jsx';
import TabBar from './components/TabBar.jsx';
import Toolbar from './components/Toolbar.jsx';
import SearchBar from './components/SearchBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Viewer from './components/Viewer.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import StatusBar from './components/StatusBar.jsx';
import Library from './components/Library.jsx';
import ReadingTools from './components/ReadingTools.jsx';
import { useStore } from './store/useStore.js';
import { documentId, savePdfData, loadPdfData, deletePdfData, deleteOcrPages, saveSnapshot } from './utils/storage.js';
import { useOpenDocuments } from './hooks/useOpenDocuments.js';
import SplitView from './components/SplitView.jsx';
import { forgetIndex } from './utils/libraryIndex.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { watchOpenedFiles } from './utils/desktop.js';
import { watchMobileOpenedFiles } from './utils/mobile.js';
import PasswordDialog from './components/PasswordDialog.jsx';
import ShortcutsHelp from './components/ShortcutsHelp.jsx';
import PrintDialog from './components/PrintDialog.jsx';
import AppSettings from './components/AppSettings.jsx';
import StatsDialog from './components/StatsDialog.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';
import WarmLight from './components/WarmLight.jsx';
import Toast from './components/Toast.jsx';
import { useReadingPace } from './hooks/useReadingPace.js';
import { useReadingStats } from './hooks/useReadingStats.js';
import { useFolderSync } from './hooks/useFolderSync.js';
import styles from './App.module.css';
export default function App() {
  const [sidebarOpen,setSidebarOpen]=useState(false), [settingsOpen,setSettingsOpen]=useState(false);
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [error,setError]=useState(''), [restoring,setRestoring]=useState(true);
  const [passwordPrompt,setPasswordPrompt]=useState(null), [dialog,setDialog]=useState(null);
  const tab=useStore(s=>s.getActiveTab()), focus=useStore(s=>s.focusMode);
  const openTab=useStore(s=>s.openTab);
  const setPage=useStore(s=>s.setCurrentPage), upsert=useStore(s=>s.upsertDocument);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try {
        const state=useStore.getState();
        const old=[...state.tabs,...state.recentFiles].filter(f=>!state.library.some(d=>d.id===f.path));
        for(const file of new Map(old.map(f=>[f.path,f])).values()) {
          const bytes=await loadPdfData(file.path);
          if(!bytes) {upsert({id:file.path,name:file.name,kind:file.kind||'pdf',needsFile:true,lastPage:file.page||file.lastPage||1});continue;}
          const id=await documentId(bytes); await savePdfData(id,bytes);
          useStore.getState().migrateDocument(file.path,id,file.name,file.kind||'pdf');
          useStore.getState().updateDocument(id,{lastPage:file.page||file.lastPage||1});
        }
      }catch(e){if(!cancelled)setError(`Could not restore the library: ${e.message}`);}
      finally{if(!cancelled)setRestoring(false);}
    })();
    return()=>{cancelled=true;};
  },[upsert]);
  // Documents on screen: the active tab's, and the other pane's in side-by-side view.
  const split=useStore(s=>s.split), tabs=useStore(s=>s.tabs);
  const paneTabs=split?[tabs.find(t=>t.id===split.left),tabs.find(t=>t.id===split.right)]:[tab];
  const askPassword=useCallback((forTab,{incorrect})=>new Promise(resolve=>{
    setPasswordPrompt({name:forTab.name,incorrect,answer:answer=>{setPasswordPrompt(null);resolve(answer);}});
  }),[]);
  const docs=useOpenDocuments(paneTabs,{restoring,askPassword});
  const current=tab?docs[tab.path]:null, doc=current?.doc||null, loading=Boolean(tab&&(!current||current.loading));
  useEffect(()=>{if(current?.error)setError(current.error);},[current?.error]);
  const importFile=useCallback(async file=>{
    if(!file?.data)return;
    try {
      const kind=file.kind||(file.name.toLowerCase().endsWith('.epub')?'epub':'pdf');
      if(!/\.(pdf|epub)$/i.test(file.name))throw new Error('Choose a PDF or EPUB file.');
      const id=await documentId(file.data);await savePdfData(id,file.data);
      const old=useStore.getState().library.find(d=>d.needsFile&&d.name===file.name);
      if(old)useStore.getState().migrateDocument(old.id,id,file.name,kind);
      upsert({id,name:file.name,kind,size:file.data.byteLength,needsFile:false});
      openTab({path:id,name:file.name,kind});setLibraryOpen(false);
    }catch(e){setError(`Import failed: ${e.message}`);}
  },[openTab,upsert]);
  const openLibraryFile=entry=>{openTab({path:entry.id,name:entry.name,kind:entry.kind});setLibraryOpen(false);};
  async function removeFile(entry){try{const s=useStore.getState(),notes=s.annotations.filter(a=>a.filePath===entry.id);if(notes.length)await saveSnapshot(`Before removing ${entry.name}`,{annotations:notes,bookmarks:s.bookmarks.filter(b=>b.filePath===entry.id)});await deletePdfData(entry.id);await deleteOcrPages(entry.id);await forgetIndex(entry.id);useStore.getState().removeDocument(entry.id);}catch(e){setError(`Could not remove document: ${e.message}`);}}
  useEffect(()=>{
    const drop=async e=>{e.preventDefault();for(const file of Array.from(e.dataTransfer?.files||[])){try{await importFile({name:file.name,data:await file.arrayBuffer()});}catch(err){setError(err.message);}}};
    const drag=e=>e.preventDefault();window.addEventListener('drop',drop);window.addEventListener('dragover',drag);
    return()=>{window.removeEventListener('drop',drop);window.removeEventListener('dragover',drag);};
  },[importFile]);
  // Files opened from Windows Explorer ("Open with", double-click). Wait for the
  // library to be restored so the import doesn't race the migration above.
  useEffect(()=>{
    if(restoring)return;
    let stop=()=>{},cancelled=false;
    let stopMobile=()=>{};
    watchOpenedFiles(importFile,e=>setError(e.message)).then(fn=>{if(cancelled)fn();else stop=fn;}).catch(e=>setError(e.message));
    watchMobileOpenedFiles(importFile,e=>setError(e.message)).then(fn=>{if(cancelled)fn();else stopMobile=fn;}).catch(e=>setError(e.message));
    return()=>{cancelled=true;stop();stopMobile();};
  },[restoring,importFile]);
  useReadingPace(tab,doc);
  useReadingStats(tab,doc,!libraryOpen&&!dialog);
  useFolderSync(!restoring);
  const jumpTo=(docId,page)=>{useStore.getState().openAt(docId,page);setLibraryOpen(false);};
  useKeyboardShortcuts({rtl:Boolean(doc?.rtl),onPrint:()=>doc&&setDialog('print'),onHelp:()=>setDialog(d=>d==='shortcuts'?null:'shortcuts'),onNextPage:()=>tab&&setPage(tab.page+(useStore.getState().spread&&tab.kind!=='epub'?2:1)),onPrevPage:()=>tab&&setPage(tab.page-(useStore.getState().spread&&tab.kind!=='epub'?2:1))});
  return <div className={`${styles.app} ${focus?styles.focusMode:''}`}>
    <TopBar onToggleSidebar={()=>setSidebarOpen(s=>!s)} onToggleSettings={()=>setSettingsOpen(s=>!s)} settingsOpen={settingsOpen} onFileLoaded={importFile} onLibrary={()=>setLibraryOpen(s=>!s)} onAppSettings={()=>setDialog('settings')} onShortcuts={()=>setDialog('shortcuts')} onStats={()=>setDialog('stats')}/>
    <UpdateBanner/>
    <TabBar onFileLoaded={importFile}/>
    {!libraryOpen&&tab&&<Toolbar onFileLoaded={importFile} onPrint={()=>doc&&setDialog('print')}/>}
    {!libraryOpen&&doc&&<SearchBar pdf={doc}/>}
    {!libraryOpen&&doc&&!focus&&<ReadingTools key={tab?.path} doc={doc}/>}
    <div className={styles.body}>
      {!libraryOpen&&doc&&sidebarOpen&&!focus&&<Sidebar pdf={doc} outline={tab?.outline} onClose={()=>setSidebarOpen(false)}/>}
      <main className={styles.main}>
        {error&&<div className={styles.errorBox} role="alert"><p>{error}</p><button onClick={()=>setError('')}>Dismiss</button></div>}
        {(restoring||loading)&&<div className={styles.loadingOverlay} role="status"><div className={styles.spinner}/><p>{restoring?'Restoring library…':'Opening document…'}</p></div>}
        {(libraryOpen||!tab)&&!restoring?<Library onImport={importFile} onOpen={openLibraryFile} onRemove={removeFile} onJump={jumpTo}/>:split?<SplitView docs={docs}/>:doc&&<Viewer pdf={doc} tabId={tab.id}/>}
      </main>
      {!libraryOpen&&settingsOpen&&<SettingsPanel doc={doc} onClose={()=>setSettingsOpen(false)}/>}
    </div><StatusBar doc={doc}/>
    {passwordPrompt&&<PasswordDialog {...passwordPrompt}/>}
    {dialog==='shortcuts'&&<ShortcutsHelp onClose={()=>setDialog(null)}/>}
    {dialog==='print'&&doc&&<PrintDialog doc={doc} onClose={()=>setDialog(null)}/>}
    {dialog==='stats'&&<StatsDialog onClose={()=>setDialog(null)}/>}
    {dialog==='settings'&&<AppSettings onClose={()=>setDialog(null)} onShortcuts={()=>setDialog('shortcuts')}/>}
    <Toast/>
    <WarmLight/>
  </div>;
}
