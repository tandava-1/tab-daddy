import { categorize, siteKey, siteLabel, fallbackColor, isGroupable } from './categorize.js';
import { clusterByKeyword } from './keywords.js';

const MIN_GROUP_SIZE = 2;

const TRACKING_PARAMS = [
  /^utm_/, /^fbclid$/, /^gclid$/, /^gbraid$/, /^wbraid$/, /^msclkid$/, /^mc_[ce]id$/,
  /^igshid$/, /^ref$/, /^ref_src$/, /^ref_url$/, /^source$/, /^si$/, /^spm$/,
  /^_ga$/, /^yclid$/, /^scid$/, /^trk$/, /^cmpid$/
];

/**
 * Canonical form of a URL for duplicate comparison: scheme-insensitive,
 * www- and hash-stripped, tracking params removed, params sorted.
 */
export function canonicalUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return rawUrl;

  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.some((re) => re.test(k)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length
    ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&')
    : '';
  const path = u.pathname.replace(/\/+$/, '') || '/';
  return `${host}${path}${query}`;
}

/**
 * Builds the proposed groups for a set of tabs, as a fall-through pipeline:
 * topic rule -> site -> shared title keyword -> catch-all. Whatever fails one
 * pass gets another chance at the next, and a bucket needs MIN_GROUP_SIZE tabs
 * to survive so we never create a group of one.
 * Returns [{ key, name, color, tabs: [...], source: 'category'|'site'|'keyword'|'other' }]
 */
export function planGroups(tabs) {
  const groupable = tabs.filter(isGroupable);
  const byCategory = new Map();
  const leftovers = [];

  for (const tab of groupable) {
    const cat = categorize(tab.url);
    if (!cat) {
      leftovers.push(tab);
      continue;
    }
    if (!byCategory.has(cat.name)) {
      byCategory.set(cat.name, { key: `cat:${cat.name}`, name: cat.name, color: cat.color, tabs: [], source: 'category' });
    }
    byCategory.get(cat.name).tabs.push(tab);
  }

  const groups = [];
  for (const group of byCategory.values()) {
    if (group.tabs.length >= MIN_GROUP_SIZE) groups.push(group);
    else leftovers.push(...group.tabs);
  }

  const bySite = new Map();
  const stillLoose = [];
  for (const tab of leftovers) {
    const key = siteKey(tab.url);
    if (!key) {
      stillLoose.push(tab);
      continue;
    }
    if (!bySite.has(key)) {
      bySite.set(key, { key: `site:${key}`, name: siteLabel(key), color: fallbackColor(key), tabs: [], source: 'site' });
    }
    bySite.get(key).tabs.push(tab);
  }
  for (const group of bySite.values()) {
    if (group.tabs.length >= MIN_GROUP_SIZE) groups.push(group);
    else stillLoose.push(...group.tabs);
  }

  // Nothing matched on URL structure, so fall back to what the titles have in
  // common — this is what catches one topic spread across unrelated domains.
  const keywordGroups = clusterByKeyword(stillLoose, MIN_GROUP_SIZE);
  groups.push(...keywordGroups);

  const claimed = new Set(keywordGroups.flatMap((g) => g.tabs.map((t) => t.id)));
  const remainder = stillLoose.filter((tab) => !claimed.has(tab.id));

  // Confidence order: a topic rule is a deliberate judgement, a shared domain is
  // a fact, a shared title word is an inference. Show them in that order so the
  // least certain groups never lead.
  const CONFIDENCE = { category: 0, site: 1, keyword: 2 };
  groups.sort((a, b) =>
    CONFIDENCE[a.source] - CONFIDENCE[b.source] ||
    b.tabs.length - a.tabs.length ||
    a.name.localeCompare(b.name));

  // Appended after the sort: a junk drawer should never head the list.
  if (remainder.length >= MIN_GROUP_SIZE) {
    groups.push({ key: 'other', name: 'Everything else', color: 'grey', tabs: remainder, source: 'other' });
  }

  return groups;
}

/** Browser-internal pages are not "pages the user opened twice". */
function isDedupable(tab) {
  if (!tab.url) return false;
  try {
    const scheme = new URL(tab.url).protocol;
    return scheme === 'http:' || scheme === 'https:';
  } catch {
    return false;
  }
}

/**
 * Finds sets of tabs pointing at the same canonical URL.
 * Within each set the tab to keep is the active one, else the most recently
 * accessed; the rest are flagged as redundant.
 * Only http(s) tabs take part — three empty chrome://newtab pages are clutter,
 * but they are not duplicates in any sense the user wants flagged, and counting
 * them leaves a permanent badge nagging about blank tabs.
 * Returns [{ url, keep, duplicates: [...] }]
 */
export function findDuplicates(tabs) {
  const buckets = new Map();
  for (const tab of tabs) {
    if (!isDedupable(tab)) continue;
    const key = canonicalUrl(tab.url);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(tab);
  }

  const sets = [];
  for (const [url, group] of buckets) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    });
    const [keep, ...duplicates] = ranked;
    sets.push({ url, keep, duplicates });
  }

  sets.sort((a, b) => b.duplicates.length - a.duplicates.length);
  return sets;
}

export function countDuplicates(tabs) {
  return findDuplicates(tabs).reduce((total, set) => total + set.duplicates.length, 0);
}
