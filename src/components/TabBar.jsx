import React from "react";
import { useStore } from "../store/useStore.js";
import { openFilePicker } from "../utils/platform.js";

export default function TabBar({ onFileLoaded }) {
  const tabs        = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab    = useStore((s) => s.closeTab);

  async function handleNewTab() {
    const file = await openFilePicker();
    if (file) onFileLoaded?.(file);
  }

  if (tabs.length === 0) return null;

  // Open documents are a list of buttons (not ARIA tabs: there is no tab panel per
  // document, and a tab can't contain its own close button).
  return (
    <nav aria-label="Open documents" style={{
      display: "flex",
      alignItems: "center",
      background: "var(--bg)",
      borderBottom: "1px solid var(--border)",
      overflowX: "auto",
      flexShrink: 0,
      height: "46px",
      paddingLeft: "4px",
    }}>
      <ul style={{ display: "flex", listStyle: "none", height: "100%", margin: 0, padding: 0 }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <li
            key={tab.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              padding: "0 4px 0 0",
              height: "100%",
              flexShrink: 0,
              maxWidth: "220px",
              minWidth: "100px",
              background: isActive ? "var(--surface)" : "transparent",
              borderRight: "1px solid var(--border)",
              borderTop: isActive ? `2px solid var(--accent)` : "2px solid transparent",
              transition: "background 0.15s",
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={isActive ? "page" : undefined}
              title={tab.name}
              style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0, height: "100%", padding: "0 6px 0 12px",
                background: "transparent", border: 0, color: "inherit", cursor: "pointer", font: "inherit", textAlign: "left" }}
            >
              <span aria-hidden="true" style={{ fontSize: "11px", flexShrink: 0, opacity: 0.6 }}>{tab.kind === "epub" ? "📖" : "📄"}</span>
              <span style={{
                fontSize: "11px",
                color: isActive ? "var(--text)" : "var(--muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                fontFamily: "var(--font-sans)",
              }}>
                {tab.name.replace(/\.(pdf|epub)$/i, "")}
              </span>
              {tab.totalPages > 0 && (
                <span style={{ fontSize: "10px", color: "var(--muted)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                  <span className="sr-only">{tab.kind === "epub" ? "chapter" : "page"} </span>{tab.page}/{tab.totalPages}
                </span>
              )}
            </button>
            {/* Close button */}
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                fontSize: "13px",
                lineHeight: 1,
                cursor: "pointer",
                padding: "0 2px",
                flexShrink: 0,
                borderRadius: "3px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "44px",
                transition: "background 0.1s, color 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(244,112,103,0.2)";
                e.currentTarget.style.color = "#f47067";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--muted)";
              }}
              aria-label={`Close ${tab.name}`}
            >
              ×
            </button>
          </li>
        );
      })}
      </ul>

      {/* New tab button */}
      <button
        onClick={handleNewTab}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          fontSize: "18px",
          lineHeight: 1,
          cursor: "pointer",
          padding: "0 10px",
          height: "100%",
          flexShrink: 0,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent)"}
        onMouseLeave={(e) => e.currentTarget.style.color = "var(--muted)"}
        title="Open document"
        aria-label="Open document in new tab"
      >
        +
      </button>
    </nav>
  );
}
