// The user's own groups get first pick and are never renamed, recoloured or raided.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planGroups as plan } from '../lib/analyze.js';
import * as F from './helpers.mjs';

const G = (id, title, windowId = 1, color = 'blue') => ({ id, title, color, windowId });
const inGroup = (t, gid) => ({ ...t, groupId: gid });
const P = (sets) => new Map(sets.filter(([, p]) => p).map(([t, p]) => [t.id, p]));
const added = (r, gid) => (r.additions.find((a) => a.groupId === gid)?.tabs ?? []).map((t) => t.id);

test('topic: an ungrouped mortgage page joins the user\'s group of mortgage pages', () => {
  const [m1, m2, m3] = F.mortgage;
  const r = plan([inGroup(m1[0], 10), inGroup(m2[0], 10), m3[0], ...F.recipes.map(([t]) => t)], P([m1, m2, m3, ...F.recipes]), [G(10, 'Home loan')]);
  assert.deepEqual(added(r, 10), [m3[0].id]);
  assert.equal(r.additions[0].name, 'Home loan');
  assert.ok(r.groups.some((g) => g.source === 'content' && g.tabs.length === 2), 'recipes still form a new group');
});

test('already-grouped tabs are never offered anywhere', () => {
  const r = plan(F.mortgage.map(([t]) => inGroup(t, 10)), P(F.mortgage), [G(10, 'Money')]);
  assert.equal(r.additions.length, 0);
  assert.equal(r.groups.length, 0);
});

test('an unnamed group is matched on its tabs alone', () => {
  const [c1, c2] = F.recipes;
  const r = plan([inGroup(c1[0], 20), c2[0], ...F.singles.map(([t]) => t)], P([c1, c2, ...F.singles]), [G(20, '')]);
  assert.equal(r.additions[0]?.name, 'Unnamed group');
  assert.deepEqual(added(r, 20), [c2[0].id]);
});

test('a tab never joins a group in another window', () => {
  const [m1, m2, m3] = F.mortgage;
  const r = plan([inGroup(m1[0], 10), inGroup(m2[0], 10), { ...m3[0], windowId: 2 }], P([m1, m2, m3]), [G(10, 'Mortgage', 1)]);
  assert.equal(r.additions.length, 0);
});

test('the group name alone attracts a match when its tabs are asleep', () => {
  const asleep = F.tab('https://x.example/a', 'Untitled document', { groupId: 30, discarded: true });
  const [m1] = F.mortgage;
  assert.equal(plan([asleep, m1[0]], P([m1]), [G(30, 'Mortgage')]).additions.length, 1);
});

test('unrelated tabs are not forced into a group', () => {
  const [m1, m2] = F.mortgage;
  const tabs = [inGroup(m1[0], 10), inGroup(m2[0], 10), ...F.singles.map(([t]) => t), ...F.sameSite.map(([t]) => t)];
  assert.equal(plan(tabs, P([m1, m2, ...F.singles, ...F.sameSite]), [G(10, 'Mortgage')]).additions.length, 0);
});

test('a tab that fits two groups goes to the closer one', () => {
  const [m1, m2, m3] = F.mortgage; const [c1, c2] = F.recipes;
  const r = plan([inGroup(m1[0], 10), inGroup(m2[0], 10), inGroup(c1[0], 20), m3[0], c2[0]], P([m1, m2, m3, c1, c2]), [G(10, 'Loans'), G(20, 'Dinner')]);
  assert.deepEqual(added(r, 10), [m3[0].id]);
  assert.deepEqual(added(r, 20), [c2[0].id]);
});

test('use case: a shopping tab joins the user\'s group named "Shopping"', () => {
  const myntra = F.tab('https://www.myntra.com/shoes', 'Shoes');
  const r = plan([myntra], new Map(), [G(5, 'Shopping list', 1, 'red')]);
  assert.deepEqual(added(r, 5), [myntra.id]);
});

test('use case: a shopping tab joins a group that is mostly shopping tabs, whatever it\'s called', () => {
  const a = F.tab('https://www.flipkart.com/a', 'Phone', { groupId: 6 });
  const b = F.tab('https://www.amazon.in/b', 'Case', { groupId: 6 });
  const myntra = F.tab('https://www.myntra.com/shoes', 'Shoes');
  const r = plan([a, b, myntra], new Map(), [G(6, 'Diwali', 1, 'yellow')]);
  assert.deepEqual(added(r, 6), [myntra.id]);
});

test('use case: a shopping tab does not join a topic group of articles', () => {
  const [m1, m2] = F.mortgage;
  const book = F.tab('https://www.amazon.in/mortgage-book', 'The Mortgage Book: rates, loans and refinancing');
  const r = plan([inGroup(m1[0], 10), inGroup(m2[0], 10), book], P([m1, m2]), [G(10, 'Mortgage research')]);
  assert.equal(r.additions.length, 0);
});

test('real pages: a broad "Research" group with the mortgage article takes NerdWallet\'s page only', () => {
  const R = F.realPages();
  const tabs = R.tabs.map((t) => (/wiki\/(Mortgage|Kubernetes)/.test(t.realUrl) ? { ...t, groupId: 1 } : t));
  const r = plan(tabs, R.pages, [G(1, 'Research')]);
  assert.deepEqual(added(r, 1), [R.by('nerdwallet').id]);
});
