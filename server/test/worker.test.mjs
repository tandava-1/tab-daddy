import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, parseRequest, cleanName } from '../src/index.js';

const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const ID = '8ef2e288-6f2c-42cb-b64a-2d65b88c7b89';
const body = (groups, installId = ID) => ({ installId, groups });
const mortgage = { id: 'g0', words: ['mortgage', 'rates', 'loan'] };
const pasta = { id: 'g1', words: ['carbonara', 'spaghetti', 'pasta'] };

function req(payload, { origin = ORIGIN, method = 'POST', path = '/name' } = {}) {
  return new Request(`https://names.example${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: method === 'POST' ? JSON.stringify(payload) : undefined
  });
}

function kv() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
}

// A stand-in for Groq that names groups from their words and records calls.
function groq(namer = (g) => (g.words.includes('mortgage') ? 'Home loans' : 'Pasta recipes'), status = 200) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const sent = JSON.parse(opts.body);
    calls.push(sent);
    const groups = JSON.parse(sent.messages[1].content);
    const content = JSON.stringify({ names: groups.map((g) => ({ id: g.id, name: namer(g) })) });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
  };
  return { calls, fetchImpl };
}

const env = (extra = {}) => ({ GROQ_API_KEY: 'test-key', NAMES: kv(), ...extra });

test('names groups and returns them by id', async () => {
  const g = groq();
  const res = await handle(req(body([mortgage, pasta])), env(), null, g.fetchImpl);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).names, { g0: 'Home loans', g1: 'Pasta recipes' });
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
});

test('sends Groq only ids and words, with low reasoning and a strict schema', async () => {
  const g = groq();
  await handle(req(body([mortgage])), env(), null, g.fetchImpl);
  const sent = g.calls[0];
  assert.equal(sent.model, 'openai/gpt-oss-20b');
  assert.equal(sent.reasoning_effort, 'low');
  assert.equal(sent.response_format.json_schema.strict, true);
  assert.deepEqual(JSON.parse(sent.messages[1].content), [{ id: 'g0', words: ['mortgage', 'rates', 'loan'] }]);
  assert.ok(!JSON.stringify(sent).includes(ID), 'install id must not reach Groq');
});

test('shared cache: a second user with the same words (any order) costs no Groq call', async () => {
  const e = env(); const g = groq();
  await handle(req(body([mortgage])), e, null, g.fetchImpl);
  const other = '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b';
  const res = await handle(req(body([{ id: 'g0', words: ['loan', 'mortgage', 'rates'] }], other)), e, null, g.fetchImpl);
  assert.equal(g.calls.length, 1);
  assert.equal((await res.json()).names.g0, 'Home loans');
});

test('only cache misses go to Groq', async () => {
  const e = env(); const g = groq();
  await handle(req(body([mortgage])), e, null, g.fetchImpl);
  await handle(req(body([mortgage, pasta])), e, null, g.fetchImpl);
  assert.deepEqual(JSON.parse(g.calls[1].messages[1].content).map((x) => x.id), ['g1']);
});

test('rejects anything that is not ids and plain words', () => {
  const bad = [
    null, {}, body([]), body([mortgage], 'not-a-uuid'),
    body([{ id: 'g0', words: ['one'] }]),                               // too few words
    body([{ id: 'g0', words: Array(9).fill('word') }]),                 // too many
    body([{ id: 'g0', words: ['mortgage', 'https://x.com'] }]),         // address
    body([{ id: 'g0', words: ['mortgage', '482193'] }]),                // digits
    body([{ id: 'g0', words: ['mortgage', 'Rates for my home loan'] }]),// sentence
    body([{ id: 'x', words: ['a', 'b'] }]),                             // bad id
    body([mortgage, { ...pasta, id: 'g0' }]),                           // duplicate id
    body(Array.from({ length: 13 }, (_, i) => ({ id: `g${i}`, words: ['aa', 'bb'] })))
  ];
  for (const b of bad) assert.equal(parseRequest(b), null, JSON.stringify(b)?.slice(0, 80));
});

test('bad requests get 400 and never reach Groq', async () => {
  const g = groq();
  const res = await handle(req(body([{ id: 'g0', words: ['mortgage', '482193'] }])), env(), null, g.fetchImpl);
  assert.equal(res.status, 400);
  assert.equal(g.calls.length, 0);
});

test('non-extension origins are refused; allow-list is honoured', async () => {
  const g = groq();
  assert.equal((await handle(req(body([mortgage]), { origin: 'https://evil.example' }), env(), null, g.fetchImpl)).status, 403);
  assert.equal((await handle(req(body([mortgage]), { origin: null }), env(), null, g.fetchImpl)).status, 403);
  const listed = env({ ALLOWED_ORIGINS: 'chrome-extension://storeid' });
  assert.equal((await handle(req(body([mortgage])), listed, null, g.fetchImpl)).status, 403);
  assert.equal((await handle(req(body([mortgage]), { origin: 'chrome-extension://storeid' }), listed, null, g.fetchImpl)).status, 200);
  assert.equal(g.calls.length, 1);
});

test('preflight answers with CORS headers', async () => {
  const res = await handle(req(null, { method: 'OPTIONS' }), env());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
});

test('per-install rate limit returns 429 without calling Groq', async () => {
  const g = groq();
  const e = env({ PER_INSTALL: { limit: async () => ({ success: false }) } });
  const res = await handle(req(body([mortgage])), e, null, g.fetchImpl);
  assert.equal(res.status, 429);
  assert.equal(g.calls.length, 0);
});

test('Groq out of allowance: 503, but cached names still returned', async () => {
  const e = env(); await e.NAMES.put('n:loan mortgage rates', 'Home loans');
  const down = groq(undefined, 429);
  const res = await handle(req(body([mortgage, pasta])), e, null, down.fetchImpl);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).names, { g0: 'Home loans' });
  const res2 = await handle(req(body([pasta])), env(), null, down.fetchImpl);
  assert.equal(res2.status, 503);
});

test('model replies that break the naming rules are dropped, not cached', async () => {
  const e = env();
  const g = groq(() => 'Visit nerdwallet.com today for the best rates');
  const res = await handle(req(body([mortgage])), e, null, g.fetchImpl);
  assert.deepEqual((await res.json()).names, {});
  assert.equal(e.NAMES.m.size, 0);
});

test('cleanName', () => {
  assert.equal(cleanName('"pasta recipes."'), 'Pasta recipes');
  assert.equal(cleanName('Top 10 loans'), null);
  assert.equal(cleanName('youtube.com videos'), null);
});

test('unknown paths 404', async () => {
  assert.equal((await handle(req(body([mortgage]), { path: '/' }), env())).status, 404);
});
