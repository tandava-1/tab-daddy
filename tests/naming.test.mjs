// AI naming: what may leave the browser, and how replies are handled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planGroups as plan } from '../lib/analyze.js';
import * as N from '../lib/naming.js';
import * as F from './helpers.mjs';

const topicGroups = () => {
  const { tabs, pages } = F.build(F.mortgage, F.recipes, F.singles);
  return { groups: plan(tabs, pages).groups, tabs, pages };
};
const nameAll = (namer) => F.fakeFetch((b) => ({ names: Object.fromEntries(b.groups.map((g) => [g.id, namer(g)])) }));

test('shared words: on 2+ tabs, never site names', () => {
  const mort = topicGroups().groups.find((g) => /mortgage/i.test(g.name));
  assert.ok(mort.sharedWords.includes('mortgage'));
  assert.ok(mort.sharedWords.length >= 2 && mort.sharedWords.length <= 8);
  for (const w of ['lenderhub', 'homecalcz', 'bankco']) assert.ok(!mort.sharedWords.includes(w), w);
});

test('shared words: a word written with a capital on any tab is never sent', () => {
  const a = F.tab('https://one.example/a', 'Mortgage advice from Ravindra');
  const b = F.tab('https://two.example/b', 'Ravindra on mortgage rates');
  const pages = new Map([
    [a.id, F.page(a.title, 'mortgage rates explained by Ravindra Kulkarni', [], 'Ravindra Kulkarni explains mortgage rates and the loan term.')],
    [b.id, F.page(b.title, 'Ravindra Kulkarni on mortgage rates', [], 'Ravindra Kulkarni says mortgage rates and loan terms vary.')]
  ]);
  const g = plan([a, b], pages).groups.find((g) => g.source === 'content');
  assert.ok(g, 'the two still group, on their ordinary words');
  assert.ok(g.sharedWords.includes('mortgage'));
  assert.ok(!g.sharedWords.some((w) => /ravindra|kulkarni/.test(w)), g.sharedWords.join());
});

test('shared words: a sensitive page contributes nothing', () => {
  const { tabs, pages } = F.build(F.mortgage);
  const s1 = F.tab('https://bank1.example/login', 'mortgage account login');
  const s2 = F.tab('https://bank2.example/otp', 'mortgage verification code');
  pages.set(s1.id, F.page(s1.title, 'zxqsecret mortgage', ['mortgage'], 'zxqsecret mortgage loan payment', { sensitive: true }));
  pages.set(s2.id, F.page(s2.title, 'zxqsecret mortgage', ['mortgage'], 'zxqsecret mortgage loan rates', { sensitive: true }));
  const g = plan([...tabs, s1, s2], pages).groups.find((g) => g.tabs.includes(s1));
  assert.ok(g, 'sensitive tab still grouped locally');
  assert.ok(!g.sharedWords?.includes('zxqsecret'));
});

test('cleanWords keeps letters-only words', () => {
  assert.deepEqual(N.cleanWords(['mortgage', 'otp4821', 'a@b', 'deadbeefcafeba', 'loan', 'x.com']), ['mortgage', 'loan']);
});

test('validName accepts natural names and rejects junk', () => {
  assert.equal(N.validName('"home loans."'), 'Home loans');
  assert.equal(N.validName('iPhone reviews'), 'iPhone reviews');
  assert.equal(N.validName('A very long name that goes on and on'), null);
  assert.equal(N.validName('nerdwallet.com'), null);
  assert.equal(N.validName('see https://x'), null);
  assert.equal(N.validName(42), null);
});

test('namingRequests: only topic groups, never use-case groups or the catch-all', () => {
  const shop = [F.tab('https://www.myntra.com/a', 'Shoes'), F.tab('https://www.flipkart.com/b', 'Phone')];
  const { tabs, pages } = F.build(F.mortgage, F.singles);
  const groups = plan([...shop, ...tabs], pages).groups;
  const keys = N.namingRequests(groups).map((r) => r.key);
  assert.ok(keys.length >= 1);
  assert.ok(keys.every((k) => k.startsWith('topic:')), keys.join());
});

test('nameGroups sends only an install id and words, then applies valid names', async () => {
  const { groups } = topicGroups();
  const fetchImpl = nameAll((g) => (g.words.includes('mortgage') ? 'Home loans' : 'Pasta recipes'));
  const names = await N.nameGroups(groups, { storage: F.memStore(), fetchImpl });
  assert.equal(names.get(groups.find((g) => /mortgage/i.test(g.name)).key), 'Home loans');
  const body = fetchImpl.log[0];
  assert.deepEqual(Object.keys(body).sort(), ['groups', 'installId']);
  for (const g of body.groups) assert.deepEqual(Object.keys(g).sort(), ['id', 'words']);
  const sent = JSON.stringify(body);
  for (const leak of ['http', 'example', 'Mortgage Rates Today', 'RateSite']) assert.ok(!sent.includes(leak), leak);
});

test('nameGroups: a repeat is served from the cache, which expires after 7 days', async () => {
  const { groups } = topicGroups();
  const store = F.memStore();
  const fetchImpl = nameAll(() => 'Home loans');
  await N.nameGroups(groups, { storage: store, fetchImpl, now: 0 });
  await N.nameGroups(groups, { storage: store, fetchImpl, now: 1000 });
  assert.equal(fetchImpl.log.length, 1);
  await N.nameGroups(groups, { storage: store, fetchImpl, now: 8 * 864e5 });
  assert.equal(fetchImpl.log.length, 2);
});

test('nameGroups: failures leave names alone and never throw', async () => {
  const { groups } = topicGroups();
  const cases = [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }),
    async () => ({ ok: true, json: async () => ({ names: { g0: 'way too many words in this group name' } }) })
  ];
  for (const fetchImpl of cases) assert.equal((await N.nameGroups(groups, { storage: F.memStore(), fetchImpl })).size, 0);
});

test('nameGroups gives up after the timeout', async () => {
  const { groups } = topicGroups();
  const slow = (url, opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const t0 = Date.now();
  assert.equal((await N.nameGroups(groups, { storage: F.memStore(), fetchImpl: slow })).size, 0);
  assert.ok(Date.now() - t0 < 4000);
});

test('consent is unanswered until set, then remembered', async () => {
  const store = F.memStore();
  assert.equal(await N.getConsent(store), null);
  await N.setConsent('no', store);
  assert.equal(await N.getConsent(store), 'no');
});
