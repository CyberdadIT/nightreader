/**
 * Platform detection
 * Since tauri-plugin-dialog and tauri-plugin-fs are not bundled,
 * we always use the browser native file input for file picking.
 * This works perfectly inside Tauri — WebView2 shows the Windows file dialog.
 */

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isCapacitor = () =>
  typeof window !== "undefined" && "Capacitor" in window;

export const isMobile = () => isCapacitor();
export const isDesktop = () => isTauri();

/**
 * Open a file picker and return the selected PDF.
 * Uses the browser's native <input type="file"> which triggers
 * the OS file picker on all platforms including inside Tauri.
 */
export function openFilePicker() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      document.body.removeChild(input);
      if (!file) return resolve(null);
      const data = await file.arrayBuffer();
      resolve({
        path: file.name,
        name: file.name,
        data,
      });
    };

    // Handle cancel
    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };

    input.click();
  });
}

/**
 * Copy text to clipboard.
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
