import React, { useEffect, useState } from "react";
import { notesMarkdown, notesHtml } from "../utils/export.js";
import { saveTextFile } from "../utils/platform.js";
import { useStore } from "../store/useStore.js";
import styles from "./SettingsPanel.module.css";
import { TagInput } from "./NotesLibrary.jsx";
import { deleteNoteWithUndo } from "./Toast.jsx";
import { ankiFlashcards } from "../utils/notes.js";
import { saveAnnotatedPdf, saveFilledPdf } from "../utils/annotatedPdf.js";

const MODES = [
  { id: "dark",          label: "Dark",           bg: "#1a1f2a", fg: "#e6edf3" },
  { id: "light",         label: "Light",          bg: "#f5f0e8", fg: "#1a1a2e" },
  { id: "sepia",         label: "Sepia",          bg: "#f0e6c8", fg: "#3d2b1a" },
  { id: "amoled",        label: "AMOLED",         bg: "#000000", fg: "#d0d0d0" },
  { id: "green",         label: "Matrix",         bg: "#0a1a0a", fg: "#90ee90" },
  { id: "night",         label: "Night",          bg: "#12151f", fg: "#8bb8e8" },
  { id: "nightContrast", label: "Night Contrast", bg: "#000000", fg: "#ffffff" },
  { id: "twilight",      label: "Twilight",       bg: "#1c1428", fg: "#c9a8f5" },
  { id: "console",       label: "Console",        bg: "#0f0c00", fg: "#ffb300" },
];

const HL_COLORS = [
  { id: "yellow", bg: "rgba(255,214,0,0.65)" },
  { id: "blue",   bg: "rgba(79,195,247,0.65)" },
  { id: "pink",   bg: "rgba(244,143,177,0.65)" },
  { id: "green",  bg: "rgba(165,214,167,0.65)" },
];

export default function SettingsPanel({ doc, onClose }) {
  const [exportError, setExportError] = useState("");
  const updateNote = useStore(s => s.updateAnnotationNote);
  const goToPage = useStore(s => s.setCurrentPage);
  const font = useStore(s => s.font);
  const setFont = useStore(s => s.setFont);
  const publisherStyles = useStore(s => s.publisherStyles);
  const setPublisherStyles = useStore(s => s.setPublisherStyles);
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
  const warmth = useStore((s) => s.warmth);
  const warmSchedule = useStore((s) => s.warmSchedule);
  const setWarmth = useStore((s) => s.setWarmth);
  const setWarmSchedule = useStore((s) => s.setWarmSchedule);

  const setReadingMode   = useStore((s) => s.setReadingMode);
  const setFontSize      = useStore((s) => s.setFontSize);
  const setLineHeight    = useStore((s) => s.setLineHeight);
  const setMargin        = useStore((s) => s.setMargin);
  const setBrightness    = useStore((s) => s.setBrightness);
  const setHlColor       = useStore((s) => s.setHlColor);
  const toggleInvert     = useStore((s) => s.toggleInvert);
  const removeAnnotation = useStore((s) => s.removeAnnotation);
  const updateAnnotation = useStore((s) => s.updateAnnotation);
  const [exportMessage, setExportMessage] = useState("");
  const [hasForm, setHasForm] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (doc?.kind === "pdf") doc.getFieldObjects().then(f => { if (!cancelled) setHasForm(!!f && Object.keys(f).length > 0); }).catch(() => {});
    return () => { cancelled = true; };
  }, [doc]);

  const fileAnnotations = annotations.filter((a) => a.filePath === filePath);

  async function exportNotes(format) {
    try {
      setExportError(""); setExportMessage("");
      if (format === "anki") {
        const doc = { name: activeTab?.name, kind: activeTab?.kind };
        await saveTextFile(`${(activeTab?.name || "document").replace(/[^a-zA-Z0-9._-]/g, "_")}-flashcards.txt`, ankiFlashcards(fileAnnotations.map(a => ({ ...a, document: doc }))));
        setExportMessage("Flashcards saved. In Anki, choose File → Import and pick the file.");
        return;
      }
      if (format === "filled") {
        if (await saveFilledPdf(activeTab, doc)) setExportMessage("Saved a copy with your form entries. Typed values last until you close the document, so save before closing.");
        return;
      }
      if (format === "pdf") {
        const { written, skipped } = await saveAnnotatedPdf(activeTab, fileAnnotations, doc);
        if (written !== null) setExportMessage(`Saved a copy with ${written} annotation${written === 1 ? "" : "s"}${skipped ? `. ${skipped} older note${skipped === 1 ? "" : "s"} without saved positions ${skipped === 1 ? "was" : "were"} left out; re-highlight ${skipped === 1 ? "it" : "them"} to include ${skipped === 1 ? "it" : "them"}` : ""}.`);
        return;
      }
      const name = (activeTab?.name || "document").replace(/[^a-zA-Z0-9._-]/g,"_");
      const printable = format === "html";
      await saveTextFile(`${name}-notes.${format}`, printable ? notesHtml(activeTab?.name, fileAnnotations, activeTab?.kind) : notesMarkdown(activeTab?.name, fileAnnotations, activeTab?.kind), printable ? "text/html" : "text/markdown");
    } catch(e) { setExportError(e.message); }
  }
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
                aria-pressed={readingMode === m.id}
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
          <SliderRow label="Brightness" min={5}   max={100} value={brightness}               display={`${brightness}%`}           onChange={setBrightness} />
          {activeTab?.kind === "epub" && <><label>Font<select aria-label="EPUB font" value={font} onChange={e => setFont(e.target.value)}><option value="serif">Serif</option><option value="sans">Sans</option><option value="mono">Monospace</option></select></label>
          <SliderRow label="Font size"  min={12}  max={24}  value={fontSize}                 display={`${fontSize}px`}            onChange={setFontSize} />
          <SliderRow label="Line height" min={14} max={30}  value={Math.round(lineHeight*10)} display={(lineHeight).toFixed(1)}    onChange={(v) => setLineHeight(v/10)} />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            <input type="checkbox" checked={publisherStyles || !!doc?.fixedLayout} disabled={!!doc?.fixedLayout} onChange={e => setPublisherStyles(e.target.checked)} />
            {doc?.fixedLayout ? "Book's own layout (always on for fixed-layout books)" : "Use the book's own styles"}
          </label></>}
          <SliderRow label="Margins"    min={16}  max={80}  value={margin}                   display={`${margin}px`}              onChange={setMargin} />
        </section>

        {/* Warm light */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Warm light</h3>
          <SliderRow label="Warmth" min={0} max={100} value={warmth} display={warmth ? `${warmth}%` : "Off"} onChange={setWarmth} />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            <input type="checkbox" checked={warmSchedule.enabled} onChange={e => setWarmSchedule({ enabled: e.target.checked })} />
            Only in the evening
          </label>
          {warmSchedule.enabled && <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--muted)", marginTop: 6, flexWrap: "wrap" }}>
            From <input type="time" className={styles.timeInput} aria-label="Warm light starts" value={warmSchedule.start} onChange={e => setWarmSchedule({ start: e.target.value })} />
            to <input type="time" className={styles.timeInput} aria-label="Warm light ends" value={warmSchedule.end} onChange={e => setWarmSchedule({ end: e.target.value })} />
          </div>}
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
          <div className="exportActions"><button disabled={!fileAnnotations.length} onClick={() => exportNotes("md")}>Export Markdown</button><button disabled={!fileAnnotations.length} onClick={() => exportNotes("html")}>Export printable HTML</button><button disabled={!fileAnnotations.length} onClick={() => exportNotes("anki")}>Export flashcards (Anki)</button>{activeTab?.kind !== "epub" && <button disabled={!fileAnnotations.length} onClick={() => exportNotes("pdf")}>Save annotated PDF copy</button>}{hasForm && <button onClick={() => exportNotes("filled")}>Save filled form copy</button>}</div>
          {exportError && <p role="alert">{exportError}</p>}
          {exportMessage && <p role="status" style={{ fontSize: 12, color: "var(--muted)" }}>{exportMessage}</p>}
          {fileAnnotations.length === 0 ? (
            <p className={styles.empty}>
              Open a PDF and select text to add highlights and annotations.
            </p>
          ) : (
            fileAnnotations.map((a) => (
              <div key={a.id} className={styles.annotItem}>
                <button className={styles.annotQuote} onClick={() => goToPage(a.page)} title="Go to passage">
                  "{a.quote.slice(0, 90)}{a.quote.length > 90 ? "…" : ""}"
                </button>
                <textarea aria-label={`Note for ${activeTab?.kind === "epub" ? "chapter" : "page"} ${a.page}`} value={a.note || ""} placeholder="Add your note…" onChange={e => updateNote(a.id, e.target.value)} rows={3}/>
                <TagInput tags={a.tags || []} onChange={tags => updateAnnotation(a.id, { tags })} label={`Tags for ${activeTab?.kind === "epub" ? "chapter" : "page"} ${a.page}`} />
                <div className={styles.annotMeta}>
                  <span>{activeTab?.kind === "epub" ? "Chapter" : "Page"} {a.page}</span>
                  <button
                    className={styles.annotDelete}
                    onClick={() => deleteNoteWithUndo(a.id)}
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
