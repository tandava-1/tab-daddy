// Use-case grouping: known sites and page clues come before topics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planGroups as plan } from '../lib/analyze.js';
import { siteCategory, clueCategory } from '../lib/usecase.js';
import * as F from './helpers.mjs';

test('site list: the founder\'s examples and the hard app cases', () => {
  const cases = {
    'https://www.myntra.com/shoes': 'Shopping', 'https://www.flipkart.com/x': 'Shopping', 'https://www.amazon.in/dp/B01': 'Shopping',
    'https://x.com/someone': 'Social', 'https://www.instagram.com/p/x': 'Social',
    'https://chatgpt.com/c/1': 'AI', 'https://claude.ai/new': 'AI', 'https://gemini.google.com/app': 'AI',
    'https://docs.google.com/spreadsheets/d/a/edit': 'Sheets', 'https://docs.google.com/document/d/a/edit': 'Docs',
    'https://docs.google.com/presentation/d/a/edit': 'Slides',
    'https://contoso.sharepoint.com/:x:/r/sites/a/b.xlsx': 'Sheets', 'https://contoso.sharepoint.com/:w:/s/a/b': 'Docs',
    'https://contoso-my.sharepoint.com/_layouts/15/Doc.aspx?file=Budget.xlsx&action=default': 'Sheets',
    'https://www.nytimes.com/2026/x': 'News', 'https://timesofindia.indiatimes.com/india/x': 'News',
    'https://github.com/facebook/react': 'Coding', 'https://stackoverflow.com/questions/1': 'Coding',
    'https://mail.google.com/mail/u/0/': 'Email & calendar', 'https://www.google.com/search?q=x': 'Search',
    'https://www.google.com/maps/place/x': 'Travel', 'https://www.amazon.in/gp/video/detail/x': 'Video',
    'https://somestate.gov.in/x': 'Government', 'https://kite.zerodha.com/': 'Money', 'https://zerodha.com/varsity/x': 'Learning',
    'https://en.wikipedia.org/wiki/Lisbon': 'Reference', 'https://teams.microsoft.com/v2/': 'Chat & calls'
  };
  for (const [url, want] of Object.entries(cases)) assert.equal(siteCategory(url), want, url);
  assert.equal(siteCategory('https://myblog.example/post'), null);
  assert.equal(siteCategory('chrome://newtab/'), null);
  assert.equal(siteCategory('https://x.com/%E0%A4%A'), 'Social', 'malformed escapes must not throw');
});

test('page clues: only signals that are rarely wrong', () => {
  assert.equal(clueCategory({ types: ['NewsArticle'] }), 'News');
  assert.equal(clueCategory({ types: ['Recipe'] }), 'Food');
  assert.equal(clueCategory({ types: ['JobPosting'] }), 'Jobs');
  assert.equal(clueCategory({ ogType: 'video.movie' }), 'Video');
  assert.equal(clueCategory({ price: true, cart: true }), 'Shopping');
  assert.equal(clueCategory({ types: ['Product'], cart: true }), 'Shopping');
  // A review site tags the cards it reviews as Products, with no price or cart.
  assert.equal(clueCategory({ types: ['Article', 'Product'], ogType: 'article' }), null);
  assert.equal(clueCategory({ types: ['Article'] }), null);
  assert.equal(clueCategory(undefined), null);
});

test('two or more tabs of a use case make a group named for it', () => {
  const tabs = [F.tab('https://www.myntra.com/a', 'Shoes'), F.tab('https://www.flipkart.com/b', 'Phone'), F.tab('https://www.amazon.in/c', 'Book')];
  const g = plan(tabs, new Map()).groups.find((g) => g.source === 'usecase');
  assert.equal(g.name, 'Shopping');
  assert.equal(g.tabs.length, 3);
});

test('use case comes before topic: a shop page about mortgages stays in Shopping', () => {
  const { tabs, pages } = F.build(F.mortgage);
  const book = F.tab('https://www.amazon.in/mortgage-book', 'The Mortgage Book: rates, loans and refinancing');
  const shoes = F.tab('https://www.myntra.com/shoes', 'Running shoes');
  const groups = plan([...tabs, book, shoes], pages).groups;
  assert.equal(groups.find((g) => g.tabs.includes(book)).name, 'Shopping');
  assert.equal(groups.find((g) => g.tabs.includes(F.mortgage[0][0])).source, 'content');
});

test('a lone use-case tab goes to the catch-all, never into a topic', () => {
  const { tabs, pages } = F.build(F.mortgage, F.singles);
  const book = F.tab('https://www.amazon.in/mortgage-book', 'Mortgage rates and refinance: a buyer guide');
  const g = plan([...tabs, book], pages).groups.find((g) => g.tabs.includes(book));
  assert.equal(g.source, 'other');
});

test('regression: an X profile and an Amazon page are not grouped by a person\'s name', () => {
  const xTab = F.tab('https://x.com/priyasharma', 'Priya Sharma (@priyasharma) / X');
  const amz = F.tab('https://www.amazon.in/dp/B09', 'The Quiet Garden by Priya Sharma');
  const pages = new Map([
    [xTab.id, F.page(xTab.title, 'Posts from Priya Sharma', ['Priya Sharma'], 'Priya Sharma posted about Ukraine drones and the cricket final. Priya Sharma replied to Ravi Kumar.')],
    [amz.id, F.page(amz.title, 'Buy The Quiet Garden by Priya Sharma', ['The Quiet Garden', 'Priya Sharma'], 'Hardcover edition by Priya Sharma. Customer reviews. Delivery by Friday.')]
  ]);
  for (const g of plan([xTab, amz], pages).groups) assert.equal(g.source, 'other', g.name);

  // Same pages at unknown addresses, so only the topic engine decides: a name
  // shared by two pages is not enough to link them.
  const a2 = F.tab('https://social.example/priyasharma', xTab.title);
  const b2 = F.tab('https://books.example/quiet-garden', amz.title);
  const pages2 = new Map([[a2.id, pages.get(xTab.id)], [b2.id, pages.get(amz.id)]]);
  for (const g of plan([a2, b2], pages2).groups) assert.equal(g.source, 'other', g.name);
});

test('Wikipedia tabs form one Reference group, whatever their topics', () => {
  const R = F.realPages({ neutral: false });
  const g = plan(R.tabs, R.pages).groups.find((g) => g.name === 'Reference');
  assert.ok(g && g.tabs.every((t) => t.url.includes('wikipedia.org')), g?.tabs.map((t) => t.url).join());
  assert.ok(g.tabs.length >= 5);
});

test('use-case groups are listed before topic groups and never sent for AI naming', () => {
  const tabs = [F.tab('https://www.myntra.com/a', 'Shoes'), F.tab('https://www.flipkart.com/b', 'Phone')];
  const { tabs: t2, pages } = F.build(F.mortgage);
  const groups = plan([...tabs, ...t2], pages).groups;
  assert.equal(groups[0].source, 'usecase');
  assert.ok(!('sharedWords' in groups[0]));
});
