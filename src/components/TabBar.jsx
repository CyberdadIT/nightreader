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

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      background: "var(--bg)",
      borderBottom: "1px solid var(--border)",
      overflowX: "auto",
      flexShrink: 0,
      height: "36px",
      paddingLeft: "4px",
    }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "0 10px 0 12px",
              height: "100%",
              cursor: "pointer",
              flexShrink: 0,
              maxWidth: "200px",
              minWidth: "100px",
              background: isActive ? "var(--surface)" : "transparent",
              borderRight: "1px solid var(--border)",
              borderTop: isActive ? `2px solid var(--accent)` : "2px solid transparent",
              transition: "background 0.15s",
              position: "relative",
            }}
          >
            {/* PDF icon */}
            <span style={{ fontSize: "11px", flexShrink: 0, opacity: 0.6 }}>📄</span>

            {/* File name */}
            <span style={{
              fontSize: "11px",
              color: isActive ? "var(--text)" : "var(--muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              fontFamily: "var(--font-sans)",
            }}
              title={tab.name}
            >
              {tab.name.replace(/\.pdf$/i, "")}
            </span>

            {/* Page indicator */}
            {tab.totalPages > 0 && (
              <span style={{
                fontSize: "9px",
                color: "var(--muted)",
                fontFamily: "var(--font-mono)",
                flexShrink: 0,
                opacity: 0.7,
              }}>
                {tab.page}/{tab.totalPages}
              </span>
            )}

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
                width: "16px",
                height: "16px",
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
          </div>
        );
      })}

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
        title="Open new PDF"
        aria-label="Open new PDF in new tab"
      >
        +
      </button>
    </div>
  );
}
