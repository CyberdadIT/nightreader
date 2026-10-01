import { Capacitor } from '@capacitor/core';
// The real Tauri bridge has an invoke function; an element with that id (DOM clobbering) doesn't.
export const isTauri = () => typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__?.invoke === 'function';
export const isCapacitor = () => Capacitor.isNativePlatform();
export const isMobile = isCapacitor;
export const isDesktop = isTauri;
export function openFilePicker() {
  return new Promise((resolve,reject) => {
    const input=document.createElement('input'); input.type='file'; input.accept='.pdf,.epub,application/pdf,application/epub+zip';
    input.style.display='none'; document.body.appendChild(input);
    input.onchange=async()=>{
      const file=input.files?.[0]; input.remove();
      if (!file) return resolve(null);
      try { resolve({path:file.name,name:file.name,data:await file.arrayBuffer(),kind:file.name.toLowerCase().endsWith('.epub')?'epub':'pdf'}); }
      catch(error){reject(error);}
    };
    input.oncancel=()=>{input.remove();resolve(null);}; input.click();
  });
}
/** Pick any file of the given types (e.g. '.zip' or '.json'). Resolves to {name, data} or null. */
export function pickFile(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept;
    input.style.display = 'none'; document.body.appendChild(input);
    input.onchange = async () => {
      const file = input.files?.[0]; input.remove();
      if (!file) return resolve(null);
      try { resolve({ name: file.name, data: await file.arrayBuffer() }); } catch (error) { reject(error); }
    };
    input.oncancel = () => { input.remove(); resolve(null); }; input.click();
  });
}
export const copyToClipboard = async text => { await navigator.clipboard.writeText(text); };
export async function saveTextFile(name, text, mime = 'text/plain') {
  if (isCapacitor()) {
    const {Filesystem,Directory,Encoding} = await import('@capacitor/filesystem');
    const {Share} = await import('@capacitor/share');
    await Filesystem.writeFile({path:name,data:text,directory:Directory.Cache,encoding:Encoding.UTF8});
    const {uri}=await Filesystem.getUri({path:name,directory:Directory.Cache});
    await Share.share({title:name,url:uri}); return;
  }
  if (isTauri()) {
    const {save}=await import('@tauri-apps/plugin-dialog');
    const {writeTextFile}=await import('@tauri-apps/plugin-fs');
    const path=await save({defaultPath:name,filters:[{name:'Notes',extensions:[name.split('.').pop()]}]});
    if(path) await writeTextFile(path,text); return;
  }
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const a=document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function toBase64(bytes) {
  let binary=''; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}
/** Save a binary file (e.g. a PDF). Returns false if the user cancelled. */
export async function saveBinaryFile(name, bytes, mime = 'application/octet-stream') {
  if (isCapacitor()) {
    const {Filesystem,Directory} = await import('@capacitor/filesystem');
    const {Share} = await import('@capacitor/share');
    await Filesystem.writeFile({path:name,data:toBase64(bytes),directory:Directory.Cache});
    const {uri}=await Filesystem.getUri({path:name,directory:Directory.Cache});
    await Share.share({title:name,url:uri}); return true;
  }
  if (isTauri()) {
    const {save}=await import('@tauri-apps/plugin-dialog');
    const {writeFile}=await import('@tauri-apps/plugin-fs');
    const ext=name.split('.').pop();
    const path=await save({defaultPath:name,filters:[{name:ext.toUpperCase(),extensions:[ext]}]});
    if(!path) return false;
    await writeFile(path,bytes); return true;
  }
  const url=URL.createObjectURL(new Blob([bytes],{type:mime}));
  const a=document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  return true;
}
