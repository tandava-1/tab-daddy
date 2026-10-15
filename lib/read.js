// Reads a short summary of what each open page is about: its title, its own
// description, its main headings and the start of its main text. Everything
// stays in the popup's memory and is gone when the popup closes.

import { isReadable } from './tabs.js';

// Access to every site is optional: the extension installs without it and asks
// the first time the user wants content-based grouping.
const ALL_SITES = { origins: ['<all_urls>'] };

// A page that hangs (a heavy app, a stalled load) must not hold up the rest.
const PER_TAB_TIMEOUT_MS = 1500;
const CONCURRENCY = 8;

export function hasPageAccess() {
  return chrome.permissions.contains(ALL_SITES);
}

/** Must be called from a user gesture (a click), or Chrome rejects it. */
export function requestPageAccess() {
  return chrome.permissions.request(ALL_SITES);
}

/**
 * Reads every readable tab in parallel, a few at a time.
 * Returns Map<tabId, { title, description, headings, body }>; tabs that could
 * not be read are simply absent and fall back to their title and address.
 */
export async function readPages(tabs, { onProgress } = {}) {
  const queue = tabs.filter(isReadable);
  const total = queue.length;
  const pages = new Map();
  let done = 0;

  async function worker() {
    while (queue.length) {
      const tab = queue.shift();
      const page = await readOne(tab);
      if (page) pages.set(tab.id, page);
      onProgress?.(++done, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
  return pages;
}

async function readOne(tab) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PER_TAB_TIMEOUT_MS));
  const run = chrome.scripting
    .executeScript({ target: { tabId: tab.id }, func: extractPage })
    .then(([frame]) => frame?.result ?? null)
    .catch(() => null);
  return Promise.race([run, timeout]);
}

/**
 * Runs inside the page, so it must be self-contained: Chrome serialises the
 * function source and nothing from this module's scope comes with it.
 */
export function extractPage() {
  const MAX_BODY_CHARS = 1500;
  const MAX_HEADINGS = 8;
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const meta = (selector) => clean(document.querySelector(selector)?.getAttribute('content'));

  // Page furniture: where sites put menus, account names ("Hello, Priya"),
  // cookie banners and footers. Never read, so it can't group or name anything.
  // A <header> inside the article is the article's own headline and byline, so
  // only site-level headers count as furniture.
  const FURNITURE = 'nav, footer, aside, form, button, select, script, style, noscript, svg, template, ' +
    '[role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], [role="search"], ' +
    '[role="dialog"], [aria-hidden="true"], [hidden]';
  // Hidden text (closed menus, language pickers, off-screen drawers) is never
  // read: on Wikipedia it's a list of 300 language names. Chrome's own
  // visibility check, cached per element since siblings share a parent.
  const visible = new Map();
  const isVisible = (el) => {
    if (!visible.has(el)) visible.set(el, el.checkVisibility ? el.checkVisibility() : true);
    return visible.get(el);
  };
  const isFurniture = (el) => {
    if (!el) return false;
    if (el.closest(FURNITURE)) return true;
    const header = el.closest('header');
    if (header && !header.closest('article, main, [role="main"]')) return true;
    return !isVisible(el);
  };

  // Prefer the page's own idea of its main content over nav, footers and ads.
  const root = document.querySelector('article, main, [role="main"]') || document.body;

  // Collect text node by node, skipping furniture and stopping once there's
  // enough. A walker keeps word boundaries between blocks and needs no layout.
  const parts = [];
  let length = 0;
  if (root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (isFurniture(node.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    while (length < MAX_BODY_CHARS && walker.nextNode()) {
      const text = clean(walker.currentNode.nodeValue);
      if (text) { parts.push(text); length += text.length + 1; }
    }
  }

  const headings = [...(root || document).querySelectorAll('h1, h2')]
    .filter((h) => !isFurniture(h))
    .map((h) => clean(h.textContent))
    .filter(Boolean)
    .slice(0, MAX_HEADINGS);

  // What the page says it is: schema.org types and Open Graph. Used only to
  // pick a use case (Shopping, News, Recipe...) on this computer.
  const types = new Set();
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 4 || types.size > 20) return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    const t = node['@type'];
    (Array.isArray(t) ? t : [t]).forEach((x) => typeof x === 'string' && types.add(x));
    if (node['@graph']) walk(node['@graph'], depth + 1);
    if (node.mainEntity) walk(node.mainEntity, depth + 1);
  };
  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 10)) {
    try { walk(JSON.parse(script.textContent), 0); } catch { /* malformed data: ignore */ }
  }
  const price = Boolean(document.querySelector(
    '[itemprop="price"], meta[property="product:price:amount"], meta[property="og:price:amount"]'));
  const cart = [...document.querySelectorAll('button, input[type="submit"], [role="button"]')]
    .slice(0, 300)
    .some((b) => /add to (cart|bag|basket)|buy now/i.test(b.textContent || b.value || ''));

  return {
    title: clean(document.title),
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    headings,
    body: parts.join(' ').slice(0, MAX_BODY_CHARS),
    clues: { types: [...types], ogType: meta('meta[property="og:type"]'), price, cart }
  };
}
