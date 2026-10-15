// Shared fixtures. Topic fixtures use made-up .example addresses so the site
// list (usecase.js) never claims them: they exercise topic grouping alone.
import fs from 'node:fs';

let nextId = 1;
export const tab = (url, title, extra = {}) => ({ id: nextId++, url, title, windowId: 1, pinned: false, groupId: -1, ...extra });
export const page = (title, description, headings, body, extra = {}) => ({ title, description, headings, body, ...extra });

/** [[tab, page], ...] sets -> { tabs, pages } */
export function build(...sets) {
  const tabs = [];
  const pages = new Map();
  for (const [t, p] of sets.flat()) {
    tabs.push(t);
    if (p) pages.set(t.id, p);
  }
  return { tabs, pages };
}

export const mortgage = [
  [tab('https://lenderhub.example/mortgages', 'Mortgage Rates Today | RateSite'),
   page('Mortgage Rates Today | RateSite', 'Compare current mortgage rates for 30-year fixed, 15-year fixed and adjustable-rate loans.',
     ['Today’s mortgage rates', 'How mortgage rates are set'],
     'The average 30-year fixed mortgage rate rose this week. Lenders set mortgage rates based on bond yields, your credit score, down payment and loan term. Compare lenders and lock a rate before closing on your home loan.')],
  [tab('https://homecalcz.example/mortgage-calculator', 'Mortgage Calculator - CalcSite'),
   page('Mortgage Calculator - CalcSite', 'Estimate your monthly mortgage payment including principal, interest, taxes and insurance.',
     ['Mortgage calculator', 'How much house can I afford?'],
     'Use this mortgage calculator to estimate your monthly payment. Enter the home price, down payment, interest rate and loan term. A larger down payment lowers the loan amount and the monthly mortgage payment.')],
  [tab('https://bankco.example/home-lending', 'Home Lending - BankSite'),
   page('Home Lending - BankSite', 'See today’s mortgage rates and refinance rates.',
     ['Mortgage and refinance rates', 'Get prequalified for a home loan'],
     'Explore fixed-rate and adjustable-rate mortgage options. Rates shown assume a down payment of 20 percent and a strong credit score. Talk to a home lending advisor about your loan.')]
];

export const recipes = [
  [tab('https://kitchenly.example/spaghetti-carbonara', 'The Best Spaghetti Carbonara Recipe'),
   page('The Best Spaghetti Carbonara Recipe', 'Silky carbonara with eggs, pecorino, guanciale and black pepper.',
     ['Spaghetti carbonara', 'Ingredients', 'Directions'],
     'Cook the guanciale until crisp. Whisk eggs with grated pecorino romano and plenty of black pepper. Toss the hot spaghetti with the guanciale fat, then the egg mixture, adding pasta water until glossy.')],
  [tab('https://cookbookz.example/ultimate-carbonara', 'Ultimate spaghetti carbonara recipe | FoodSite'),
   page('Ultimate spaghetti carbonara recipe | FoodSite', 'Discover how to make traditional spaghetti carbonara with pancetta, eggs and parmesan.',
     ['Ultimate spaghetti carbonara', 'Method'],
     'Put a large saucepan of water on to boil for the spaghetti. Beat the eggs with the parmesan and pecorino and season with black pepper. Fry the pancetta, then mix with the drained pasta and the egg mixture off the heat.')]
];

export const singles = [
  [tab('https://trackerz.example/issues/12345', 'Borrow checker ICE on async closures · Issue #12345'),
   page('Borrow checker ICE on async closures', '', ['Borrow checker ICE on async closures'],
     'The compiler panics with an internal compiler error when an async closure captures a mutable reference. Minimal reproduction attached. rustc nightly backtrace included.')],
  [tab('https://vidzz.example/watch?v=abc', 'Lo-fi beats to study to'),
   page('Lo-fi beats to study to', 'Relaxing lo-fi hip hop music for studying and focus.', [], 'Lo-fi hip hop radio. Chill beats to relax and study to.')]
];

// Same site, unrelated topics: with content in hand, the shared host must not group them.
export const sameSite = [
  [tab('https://repohub.example/facebook/react', 'facebook/react: The library for web and native user interfaces'),
   page('facebook/react', 'The library for web and native user interfaces.', ['React'],
     'React lets you build user interfaces out of components. Declarative views, component state and hooks make interactive web applications predictable.')],
  [tab('https://repohub.example/kubernetes/kubernetes', 'kubernetes/kubernetes: Production-Grade Container Scheduling and Management'),
   page('kubernetes/kubernetes', 'Production-Grade Container Scheduling and Management', ['Kubernetes'],
     'Kubernetes is an open source system for managing containerized applications across multiple hosts, providing deployment, scaling and service discovery for clusters.')]
];

// The regression: a broker and a shop share only "india".
export const india = [
  tab('https://brokerco.example/', "Broker - India's largest stock broker", { discarded: true }),
  tab('https://shopzone.example/', 'Online Shopping site in India: Shop Online for Mobiles, Books', { discarded: true })
];

// No page access at all: titles alone should still find the topic.
export const titleOnly = [
  tab('https://a.example/rates', 'Mortgage rates today: 30-year fixed climbs'),
  tab('https://b.example/calc', 'Mortgage calculator with taxes and insurance'),
  tab('https://c.example/news', 'Champions League final: match report')
];

export const genericNews = [
  [tab('https://news.example/election', 'Election results live - Example News'),
   page('Election results live - Example News', 'Live coverage of the general election count.', ['Election results', 'Latest updates'],
     'Votes are being counted across the country. Polling stations closed at ten. The governing party is projected to lose seats in parliament. Turnout was higher than the previous election.')],
  [tab('https://news.example/football', 'Champions League final report - Example News'),
   page('Champions League final report - Example News', 'Match report from the Champions League final.', ['Champions League final', 'Latest updates'],
     'A late goal settled the final. The striker scored in stoppage time after the goalkeeper parried a free kick. The manager praised the defence after the match.')]
];

/**
 * Real pages captured with lib/read.js:extractPage (tools/browser/extract-probe.mjs).
 * With `neutral`, each gets a made-up address so only its content counts.
 */
export function realPages({ neutral = true } = {}) {
  const raw = JSON.parse(fs.readFileSync(new URL('./real-pages.json', import.meta.url)));
  const tabs = [];
  const pages = new Map();
  raw.forEach((p, i) => {
    const t = tab(neutral ? `https://site${i}.example/page` : p.url, p.title, { realUrl: p.url });
    tabs.push(t);
    pages.set(t.id, p);
  });
  return { tabs, pages, by: (fragment) => tabs.find((t) => t.realUrl.includes(fragment)) };
}

/** chrome.storage.local stand-in. */
export function memStore(init = {}) {
  const data = { ...init };
  return { data, get: async (k) => (k in data ? { [k]: data[k] } : {}), set: async (o) => Object.assign(data, o) };
}

/** fetch stand-in for the naming server; records each request body. */
export function fakeFetch(reply, log = []) {
  const f = async (url, opts) => {
    const body = JSON.parse(opts.body);
    log.push(body);
    return { ok: true, json: async () => (typeof reply === 'function' ? reply(body) : reply) };
  };
  f.log = log;
  return f;
}
