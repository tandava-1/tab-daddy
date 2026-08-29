// Clusters tabs by significant words shared across their titles. This is the one
// signal URL structure cannot see: three mortgage tabs on nerdwallet.com,
// bankrate.com and chase.com share no domain and no topic rule, but their titles
// share a word.

import { siteLabel, fallbackColor } from './categorize.js';

const MIN_TOKEN_LENGTH = 4;
const MAX_KEYWORD_GROUPS = 5;

// Tokens this short are weak evidence on their own — "india" linking a broker
// to a shopping site is a coincidence, not a topic. A cluster keyed on a short
// token must be corroborated by a second word its tabs also share. Longer words
// ("mortgage", "thermostat") are specific enough to stand alone.
const SHORT_TOKEN_MAX = 5;
const CORROBORATING_TOKENS = 2;

// Words that co-occur across unrelated pages and would produce meaningless groups.
const STOPWORDS = new Set([
  // articles, conjunctions, prepositions
  'the', 'and', 'but', 'for', 'nor', 'yet', 'with', 'from', 'into', 'onto', 'upon',
  'over', 'under', 'about', 'after', 'before', 'between', 'through', 'during',
  'without', 'within', 'against', 'among', 'across', 'behind', 'beyond',
  // pronouns, determiners, quantifiers
  'this', 'that', 'these', 'those', 'they', 'them', 'their', 'there', 'here',
  'your', 'yours', 'ours', 'what', 'when', 'where', 'which', 'while', 'whose',
  'some', 'each', 'every', 'more', 'most', 'much', 'many', 'less', 'least',
  'other', 'another', 'same', 'such', 'than', 'then', 'both', 'either',
  // auxiliaries and common verbs
  'have', 'has', 'had', 'been', 'being', 'will', 'would', 'should', 'could',
  'can', 'cannot', 'does', 'doing', 'done', 'make', 'makes', 'made', 'need',
  'want', 'know', 'like', 'just', 'also', 'even', 'only', 'very', 'still',
  'using', 'used', 'get', 'gets', 'got',
  // web and page-chrome filler
  'home', 'page', 'site', 'website', 'www', 'com', 'net', 'org', 'html', 'http',
  'https', 'index', 'search', 'results', 'result', 'login', 'sign', 'signin',
  'welcome', 'official', 'online', 'free', 'new', 'news', 'update', 'updates',
  'guide', 'guides', 'best', 'top', 'review', 'reviews', 'tips', 'howto',
  'tutorial', 'introduction', 'overview', 'blog', 'post', 'article', 'video',
  'watch', 'read', 'more', 'click', 'here', 'untitled', 'loading', 'error',
  'notifications', 'inbox', 'dashboard', 'settings', 'profile', 'account',
  // commerce and marketing filler — extremely common in page titles and almost
  // never the actual subject the user is researching
  'shopping', 'shop', 'store', 'stores', 'buy', 'sell', 'price', 'prices',
  'pricing', 'deal', 'deals', 'offer', 'offers', 'discount', 'sale', 'cheap',
  'order', 'orders', 'cart', 'checkout', 'delivery', 'shipping', 'product',
  'products', 'brand', 'brands', 'plans', 'download', 'install', 'app', 'apps',
  'software', 'platform', 'service', 'services', 'solution', 'solutions',
  'company', 'business', 'features', 'mobile',
  // geography — real topics rarely hinge on a country name, but site titles are
  // full of them ("Online Shopping site in India", "... Platform India")
  'india', 'usa', 'america', 'american', 'canada', 'australia', 'europe',
  'global', 'world', 'worldwide', 'international', 'national', 'official'
]);

// "Page Title – Site Name" is near-universal. Without stripping the trailing
// segment, every tab on a site shares that site's name as a "keyword" and the
// keyword pass just re-derives site clustering.
const TITLE_SUFFIX = /\s+[–—|·:-]\s+[^–—|·:-]{1,40}$/;

export function titleTokens(title) {
  if (!title) return [];
  const trimmed = title.replace(TITLE_SUFFIX, '');
  return [...new Set(
    trimmed
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter((word) =>
        word.length >= MIN_TOKEN_LENGTH &&
        !/^\d+$/.test(word) &&
        !STOPWORDS.has(word))
  )];
}

/** How many significant words every tab in the set has in common. */
function sharedTokenCount(tabs) {
  let shared = null;
  for (const tab of tabs) {
    const tokens = new Set(titleTokens(tab.title));
    shared = shared === null ? tokens : new Set([...shared].filter((t) => tokens.has(t)));
    if (shared.size === 0) break;
  }
  return shared ? shared.size : 0;
}

/**
 * Greedily clusters tabs by shared title keyword.
 * Each round takes the token covering the most tabs, emits it as a group, and
 * removes those tabs from the pool — so a tab never lands in two keyword groups.
 * Returns [{ key, name, color, tabs, source: 'keyword' }]
 */
export function clusterByKeyword(tabs, minSize = 2) {
  let pool = tabs.filter((tab) => titleTokens(tab.title).length > 0);
  const groups = [];

  while (groups.length < MAX_KEYWORD_GROUPS) {
    const byToken = new Map();
    for (const tab of pool) {
      for (const token of titleTokens(tab.title)) {
        if (!byToken.has(token)) byToken.set(token, []);
        byToken.get(token).push(tab);
      }
    }

    // Widest cluster first; on a tie the longer, more specific word wins.
    const candidates = [...byToken.entries()]
      .filter(([, matches]) => matches.length >= minSize)
      .sort((a, b) => b[1].length - a[1].length || b[0].length - a[0].length);

    // Take the best candidate that survives corroboration, not merely the best.
    let best = null;
    for (const [token, matches] of candidates) {
      if (token.length > SHORT_TOKEN_MAX || sharedTokenCount(matches) >= CORROBORATING_TOKENS) {
        best = { token, matches };
        break;
      }
    }
    if (!best) break;

    groups.push({
      key: `kw:${best.token}`,
      name: siteLabel(best.token),
      color: fallbackColor(best.token),
      tabs: best.matches,
      source: 'keyword'
    });

    const claimed = new Set(best.matches.map((tab) => tab.id));
    pool = pool.filter((tab) => !claimed.has(tab.id));
  }

  return groups;
}
