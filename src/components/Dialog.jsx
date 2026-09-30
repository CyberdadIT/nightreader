import React, { useEffect, useRef } from 'react';
import styles from './Dialog.module.css';

export { styles as dialogStyles };

/** Modal dialog: Escape and the backdrop close it; focus moves inside and returns afterwards. */
export default function Dialog({ title, onClose, wide = false, children, labelledBy }) {
  const box = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const first = box.current?.querySelector('[autofocus],input,select,textarea,button:not([data-close])');
    (first || box.current)?.focus();
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  }, [onClose]);
  return (
    <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className={`${styles.dialog} ${wide ? styles.wide : ''}`} role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : title} aria-labelledby={labelledBy} tabIndex={-1}>
        <div className={styles.header}>
          <h2>{title}</h2>
          <button className={styles.close} data-close onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
