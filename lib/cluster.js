// Groups tabs by what their pages are about. Each tab becomes a weighted bag of
// significant words; tabs are merged, most similar first, until nothing left is
// similar enough. This is the word-matching engine — the on-device AI, when it
// arrives, sits in front of it and falls back to it.

import { tokenize, titleTokens } from './keywords.js';
import { siteKey, siteLabel, fallbackColor } from './tabs.js';

// Where a word appears says how much it tells us. A title is the page's own
// one-line summary; description and headings are next; body text is noisiest.
const FIELD_WEIGHTS = { title: 3, description: 2, headings: 2, body: 1, site: 1 };

// Body text is long. Keeping only each tab's strongest words stops a long page
// drowning a short one, and keeps the similarity maths cheap.
const MAX_TERMS_PER_TAB = 40;

// Average similarity two clusters need before they merge. Tuned against the
// fixtures in the test harness: lower starts joining unrelated pages that share
// a couple of generic words; higher splits obvious topics apart.
const MERGE_THRESHOLD = 0.14;

// A link resting on one short shared word is a coincidence, not a topic —
// "india" once joined a broker and a shopping site. Two tabs only count as
// related if they share two words, or one word longer than this.
const SHORT_TOKEN_MAX = 5;
const CORROBORATING_TOKENS = 2;

// A word must appear in at least this share of a group's tabs to name it.
const NAME_COVERAGE = 0.5;

/**
 * The words describing one tab. With page content: title, description,
 * headings and body. Without it: the title and the site's name — the
 * "title and address" fallback.
 */
export function termsFor(tab, page) {
  const weights = new Map();
  const add = (tokens, weight) => {
    for (const t of tokens) weights.set(t, (weights.get(t) ?? 0) + weight);
  };

  if (page) {
    add(titleTokens(page.title || tab.title), FIELD_WEIGHTS.title);
    add(tokenize(page.description), FIELD_WEIGHTS.description);
    add(tokenize(page.headings?.join(' ')), FIELD_WEIGHTS.headings);
    add(tokenize(page.body), FIELD_WEIGHTS.body);
  } else {
    add(titleTokens(tab.title), FIELD_WEIGHTS.title);
    add(tokenize(siteLabel(siteKey(tab.url))), FIELD_WEIGHTS.site);
  }

  const strongest = [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TERMS_PER_TAB);
  return new Map(strongest);
}

/** Turns raw weights into unit-length vectors, discounting words every tab has. */
function vectorise(termMaps) {
  const n = termMaps.length;
  const docFreq = new Map();
  for (const terms of termMaps) {
    for (const t of terms.keys()) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  return termMaps.map((terms) => {
    const vec = new Map();
    let norm = 0;
    for (const [t, w] of terms) {
      const idf = Math.log((n + 1) / (docFreq.get(t) + 1)) + 1;
      const v = w * idf;
      vec.set(t, v);
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, v] of vec) vec.set(t, v / norm);
    return vec;
  });
}

function similarity(a, b) {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  let shared = 0;
  let hasLongShared = false;
  for (const [t, v] of small) {
    const w = large.get(t);
    if (w === undefined) continue;
    dot += v * w;
    shared++;
    if (t.length > SHORT_TOKEN_MAX) hasLongShared = true;
  }
  const corroborated = shared >= CORROBORATING_TOKENS || hasLongShared;
  return corroborated ? dot : 0;
}

/**
 * Average-linkage clustering: repeatedly merge the two clusters whose tabs are
 * most similar on average, stopping when the best pair falls below the
 * threshold. Returns arrays of indexes into the input.
 */
function agglomerate(vectors) {
  const n = vectors.length;
  // sums[i][j]: total pairwise similarity between clusters i and j.
  const sums = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sums[i][j] = sums[j][i] = similarity(vectors[i], vectors[j]);
    }
  }
  const members = Array.from({ length: n }, (_, i) => [i]);
  const alive = new Set(members.keys());

  for (;;) {
    let best = null;
    let bestScore = MERGE_THRESHOLD;
    for (const i of alive) {
      for (const j of alive) {
        if (j <= i) continue;
        const avg = sums[i][j] / (members[i].length * members[j].length);
        if (avg >= bestScore) { bestScore = avg; best = [i, j]; }
      }
    }
    if (!best) break;

    const [keep, drop] = best;
    for (const k of alive) {
      if (k === keep || k === drop) continue;
      sums[keep][k] = sums[k][keep] = sums[keep][k] + sums[drop][k];
    }
    members[keep].push(...members[drop]);
    alive.delete(drop);
  }

  return [...alive].map((i) => members[i]);
}

/** Names a group after the words most of its tabs share, strongest first. */
function nameFor(vectors) {
  const score = new Map();
  const coverage = new Map();
  for (const vec of vectors) {
    for (const [t, v] of vec) {
      score.set(t, (score.get(t) ?? 0) + v);
      coverage.set(t, (coverage.get(t) ?? 0) + 1);
    }
  }
  const candidates = [...score.entries()]
    .filter(([t]) => coverage.get(t) / vectors.length >= NAME_COVERAGE)
    .sort((a, b) => b[1] - a[1]);
  if (!candidates.length) return 'Related';

  const [[first, top], second] = candidates;
  const words = [first];
  // A second word earns its place only if it is nearly as strong as the first.
  if (second && second[1] >= top * 0.6) words.push(second[0]);
  const name = words.join(' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Groups tabs by content. `pages` maps tabId -> page summary from read.js; tabs
 * without an entry use their title and address.
 * Returns { groups: [{ key, name, color, tabs }], loose: [tab] } where loose
 * tabs matched nothing.
 */
export function clusterTabs(tabs, pages, minSize = 2) {
  const usable = [];
  const loose = [];
  for (const tab of tabs) {
    const terms = termsFor(tab, pages.get(tab.id));
    if (terms.size) usable.push({ tab, terms });
    else loose.push(tab);
  }

  const vectors = vectorise(usable.map((u) => u.terms));
  const groups = [];
  for (const indexes of agglomerate(vectors)) {
    const groupTabs = indexes.map((i) => usable[i].tab);
    if (groupTabs.length < minSize) {
      loose.push(...groupTabs);
      continue;
    }
    const name = nameFor(indexes.map((i) => vectors[i]));
    groups.push({ key: `topic:${name.toLowerCase()}`, name, color: fallbackColor(name.toLowerCase()), tabs: groupTabs });
  }

  // Two clusters can earn the same name; keys must stay unique for the popup.
  const seen = new Map();
  for (const g of groups) {
    const n = (seen.get(g.key) ?? 0) + 1;
    seen.set(g.key, n);
    if (n > 1) g.key += `#${n}`;
  }

  groups.sort((a, b) => b.tabs.length - a.tabs.length || a.name.localeCompare(b.name));
  return { groups, loose };
}
