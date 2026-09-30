import React,{useState} from 'react';
import {useStore} from '../store/useStore.js';
import {openFilePicker} from '../utils/platform.js';
import styles from './Library.module.css';
export default function Library({onImport,onOpen,onRemove}) {
  const library=useStore(s=>s.library), collections=useStore(s=>s.collections);
  const update=useStore(s=>s.updateDocument), addCollection=useStore(s=>s.addCollection);
  const [query,setQuery]=useState(''),[filter,setFilter]=useState(''),[newCollection,setNewCollection]=useState(''),[removing,setRemoving]=useState(null),[error,setError]=useState('');
  async function importDocument(){try{const f=await openFilePicker();if(f)await onImport(f);}catch(e){setError(e.message);}}
  const documents=library.filter(d=>d.name.toLowerCase().includes(query.toLowerCase())&&(!filter||d.collection===filter));
  return <section className={styles.library} aria-label="Document library">
    <header className={styles.header}><div><h1>Your reading library</h1><p>PDFs and EPUBs stay on this device, even after you close their tabs.</p></div><button onClick={importDocument}>Import PDF or EPUB</button></header>
    {error&&<p role="alert">{error}</p>}
    <div className={styles.filters}>
      <input aria-label="Search library" placeholder="Search documents…" value={query} onChange={e=>setQuery(e.target.value)}/>
      <select aria-label="Filter collection" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All collections</option>{collections.map(c=><option key={c}>{c}</option>)}</select>
      <form onSubmit={e=>{e.preventDefault();addCollection(newCollection);setNewCollection('');}}><input aria-label="New collection name" placeholder="New collection" value={newCollection} onChange={e=>setNewCollection(e.target.value)} maxLength={80}/><button disabled={!newCollection.trim()}>Add</button></form>
    </div>
    {!documents.length&&<p className={styles.empty}>{library.length?'No matching documents.':'Import a document to start reading. You can also drag PDF and EPUB files here.'}</p>}
    <div className={styles.grid}>{documents.map(d=><article key={d.id} className={styles.card}>
      <span className={styles.kind}>{d.kind?.toUpperCase()||'PDF'}</span><h2>{d.name}</h2>
      <p>{d.needsFile?'Original file needs to be imported again':`${d.kind==='epub'?'Chapter':'Page'} ${d.lastPage||1} · ${d.size?`${(d.size/1024/1024).toFixed(1)} MB`:'Stored locally'}`}</p>
      <label>Collection<select value={d.collection||''} onChange={e=>update(d.id,{collection:e.target.value})}><option value="">Unsorted</option>{collections.map(c=><option key={c}>{c}</option>)}</select></label>
      <div className={styles.actions}><button onClick={()=>d.needsFile?importDocument():onOpen(d)}>{d.needsFile?'Locate file':'Continue reading'}</button><button onClick={()=>setRemoving(d.id)}>Remove</button></div>
      {removing===d.id&&<div role="alert"><p>Remove this document and its local notes and OCR? The original file stays unchanged.</p><button onClick={async()=>{await onRemove(d);setRemoving(null);}}>Remove from device</button><button onClick={()=>setRemoving(null)}>Cancel</button></div>}
    </article>)}</div>
    <p className={styles.footnote}>Local storage can be cleared by the operating system or app data reset. Keep your original documents and export important notes.</p>
  </section>;
}
