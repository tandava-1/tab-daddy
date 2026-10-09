import { isGroupable, GROUP_COLORS } from './tabs.js';
import { clusterTabs, joinExisting } from './cluster.js';

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

/** Chrome's groupId for a tab that is in no group (chrome.tabGroups.TAB_GROUP_ID_NONE). */
const NO_GROUP = -1;

/**
 * Plans what to do with the user's ungrouped tabs, from what their pages say.
 *
 * First, each ungrouped tab is offered to the user's existing groups in its own
 * window. Whatever doesn't fit is grouped afresh. Tabs already in a group are
 * never moved; they only describe what their group is about.
 *
 * `pages` maps tabId -> page summary (read.js); tabs without one use their
 * title and address. `existingGroups` is chrome.tabGroups.query() output.
 *
 * Returns {
 *   additions: [{ key, groupId, windowId, name, color, tabs, source: 'existing' }],
 *   groups:    [{ key, name, color, tabs, source: 'content'|'other' }]
 * }
 * A new group needs MIN_GROUP_SIZE tabs; leftovers go to "Everything else".
 */
export function planGroups(tabs, pages = new Map(), existingGroups = []) {
  const groupable = tabs.filter(isGroupable);
  const ungrouped = groupable.filter((t) => (t.groupId ?? NO_GROUP) === NO_GROUP);

  const existing = existingGroups.map((g) => ({
    ...g,
    tabs: groupable.filter((t) => t.groupId === g.id)
  }));
  const { joins, rest } = joinExisting(ungrouped, existing, pages);

  const additions = existing
    .filter((g) => joins.has(g.id))
    .map((g) => ({
      key: `add:${g.id}`,
      groupId: g.id,
      windowId: g.windowId,
      name: g.title || 'Unnamed group',
      color: g.color,
      tabs: joins.get(g.id),
      source: 'existing'
    }))
    .sort((a, b) => b.tabs.length - a.tabs.length || a.name.localeCompare(b.name));

  const { groups, loose } = clusterTabs(rest, pages, MIN_GROUP_SIZE);
  // Hashing names to colours let two new groups share one. Hand them out in
  // turn instead, starting with colours none of the user's groups use.
  const taken = new Set(existingGroups.map((g) => g.color));
  const palette = [...GROUP_COLORS.filter((c) => !taken.has(c)), ...GROUP_COLORS.filter((c) => taken.has(c))];
  const planned = groups.map((g, i) => ({ ...g, color: palette[i % palette.length], source: 'content' }));

  // Last, and never pre-selected: a junk drawer should not head the list.
  if (loose.length >= MIN_GROUP_SIZE) {
    planned.push({ key: 'other', name: 'Everything else', color: 'grey', tabs: loose, source: 'other' });
  }
  return { additions, groups: planned };
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
