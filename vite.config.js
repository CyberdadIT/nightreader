import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cspString } from "./csp.config.js";
import { resolve } from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Android, iOS and browser builds carry the CSP as a meta tag; the Tauri app gets it
// from tauri.conf.json instead. The dev server is left without it so hot reload works.
const cspMeta = {
  name: "nightreader-csp",
  apply: "build",
  transformIndexHtml(html) {
    if (process.env.TAURI_ENV_PLATFORM) return html;
    return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${cspString()}" />`);
  },
};

export default defineConfig({
  plugins: [react(), cspMeta],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ["pdfjs-dist"],
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM == "windows" ? "chrome105" : "safari13",
    // Vite 8 minifies with Oxc by default.
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  worker: {
    format: "es",
  },
});
