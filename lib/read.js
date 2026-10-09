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

  const headings = [...document.querySelectorAll('h1, h2')]
    .map((h) => clean(h.innerText))
    .filter(Boolean)
    .slice(0, MAX_HEADINGS);

  // Prefer the page's own idea of its main content over nav, footers and ads.
  const root = document.querySelector('article, main, [role="main"]') || document.body;

  // A page asking for a password, card details or a one-time code is never used
  // for anything that leaves the browser. It is still grouped locally.
  const sensitive = Boolean(document.querySelector(
    'input[type="password"], input[autocomplete^="cc-"], input[autocomplete="one-time-code"]'
  ));

  return {
    sensitive,
    title: clean(document.title),
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    headings,
    body: clean(root?.innerText).slice(0, MAX_BODY_CHARS)
  };
}
