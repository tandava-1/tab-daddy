// Topic grouping: tabs no site rule or page clue claims, grouped by what they say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planGroups as plan } from '../lib/analyze.js';
import * as F from './helpers.mjs';

const groupsOf = (...args) => plan(...args).groups;
const ids = (g) => g.tabs.map((t) => t.id).sort();
const find = (groups, t) => groups.find((g) => g.tabs.includes(t));

test('mortgage pages on three sites form one group named for them', () => {
  const { tabs, pages } = F.build(F.mortgage, F.recipes, F.singles);
  const g = find(groupsOf(tabs, pages), F.mortgage[0][0]);
  assert.equal(g.source, 'content');
  assert.deepEqual(ids(g), F.mortgage.map(([t]) => t.id).sort());
  assert.equal(g.name, 'Mortgage rates');
});

test('carbonara recipes on two sites form one group, named in sentence case', () => {
  const { tabs, pages } = F.build(F.mortgage, F.recipes, F.singles);
  const g = find(groupsOf(tabs, pages), F.recipes[0][0]);
  assert.deepEqual(ids(g), F.recipes.map(([t]) => t.id).sort());
  assert.equal(g.name, 'Spaghetti carbonara');
});

test('unrelated single tabs land only in the catch-all', () => {
  const { tabs, pages } = F.build(F.mortgage, F.recipes, F.singles);
  const groups = groupsOf(tabs, pages);
  for (const [t] of F.singles) assert.equal(find(groups, t)?.source, 'other', t.title);
});

test('same site, different topics: not grouped when content is known', () => {
  const { tabs, pages } = F.build(F.sameSite);
  assert.ok(!groupsOf(tabs, pages).some((g) => g.source === 'content'));
});

test('regression: "india" alone does not join a broker and a shop', () => {
  assert.ok(!groupsOf(F.india, new Map()).some((g) => g.source === 'content'));
});

test('title-only tabs still group on a shared topic', () => {
  const g = groupsOf(F.titleOnly, new Map()).find((g) => g.source === 'content');
  assert.equal(g?.tabs.length, 2);
  assert.match(g.name, /mortgage/i);
});

test('read pages and title-only tabs on one topic still meet', () => {
  const extra = F.tab('https://d.example/x', 'Should you refinance your mortgage now?', { discarded: true });
  const { tabs, pages } = F.build(F.mortgage);
  assert.equal(find(groupsOf([...tabs, extra], pages), extra)?.source, 'content');
});

test('two stories from one outlet do not group on page furniture', () => {
  const { tabs, pages } = F.build(F.genericNews);
  assert.ok(!groupsOf(tabs, pages).some((g) => g.source === 'content'));
});

test('catch-all comes last and needs two tabs', () => {
  const { tabs, pages } = F.build(F.mortgage, F.singles);
  const groups = groupsOf(tabs, pages);
  assert.equal(groups.at(-1).source, 'other');
  const lone = F.build(F.mortgage, [F.singles[0]]);
  assert.ok(!groupsOf(lone.tabs, lone.pages).some((g) => g.source === 'other'));
});

test('pinned and chrome:// tabs never take part', () => {
  const pinned = F.tab('https://x.example/m', 'Mortgage rates explained', { pinned: true });
  const internal = F.tab('chrome://settings', 'Mortgage settings');
  const all = groupsOf([...F.titleOnly, pinned, internal], new Map()).flatMap((g) => g.tabs);
  assert.ok(!all.includes(pinned) && !all.includes(internal));
});

test('group keys are unique and new groups get distinct colours', () => {
  const { tabs, pages } = F.build(F.mortgage, F.recipes, F.singles, F.sameSite);
  const r = plan(tabs, pages, [{ id: 99, title: 'Mine', color: 'blue', windowId: 1 }]);
  const keys = r.groups.map((g) => g.key);
  assert.equal(new Set(keys).size, keys.length);
  const colours = r.groups.filter((g) => g.source !== 'other').map((g) => g.color);
  assert.equal(new Set(colours).size, colours.length);
  assert.ok(!colours.includes('blue') && !colours.includes('grey'));
});

test('empty input gives nothing', () => {
  assert.deepEqual(plan([], new Map()), { additions: [], groups: [] });
});

test('word names never pair words the pages do not put together', () => {
  const run = [F.tab('https://w.example/m', 'Marathon - Encyclopedia'), F.tab('https://w.example/l', 'Long-distance running - Encyclopedia')];
  const pages = new Map([
    [run[0].id, F.page('Marathon - Encyclopedia', '', ['Marathon'], 'The marathon is a long distance running race. Distance running and marathon training.')],
    [run[1].id, F.page('Long-distance running - Encyclopedia', '', ['Long-distance running'], 'Long distance running includes the marathon. Distance events like the marathon.')]
  ]);
  const g = groupsOf(run, pages).find((g) => g.source === 'content');
  assert.ok(g && !/distance marathon/i.test(g.name), g?.name);
});

test("word names keep the page's own spelling", () => {
  const t = [F.tab('https://r.example/a', 'useEffect – Docs'), F.tab('https://r.example/b', 'useEffect cleanup – Docs')];
  const pages = new Map(t.map((x) => [x.id, F.page(x.title, '', ['useEffect'], 'useEffect hook cleanup dependencies')]));
  assert.equal(groupsOf(t, pages).find((g) => g.source === 'content')?.name, 'useEffect');
});

test('word names prefer normal spelling over shouting, but keep acronyms', () => {
  const t = [F.tab('https://g1.example/a', 'LISBON travel guide and tram routes'), F.tab('https://g2.example/b', 'Lisbon travel guide for first trips')];
  const pages = new Map(t.map((x) => [x.id, F.page(x.title, '', [], 'travel guide with tram routes and city walks')]));
  assert.match(groupsOf(t, pages).find((g) => g.source === 'content').name, /^(Lisbon|Travel guide)/);
  const shout = [F.tab('https://g3.example/a', 'MORTGAGE rates guide'), F.tab('https://g4.example/b', 'MORTGAGE rates today')];
  const sp = new Map(shout.map((x) => [x.id, F.page(x.title, '', [], 'rates guide today for buyers')]));
  assert.ok(!/MORTGAGE/.test(groupsOf(shout, sp).find((g) => g.source === 'content')?.name ?? ''));
});

test('word names never use a site name', () => {
  const yt = [F.tab('https://www.tubesite.example/watch?v=1', 'Lofi beats to study - Tubesite', { discarded: true }),
              F.tab('https://www.tubesite.example/watch?v=2', 'Lofi jazz for study - Tubesite', { discarded: true })];
  const g = groupsOf(yt, new Map()).find((g) => g.source === 'content');
  assert.ok(g && !/tubesite/i.test(g.name), g?.name);
});

// Real pages, content only (made-up addresses), captured with the extension's reader.
test('real pages: topics meet across sites; junk and loners stay loose', () => {
  const R = F.realPages();
  const groups = groupsOf(R.tabs, R.pages);
  const of = (frag) => find(groups, R.by(frag));
  const together = (a, b, label) => {
    assert.equal(of(a)?.source, 'content', `${label}: ${a} not in a topic group`);
    assert.equal(of(a), of(b), label);
  };
  together('nerdwallet', 'wiki/Mortgage', 'mortgage pair');
  together('react.dev/learn', 'useEffect', 'React docs pair');
  together('wikipedia.org/wiki/Lisbon', 'wikivoyage', 'Lisbon pair');
  together('wiki/Marathon', 'Long-distance', 'running pair');
  assert.equal(of('bankrate').source, 'other', 'bot-check page');
  // BBC Good Food calls itself a Recipe, so it's a Food tab even at a made-up
  // address; alone in Food, it goes to the catch-all rather than a topic.
  assert.equal(of('bbcgoodfood').source, 'other');
  for (const t of R.tabs) {
    if (!/Kubernetes|Mortgage|Carbonara/.test(t.realUrl) || !t.realUrl.includes('wikipedia')) continue;
    const g = find(groups, t);
    if (g?.source !== 'content') continue;
    assert.ok(!g.tabs.some((x) => x !== t && /wikipedia/.test(x.realUrl) && /Kubernetes|Mortgage|Carbonara/.test(x.realUrl)),
      'Wikipedia furniture must not merge unrelated articles');
  }
});
