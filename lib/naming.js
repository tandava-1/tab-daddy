// Natural names for new groups, from an AI model behind our own small server.
// Grouping never depends on this: the groups are already decided locally, and
// if anything here fails, they keep their word-matching names.
//
// What leaves the browser, per group: a handful of words that appear on at
// least two of its tabs (cluster.js:sharedWordsOf), cleaned again below. Never
// page text, titles or addresses, and nothing from a page with a password,
// card or one-time-code field. Only after the user says yes.

// Set when the naming server is deployed (slice 4b).
export const NAMING_ENDPOINT = 'https://tab-daddy-names.invalid/name';

// The popup waits this long for names before showing groups without them.
const TIMEOUT_MS = 3000;

// Same shared words -> same name. Reopening the popup on the same tabs costs no
// call, which matters because the free model allowance is shared by every user.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;

const MIN_WORDS = 2;      // fewer than this isn't enough to name anything
const MAX_NAME_CHARS = 24; // fits Chrome's tab-group label
const MAX_NAME_WORDS = 4;

const KEYS = { consent: 'aiNaming', installId: 'installId', cache: 'nameCache' };

/**
 * Second line of defence after the two-tab rule: drop anything that looks like
 * a number, code, email or handle rather than an ordinary word.
 */
export function cleanWords(words) {
  return words.filter((w) =>
    /^\p{L}+$/u.test(w) &&     // letters only: no digits, @, dots or symbols
    w.length <= 20 &&
    !/^[a-f]{12,}$/.test(w));  // long hex-looking strings
}

/** The groups worth naming, with the words we're allowed to send for each. */
export function namingRequests(groups) {
  return groups
    .filter((g) => g.source === 'content')
    .map((g) => ({ key: g.key, words: cleanWords(g.sharedWords ?? []) }))
    .filter((r) => r.words.length >= MIN_WORDS);
}

/** A name from the model, tidied, or null if it isn't fit to show. */
export function validName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw
    .replace(/["'`*_]/g, '')
    .replace(/[.!?:;,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || name.length > MAX_NAME_CHARS) return null;
  if (name.split(' ').length > MAX_NAME_WORDS) return null;
  if (/[@/\\]|\.[a-z]{2,}\b|https?/i.test(name)) return null; // no addresses or handles
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** 'yes', 'no', or null when the user hasn't been asked yet. */
export async function getConsent(storage = chrome.storage.local) {
  const { [KEYS.consent]: value } = await storage.get(KEYS.consent);
  return value === 'yes' || value === 'no' ? value : null;
}

export function setConsent(value, storage = chrome.storage.local) {
  return storage.set({ [KEYS.consent]: value });
}

/** A random ID per install, so the server can share its allowance fairly. */
async function installId(storage) {
  const { [KEYS.installId]: existing } = await storage.get(KEYS.installId);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await storage.set({ [KEYS.installId]: id });
  return id;
}

const cacheKey = (words) => words.join(' ');

/**
 * Names for the given groups, as Map<groupKey, name>. Groups missing from the
 * map keep their word-matching name. Never throws.
 */
export async function nameGroups(groups, {
  storage = chrome.storage.local,
  fetchImpl = (...args) => fetch(...args),
  endpoint = NAMING_ENDPOINT,
  now = Date.now()
} = {}) {
  const names = new Map();
  const requests = namingRequests(groups);
  if (!requests.length) return names;

  try {
    const { [KEYS.cache]: cache = {} } = await storage.get(KEYS.cache);
    const misses = [];
    for (const r of requests) {
      const hit = cache[cacheKey(r.words)];
      if (hit && now - hit.at < CACHE_TTL_MS) names.set(r.key, hit.name);
      else misses.push(r);
    }
    if (!misses.length) return names;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let reply;
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          installId: await installId(storage),
          groups: misses.map((r, i) => ({ id: `g${i}`, words: r.words }))
        }),
        signal: controller.signal
      });
      if (!res.ok) return names;
      reply = await res.json();
    } finally {
      clearTimeout(timer);
    }

    misses.forEach((r, i) => {
      const name = validName(reply?.names?.[`g${i}`]);
      if (!name) return;
      names.set(r.key, name);
      cache[cacheKey(r.words)] = { name, at: now };
    });

    // Keep the cache small: newest entries win.
    const trimmed = Object.fromEntries(
      Object.entries(cache).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_CACHE_ENTRIES)
    );
    await storage.set({ [KEYS.cache]: trimmed });
  } catch {
    // Offline, timed out, allowance used up, bad reply: word names stand.
  }
  return names;
}
