import React from "react";
import { useStore } from "../store/useStore.js";
import styles from "./SettingsPanel.module.css";

const MODES = [
  { id: "dark",   label: "Dark",   bg: "#1a1f2a", fg: "#e6edf3" },
  { id: "light",  label: "Light",  bg: "#f5f0e8", fg: "#1a1a2e" },
  { id: "sepia",  label: "Sepia",  bg: "#f0e6c8", fg: "#3d2b1a" },
  { id: "amoled", label: "AMOLED", bg: "#000000", fg: "#d0d0d0" },
  { id: "green",  label: "Matrix", bg: "#0a1a0a", fg: "#90ee90" },
];

const HL_COLORS = [
  { id: "yellow", bg: "rgba(255,214,0,0.65)" },
  { id: "blue",   bg: "rgba(79,195,247,0.65)" },
  { id: "pink",   bg: "rgba(244,143,177,0.65)" },
  { id: "green",  bg: "rgba(165,214,167,0.65)" },
];

export default function SettingsPanel({ onClose }) {
  const readingMode  = useStore((s) => s.readingMode);
  const fontSize     = useStore((s) => s.fontSize);
  const lineHeight   = useStore((s) => s.lineHeight);
  const margin       = useStore((s) => s.margin);
  const brightness   = useStore((s) => s.brightness);
  const hlColor      = useStore((s) => s.hlColor);
  const annotations  = useStore((s) => s.annotations);
  const activeTab = useStore((s) => s.getActiveTab());
  const filePath = activeTab?.path ?? null;
  const invertColors = useStore((s) => s.invertColors);

  const setReadingMode   = useStore((s) => s.setReadingMode);
  const setFontSize      = useStore((s) => s.setFontSize);
  const setLineHeight    = useStore((s) => s.setLineHeight);
  const setMargin        = useStore((s) => s.setMargin);
  const setBrightness    = useStore((s) => s.setBrightness);
  const setHlColor       = useStore((s) => s.setHlColor);
  const toggleInvert     = useStore((s) => s.toggleInvert);
  const removeAnnotation = useStore((s) => s.removeAnnotation);

  const fileAnnotations = annotations.filter((a) => a.filePath === filePath);

  return (
    <aside className={styles.panel} aria-label="Settings and annotations">
      <header className={styles.header}>
        <span>Display &amp; Notes</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">✕</button>
      </header>

      <div className={styles.scroll}>
        {/* Reading mode */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Reading mode</h3>
          <div className={styles.pills}>
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`${styles.pill} ${readingMode === m.id ? styles.pillActive : ""}`}
                style={readingMode === m.id ? { background: m.bg, color: m.fg, borderColor: m.fg } : {}}
                onClick={() => setReadingMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        {/* Invert toggle */}
        <section className={styles.section}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>Invert colours</span>
            <button
              onClick={toggleInvert}
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: invertColors ? "var(--accent)" : "transparent",
                color: invertColors ? "#000" : "var(--muted)",
                cursor: "pointer",
                fontSize: "11px",
                fontFamily: "var(--font-sans)",
              }}
            >
              {invertColors ? "On" : "Off"}
            </button>
          </div>
        </section>

        {/* Sliders */}
        <section className={styles.section}>
          <SliderRow label="Brightness" min={10}  max={100} value={brightness}               display={`${brightness}%`}           onChange={setBrightness} />
          <SliderRow label="Font size"  min={12}  max={24}  value={fontSize}                 display={`${fontSize}px`}            onChange={setFontSize} />
          <SliderRow label="Line height" min={14} max={30}  value={Math.round(lineHeight*10)} display={(lineHeight).toFixed(1)}    onChange={(v) => setLineHeight(v/10)} />
          <SliderRow label="Margins"    min={16}  max={80}  value={margin}                   display={`${margin}px`}              onChange={setMargin} />
        </section>

        {/* Highlight colour */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Highlight colour</h3>
          <div className={styles.swatches}>
            {HL_COLORS.map((c) => (
              <button
                key={c.id}
                className={`${styles.swatch} ${hlColor === c.id ? styles.swatchActive : ""}`}
                style={{ background: c.bg }}
                onClick={() => setHlColor(c.id)}
                aria-label={`${c.id} highlight`}
              />
            ))}
          </div>
        </section>

        {/* Annotations */}
        <section className={styles.annotSection}>
          <h3 className={styles.sectionTitle}>Annotations ({fileAnnotations.length})</h3>
          {fileAnnotations.length === 0 ? (
            <p className={styles.empty}>
              Open a PDF and select text to add highlights and annotations.
            </p>
          ) : (
            fileAnnotations.map((a) => (
              <div key={a.id} className={styles.annotItem}>
                <p className={styles.annotQuote}>
                  "{a.quote.slice(0, 90)}{a.quote.length > 90 ? "…" : ""}"
                </p>
                <div className={styles.annotMeta}>
                  <span>Page {a.page}</span>
                  <button
                    className={styles.annotDelete}
                    onClick={() => removeAnnotation(a.id)}
                    aria-label="Delete annotation"
                  >×</button>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </aside>
  );
}

function SliderRow({ label, min, max, value, display, onChange }) {
  return (
    <div className={styles.sliderRow}>
      <span className={styles.sliderLabel}>{label}</span>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
      <span className={styles.sliderVal}>{display}</span>
    </div>
  );
}
