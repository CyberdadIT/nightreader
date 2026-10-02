import React, { useState } from 'react';
import Dialog, { dialogStyles as styles } from './Dialog.jsx';

export default function PasswordDialog({ name, incorrect, answer }) {
  const [password, setPassword] = useState('');
  return (
    <Dialog title="Password required" onClose={() => answer(null)}>
      <form onSubmit={e => { e.preventDefault(); if (password) answer(password); }}>
        <p>{name} is protected. Enter its password to open it. NightReader keeps the password only until you close the app.</p>
        {incorrect && <p className={styles.error} role="alert">That password didn't work. Try again.</p>}
        <input type="password" aria-label="PDF password" autoFocus autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} />
        <div className={styles.actions}>
          <button type="button" onClick={() => answer(null)}>Cancel</button>
          <button type="submit" className={styles.primary} disabled={!password}>Open</button>
        </div>
      </form>
    </Dialog>
  );
}
