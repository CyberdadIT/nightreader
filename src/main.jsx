import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import LockScreen from "./components/LockScreen.jsx";
import { useStore, whenSaved } from "./store/useStore.js";
import { isUnlocked, lockEnabled, lockInfo, setPending } from "./utils/vault.js";
import { resealAll } from "./utils/storage.js";
import { startAutoLock } from "./utils/autoLock.js";
import { watchGlobalErrors } from "./utils/errorLog.js";
import "./styles/global.css";
import "./styles/pdf-annotation-layer.css";

watchGlobalErrors();
// Ask the system not to clear NightReader's storage (library, notes) when space runs low.
navigator.storage?.persist?.().catch(() => {});

const root = ReactDOM.createRoot(document.getElementById("root"));

// Saved state is loaded only once the app is unlocked (when the app lock is on),
// and the app starts only after it has loaded, so nothing reads or writes too early.
async function start() {
  await useStore.persist.rehydrate();
  // Finish encrypting if turning the lock on (or off) was interrupted last time,
  // before anything else can read or change stored data.
  if (lockInfo()?.pending && isUnlocked()) {
    root.render(<p role="status" style={{ padding: 24, color: "var(--muted)" }}>Finishing encryption of your stored data…</p>);
    useStore.setState({});
    await whenSaved();
    const { failed } = await resealAll(true).catch(() => ({ failed: 1 }));
    if (!failed) setPending(false);
  }
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
  startAutoLock({ isBusy: () => Boolean(useStore.getState().speechMark) });
}

if (lockEnabled()) root.render(<LockScreen onUnlocked={start} />);
else start();
