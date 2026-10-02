import React from 'react';
import Dialog, { dialogStyles as styles } from './Dialog.jsx';

const K = ({ children }) => <kbd>{children}</kbd>;

const GROUPS = [
  ['Moving around', [
    [<><K>→</K><K>Page Down</K></>, 'Next page or chapter'],
    [<><K>←</K><K>Page Up</K></>, 'Previous page or chapter'],
    [<><K>↓</K><K>↑</K></>, 'Scroll; at the edge, turn the page'],
    [<K>Space</K>, 'Scroll down a screen; at the bottom, next page'],
    ['Mouse wheel', 'Scroll; one more notch at the edge turns the page'],
  ]],
  ['View', [
    [<><K>+</K><K>−</K></>, 'Zoom in / out'],
    [<><K>Ctrl</K>+ mouse wheel</>, 'Zoom a PDF, or change EPUB text size'],
    [<><K>Ctrl</K><K>0</K></>, 'Reset zoom to 100%'],
    [<K>R</K>, 'Focus mode on / off'],
  ]],
  ['Touch screen', [
    ['Swipe left / right', 'Next / previous page or chapter'],
    ['Swipe up at the bottom of a page', 'Next page; swipe down at the top for the previous one'],
    ['Pinch', 'Zoom a PDF, or change EPUB text size'],
    ['Long-press and drag', 'Select text to highlight, note or define'],
  ]],
  ['Surface Pen and other styluses (PDF)', [
    ['Write on the page', 'Draws ink straight away; no tool needed'],
    ['Turn the pen over', 'The eraser end removes strokes it touches'],
    [<><K>Ctrl</K><K>Z</K></>, 'Undo the last stroke or erase'],
    ['✒ Ink in the toolbar', 'Draw with a mouse too; choose colour and thickness'],
  ]],
  ['Tools', [
    [<><K>Ctrl</K><K>F</K></>, 'Find in document'],
    [<><K>Ctrl</K><K>P</K></>, 'Print'],
    [<K>Esc</K>, 'Close search or a dialog'],
    [<K>?</K>, 'Show this list'],
  ]],
];

export default function ShortcutsHelp({ onClose }) {
  return (
    <Dialog title="Keyboard and mouse shortcuts" onClose={onClose}>
      {GROUPS.map(([title, rows]) => (
        <section key={title}>
          <h3>{title}</h3>
          <table className={styles.keys}><tbody>
            {rows.map(([keys, what], i) => <tr key={i}><td>{keys}</td><td>{what}</td></tr>)}
          </tbody></table>
        </section>
      ))}
      <p style={{ marginTop: 14 }}>On a Mac, use <K>⌘</K> in place of <K>Ctrl</K>.</p>
    </Dialog>
  );
}
