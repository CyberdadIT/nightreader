// Checks GitHub Releases for a newer NightReader. Nothing is downloaded or
// installed automatically: the user gets a link to the release page.

export const RELEASES_REPO = 'CyberdadIT/nightreader';
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases`;
const DAY = 24 * 60 * 60 * 1000;

/** Compare dotted versions ("v0.6.1" vs "0.6.0"). Pre-release suffixes are ignored. */
export function compareVersions(a, b) {
  const parts = v => String(v).trim().replace(/^v/i, '').split(/[-+]/)[0].split('.').map(n => parseInt(n, 10) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

export async function checkForUpdate(currentVersion, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) return { status: 'none' };
  if (!res.ok) throw new Error(`GitHub returned ${res.status}. Try again later.`);
  const release = await res.json();
  const version = String(release.tag_name || '').replace(/^v/i, '');
  const info = { version, url: safeReleaseUrl(release.html_url), name: String(release.name || `NightReader ${version}`).slice(0, 120) };
  return { status: compareVersions(version, currentVersion) > 0 ? 'available' : 'current', ...info };
}

/** The download link must be one of this project's release pages; anything else falls back to the list. */
export function safeReleaseUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${RELEASES_REPO}/releases/`) && !u.username && !u.password) return u.href;
  } catch { /* fall through */ }
  return RELEASES_PAGE;
}

/** Automatic checks run at most once a day. */
export const updateCheckDue = (lastCheck, now = Date.now()) => now - (lastCheck || 0) >= DAY;
