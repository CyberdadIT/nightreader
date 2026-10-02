import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { watchGlobalErrors } from "./utils/errorLog.js";
import "./styles/global.css";
import "./styles/pdf-annotation-layer.css";

watchGlobalErrors();
// Ask the system not to clear NightReader's storage (library, notes) when space runs low.
navigator.storage?.persist?.().catch(() => {});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
