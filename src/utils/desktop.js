import { isTauri } from './platform.js';

const baseName = path => path.split(/[\\/]/).pop() || 'document';

/**
 * Documents opened from Windows Explorer: at startup, and later when the user
 * opens another file while NightReader is running (the second launch hands the
 * file over and exits). Calls onFile({name, data}) for each one.
 * Returns a function that stops listening.
 */
export async function watchOpenedFiles(onFile, onError) {
  if (!isTauri()) return () => {};
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  let draining = Promise.resolve();
  const drain = () => {
    draining = draining.then(async () => {
      const paths = await invoke('take_opened_files');
      for (const path of paths) {
        try {
          const data = await invoke('read_opened_file', { path });
          await onFile({ name: baseName(path), data });
        } catch (e) { onError(new Error(`Could not open ${baseName(path)}: ${e?.message || e}`)); }
      }
    }).catch(e => onError(e instanceof Error ? e : new Error(String(e))));
    return draining;
  };
  const unlisten = await listen('open-files-pending', drain);
  await drain();
  return unlisten;
}

/** Open a web page in the user's default browser. */
export async function openExternal(url) {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/** Ask the user to choose a folder (desktop only). */
export async function chooseFolder(title) {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const folder = await open({ directory: true, multiple: false, title });
  return typeof folder === 'string' ? folder : null;
}
