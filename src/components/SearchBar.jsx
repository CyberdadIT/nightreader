import React,{useEffect,useRef,useState} from 'react';
import {useStore} from '../store/useStore.js';
import {matchingOffsets} from '../utils/annotations.js';
import styles from './SearchBar.module.css';
export default function SearchBar({pdf}) {
  const visible=useStore(s=>s.searchVisible),query=useStore(s=>s.searchQuery),version=useStore(s=>s.ocrVersion);
  const results=useStore(s=>s.searchResults),input=useRef(null),generation=useRef(0);
  const [index,setIndex]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(visible)input.current?.focus();},[visible]);
  useEffect(()=>{
    const run=++generation.current;setBusy(false);setError('');setIndex(0);
    useStore.getState().setSearchResults([]);
    if(!visible||query.trim().length<2)return;
    const timer=setTimeout(async()=>{
      setBusy(true);const matches=[];
      try {
        for(let page=1;page<=pdf.numPages;page++) {
          if(run!==generation.current)return;
          const text=await (pdf.getSearchText||pdf.getPageText)(page);
          for(const hit of matchingOffsets(text,query))matches.push({page,...hit});
        }
        if(run!==generation.current)return;
        useStore.getState().setSearchResults(matches);
        if(matches.length){
          // Start at the first match from the current page on (e.g. after jumping here from library search).
          const here=useStore.getState().getActiveTab()?.page||1,first=Math.max(0,matches.findIndex(m=>m.page>=here));
          setIndex(first);useStore.getState().setCurrentPage(matches[first].page);useStore.getState().setSelectedMatch(matches[first]);
        }
      }catch(e){if(run===generation.current)setError(e.message);}
      finally{if(run===generation.current)setBusy(false);}
    },250);
    return()=>{clearTimeout(timer);generation.current++;};
  },[pdf,query,visible,version]);
  function navigate(next){if(!results.length)return;const i=(next+results.length)%results.length;setIndex(i);useStore.getState().setCurrentPage(results[i].page);useStore.getState().setSelectedMatch(results[i]);}
  if(!visible)return null;
  return <div className={styles.bar} role="search" aria-label="Find in document">
    <input ref={input} className={styles.input} aria-label="Search query" placeholder="Find text…" value={query} onChange={e=>useStore.getState().setSearchQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();navigate(index+(e.shiftKey?-1:1));}if(e.key==='Escape')useStore.getState().toggleSearch();}}/>
    <span className={styles.count} aria-live="polite">{error|| (busy?'Searching…':results.length?`${index+1} / ${results.length}`:query.length>=2?'No results':'Type 2+ characters')}</span>
    <button className={styles.btn} disabled={!results.length} aria-label="Previous match" onClick={()=>navigate(index-1)}>▲</button><button className={styles.btn} disabled={!results.length} aria-label="Next match" onClick={()=>navigate(index+1)}>▼</button>
    <button className={styles.btn} aria-label="Close search" onClick={()=>useStore.getState().toggleSearch()}>×</button>
  </div>;
}
