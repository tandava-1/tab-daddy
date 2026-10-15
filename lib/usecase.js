// What a tab is being used for: shopping, social, coding, a spreadsheet...
// Decided on the user's computer, first from the site list (sites.js), then
// from clues the page gives about itself. Tabs with a use case are grouped by
// it; the rest are grouped by topic.

import { CATEGORIES, SITE_RULES } from './sites.js';

// host -> [{ path, query, category }], built once.
const BY_HOST = new Map();
for (const [host, path, query, i] of SITE_RULES) {
  if (!BY_HOST.has(host)) BY_HOST.set(host, []);
  BY_HOST.get(host).push({ path, query: query.toLowerCase(), category: CATEGORIES[i] });
}
// Longest path first, then rules with a query before those without, so the
// most specific rule on a host wins.
for (const list of BY_HOST.values()) {
  list.sort((a, b) => b.path.length - a.path.length || b.query.length - a.query.length);
}

function matchOn(rules, pathname, search) {
  for (const rule of rules) {
    if (rule.path && !pathname.startsWith(rule.path)) continue;
    if (rule.query && !search.includes(rule.query)) continue;
    return rule.category;
  }
  return null;
}

/**
 * The use case of an address from the site list, or null. Tries the full host
 * first, then each parent domain, so "docs.google.com/spreadsheets" beats
 * "google.com"; at each level, "*.parent" rules count too.
 */
export function siteCategory(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const labels = parsed.hostname.toLowerCase().replace(/^www\./, '').split('.');
  const pathname = parsed.pathname;
  let search = parsed.search.toLowerCase();
  try { search = decodeURIComponent(search); } catch { /* malformed %-escape: match it raw */ }

  for (let i = 0; i < labels.length - 1; i++) {
    const host = labels.slice(i).join('.');
    // From the parent level up, "*.sharepoint.com" rules cover this address
    // too. They compete with the plain "sharepoint.com" rules on equal terms,
    // so a specific path ("/:x:/" -> Sheets) beats a whole-site default.
    const rules = [...(BY_HOST.get(host) ?? []), ...(i > 0 ? BY_HOST.get(`*.${host}`) ?? [] : [])]
      .sort((a, b) => b.path.length - a.path.length || b.query.length - a.query.length);
    const hit = matchOn(rules, pathname, search);
    if (hit) return hit;
  }
  return null;
}

// Clues a page gives about itself, from schema.org data and Open Graph tags
// (read.js:extractPage). Only types that are rarely wrong: a plain "Article"
// could be a blog, a doc or a news story, so it decides nothing.
// Product/Offer are left out: review and comparison sites (NerdWallet) tag the
// cards they review as Products. A shop shows a price and a cart button too,
// which is checked below.
const SHOP_TYPES = new Set(['product', 'productgroup', 'offer', 'aggregateoffer']);
const TYPE_CATEGORIES = {
  realestatelisting: 'Shopping',
  newsarticle: 'News', reportagenewsarticle: 'News', livebloggposting: 'News', liveblogposting: 'News',
  recipe: 'Food',
  jobposting: 'Jobs',
  course: 'Learning',
  lodgingbusiness: 'Travel', hotel: 'Travel', flight: 'Travel', trainreservation: 'Travel',
  medicalwebpage: 'Health', medicalcondition: 'Health', drug: 'Health',
  musicrecording: 'Music', musicalbum: 'Music', musicplaylist: 'Music'
};

/** The use case from a page's own clues, or null. */
export function clueCategory(clues) {
  if (!clues) return null;
  for (const type of clues.types ?? []) {
    const hit = TYPE_CATEGORIES[type.toLowerCase()];
    if (hit) return hit;
  }
  const og = (clues.ogType || '').toLowerCase();
  if (og.startsWith('video.')) return 'Video';
  if (og.startsWith('music.')) return 'Music';
  // A shop: a price and an add-to-cart button, or product data with either.
  const productData = (clues.types ?? []).some((t) => SHOP_TYPES.has(t.toLowerCase())) || /product/.test(og);
  if ((clues.price && clues.cart) || (productData && (clues.price || clues.cart))) return 'Shopping';
  return null;
}

/** A tab's use case: the site list first, then the page's clues. */
export function useCaseOf(tab, page) {
  return siteCategory(tab.url) ?? clueCategory(page?.clues);
}

/** Whether a group's name says it is for this use case ("Shopping", "shopping list"). */
export function nameMatchesUseCase(name, category) {
  if (!name) return false;
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  return n === c || n.split(/[^a-z]+/).includes(c.split(/[^a-z]+/)[0]);
}
