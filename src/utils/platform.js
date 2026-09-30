import { Capacitor } from '@capacitor/core';
export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
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
