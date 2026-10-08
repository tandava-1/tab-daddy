// Small helpers about tabs themselves: which ones take part, which can be read,
// and how to label and colour a group.

const IGNORED_SCHEMES = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'devtools:'];

export function isGroupable(tab) {
  if (!tab.url || tab.pinned) return false;
  try {
    const scheme = new URL(tab.url).protocol;
    return !IGNORED_SCHEMES.includes(scheme);
  } catch {
    return false;
  }
}

// Chrome refuses script injection into the Web Store, even with host access.
const UNREADABLE_HOSTS = ['chromewebstore.google.com', 'chrome.google.com'];

/**
 * Whether the page in this tab can be read right now. A discarded or not-yet-
 * loaded tab has no page in memory — reading it would mean reloading it, which
 * we deliberately don't do — so it falls back to its title and address.
 */
export function isReadable(tab) {
  if (tab.discarded || tab.status === 'unloaded') return false;
  try {
    const { protocol, hostname } = new URL(tab.url);
    return (protocol === 'http:' || protocol === 'https:') && !UNREADABLE_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

/** "docs.github.com" -> "github.com"; falls back to the hostname itself. */
export function siteKey(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host === 'localhost') return host;
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    // Handle two-part public suffixes like co.uk, com.au, co.in.
    const twoPartTld = /^(co|com|org|net|gov|edu|ac)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
    return parts.slice(twoPartTld ? -3 : -2).join('.');
  } catch {
    return '';
  }
}

/** "github.com" -> "Github" */
export function siteLabel(key) {
  const base = key.split('.')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const FALLBACK_COLORS = ['blue', 'cyan', 'green', 'yellow', 'orange', 'pink', 'purple', 'red'];

export function fallbackColor(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}
