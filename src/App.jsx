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
import { documentId, savePdfData, loadPdfData, deletePdfData, deleteOcrPages } from './utils/storage.js';
import { loadDocument } from './utils/documents.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import styles from './App.module.css';
export default function App() {
  const [sidebarOpen,setSidebarOpen]=useState(false), [settingsOpen,setSettingsOpen]=useState(false);
  const [libraryOpen,setLibraryOpen]=useState(false), [doc,setDoc]=useState(null);
  const [error,setError]=useState(''), [loading,setLoading]=useState(false), [restoring,setRestoring]=useState(true);
  const tab=useStore(s=>s.getActiveTab()), focus=useStore(s=>s.focusMode);
  const openTab=useStore(s=>s.openTab), updateTab=useStore(s=>s.updateTab);
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
  useEffect(()=>{
    if(restoring)return;
    let cancelled=false, opened=null; setDoc(null);setError('');
    if(!tab){setLoading(false);return;}
    setLoading(true);
    (async()=>{
      try {
        const bytes=await loadPdfData(tab.path);
        if(!bytes)throw new Error('This document is no longer cached. Import the original file again.');
        opened=await loadDocument(bytes,tab.kind||'pdf',tab.path);
        if(cancelled){opened.destroy();return;}
        setDoc(opened);
        const outline=opened.kind==='epub'?opened.outline:await opened.getOutline().catch(()=>[]);
        if(cancelled)return;
        updateTab(tab.id,{totalPages:opened.numPages,outline:outline||[],page:Math.min(Math.max(1,tab.page||1),opened.numPages)});
      }catch(e){if(!cancelled)setError(e.message||'Could not open document.');}
      finally{if(!cancelled)setLoading(false);}
    })();
    return()=>{cancelled=true;opened?.destroy();};
  },[tab?.id,tab?.path,tab?.kind,restoring,updateTab]);
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
  async function removeFile(entry){try{await deletePdfData(entry.id);await deleteOcrPages(entry.id);useStore.getState().removeDocument(entry.id);}catch(e){setError(`Could not remove document: ${e.message}`);}}
  useEffect(()=>{
    const drop=async e=>{e.preventDefault();for(const file of Array.from(e.dataTransfer?.files||[])){try{await importFile({name:file.name,data:await file.arrayBuffer()});}catch(err){setError(err.message);}}};
    const drag=e=>e.preventDefault();window.addEventListener('drop',drop);window.addEventListener('dragover',drag);
    return()=>{window.removeEventListener('drop',drop);window.removeEventListener('dragover',drag);};
  },[importFile]);
  useKeyboardShortcuts({onNextPage:()=>tab&&setPage(tab.page+(useStore.getState().spread&&tab.kind!=='epub'?2:1)),onPrevPage:()=>tab&&setPage(tab.page-(useStore.getState().spread&&tab.kind!=='epub'?2:1))});
  return <div className={`${styles.app} ${focus?styles.focusMode:''}`}>
    <TopBar onToggleSidebar={()=>setSidebarOpen(s=>!s)} onToggleSettings={()=>setSettingsOpen(s=>!s)} settingsOpen={settingsOpen} onFileLoaded={importFile} onLibrary={()=>setLibraryOpen(s=>!s)}/>
    <TabBar onFileLoaded={importFile}/>
    {!libraryOpen&&tab&&<Toolbar onFileLoaded={importFile}/>}
    {!libraryOpen&&doc&&<SearchBar pdf={doc}/>}
    {!libraryOpen&&doc&&!focus&&<ReadingTools key={tab?.path} doc={doc}/>}
    <div className={styles.body}>
      {!libraryOpen&&doc&&sidebarOpen&&!focus&&<Sidebar pdf={doc} outline={tab?.outline} onClose={()=>setSidebarOpen(false)}/>}
      <main className={styles.main}>
        {error&&<div className={styles.errorBox} role="alert"><p>{error}</p><button onClick={()=>setError('')}>Dismiss</button></div>}
        {(restoring||loading)&&<div className={styles.loadingOverlay} role="status"><div className={styles.spinner}/><p>{restoring?'Restoring library…':'Opening document…'}</p></div>}
        {(libraryOpen||!tab)&&!restoring?<Library onImport={importFile} onOpen={openLibraryFile} onRemove={removeFile}/>:doc&&<Viewer pdf={doc}/>}
      </main>
      {!libraryOpen&&settingsOpen&&<SettingsPanel onClose={()=>setSettingsOpen(false)}/>}
    </div><StatusBar/>
  </div>;
}
