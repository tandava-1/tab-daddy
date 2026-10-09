// Splits page text and titles into significant words: lowercased, deduplicated
// within a field, with filler and page-chrome words removed. The grouping in
// cluster.js only ever sees what survives this.

const MIN_TOKEN_LENGTH = 4;

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
  'global', 'world', 'worldwide', 'international', 'national', 'official',
  // page furniture — words that sit in the body text of almost every page
  // because of menus, cookie banners, share buttons and footers
  'menu', 'navigation', 'skip', 'content', 'main', 'toggle', 'close', 'open',
  'cookie', 'cookies', 'privacy', 'policy', 'terms', 'accept', 'consent',
  'subscribe', 'subscription', 'newsletter', 'share', 'follow', 'comment',
  'comments', 'reply', 'like', 'likes', 'views', 'contact', 'help', 'support',
  'copyright', 'rights', 'reserved', 'menu', 'next', 'previous', 'back',
  'show', 'hide', 'view', 'list', 'today', 'yesterday', 'ago', 'minutes',
  'hours', 'days', 'week', 'month', 'year', 'january', 'february', 'march',
  'april', 'june', 'july', 'august', 'september', 'october', 'november',
  'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'please', 'enable', 'javascript', 'browser', 'continue',
  'learn', 'find', 'first', 'last', 'all', 'your', 'about', 'people', 'time',
  'also', 'other', 'well', 'into', 'over', 'because', 'were', 'was', 'are',
  'is', 'it', 'its', 'you', 'our', 'out', 'not', 'how', 'why', 'who', 'all',
  'any', 'one', 'two', 'three', 'may', 'might', 'must', 'said', 'says', 'see',
  // encyclopedia and repository furniture: Wikipedia and GitHub are open in a
  // lot of tab sets, and their chrome otherwise pulls unrelated articles together
  'wikipedia', 'encyclopedia', 'article', 'talk', 'tools', 'languages', 'edit',
  'citations', 'citation', 'sources', 'references', 'redirected', 'disambiguation',
  'unsourced', 'improve', 'removed', 'message', 'retrieved', 'archived',
  'repository', 'readme', 'license', 'fork', 'forks', 'star', 'stars', 'issues',
  'pull', 'requests', 'commit', 'commits', 'branch', 'contributing', 'conduct'
]);

// "Page Title – Site Name" is near-universal. Without stripping the trailing
// segment, every tab on a site shares that site's name as a "keyword" and the
// keyword pass just re-derives site clustering.
const TITLE_SUFFIX = /\s+[–—|·:-]\s+[^–—|·:-]{1,40}$/;

/**
 * "components" and "component" are the same word for matching. Only plain
 * plurals are folded; "class", "status", "analysis" and "famous" are left alone.
 */
function singular(word) {
  if (word.length <= 4) return word;
  if (word.endsWith('ies') && word.length > 5) return word.slice(0, -3) + 'y';
  if (word.endsWith('s') && !/(ss|us|is|ous)$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Significant words in any text, in order of first appearance, no repeats. */
export function tokenize(text) {
  if (!text) return [];
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .map(singular)
      .filter((word) =>
        word.length >= MIN_TOKEN_LENGTH &&
        !/^\d+$/.test(word) &&
        !STOPWORDS.has(word))
  )];
}

/** Significant words in a tab title, with the trailing "– Site Name" dropped. */
export function titleTokens(title) {
  return title ? tokenize(title.replace(TITLE_SUFFIX, '')) : [];
}
