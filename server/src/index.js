// Tab Daddy naming server: a Cloudflare Worker between the extension and Groq.
//
// It exists because an API key can't live inside an extension (anyone can
// unpack one). It accepts only lists of plain words — never page text, titles
// or addresses — asks an open model for short natural group names, checks the
// answer, and caches it so the next user with the same words costs nothing.
//
// Nothing about a request is logged (observability is off in wrangler.toml).

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

// The extension waits 3 s in total; leave it room to fall back gracefully.
const GROQ_TIMEOUT_MS = 2500;

const MAX_GROUPS = 12;
const MIN_WORDS = 2;
const MAX_WORDS = 8;
const WORD = /^\p{L}{1,20}$/u;
const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const GROUP_ID = /^g\d{1,2}$/;

const MAX_NAME_CHARS = 24;
const MAX_NAME_WORDS = 4;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

const SYSTEM_PROMPT = `You name groups of browser tabs.
For each group you get a few words that appear across its tabs.
Give each group a short name a person would choose: 1 to 3 plain words that say what the tabs are about or what the person is doing, such as "Home loans", "Pasta recipes", "Study music" or "Trip planning".
Never use a website, app or brand name unless the group is about that product itself.
No numbers, no punctuation, no quotes. Use sentence case.
Return a name for every group id you are given.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['names'],
  properties: {
    names: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name'],
        properties: { id: { type: 'string' }, name: { type: 'string' } }
      }
    }
  }
};

/** Returns the parsed request, or null if it is anything but ids and plain words. */
export function parseRequest(body) {
  if (!body || typeof body !== 'object') return null;
  const { installId, groups } = body;
  if (typeof installId !== 'string' || !INSTALL_ID.test(installId)) return null;
  if (!Array.isArray(groups) || groups.length < 1 || groups.length > MAX_GROUPS) return null;
  const ids = new Set();
  for (const g of groups) {
    if (!g || typeof g.id !== 'string' || !GROUP_ID.test(g.id) || ids.has(g.id)) return null;
    if (!Array.isArray(g.words) || g.words.length < MIN_WORDS || g.words.length > MAX_WORDS) return null;
    if (!g.words.every((w) => typeof w === 'string' && WORD.test(w))) return null;
    ids.add(g.id);
  }
  return { installId, groups: groups.map((g) => ({ id: g.id, words: g.words.map((w) => w.toLowerCase()) })) };
}

/** Same rules as the extension's validName: short, plain, no addresses. */
export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/["'`*_]/g, '').replace(/[.!?:;,]+$/, '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > MAX_NAME_CHARS || name.split(' ').length > MAX_NAME_WORDS) return null;
  if (/[@/\\\d]|\.[a-z]{2,}\b|https?/i.test(name)) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Order-free, so two users whose groups share the same words share one entry.
const cacheKey = (words) => 'n:' + [...words].sort().join(' ');

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.length ? allowed.includes(origin) : origin.startsWith('chrome-extension://');
  return ok
    ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST', vary: 'origin' }
    : {};
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}

async function askGroq(groups, env, fetchImpl) {
  const res = await fetchImpl(GROQ_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.GROQ_MODEL || DEFAULT_MODEL,
      // Thinking tokens count against the shared daily allowance; naming needs little.
      reasoning_effort: 'low',
      include_reasoning: false,
      temperature: 0.2,
      max_completion_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(groups.map((g) => ({ id: g.id, words: g.words }))) }
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'group_names', strict: true, schema: RESPONSE_SCHEMA } }
    }),
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
  const out = new Map();
  for (const item of parsed.names ?? []) out.set(item.id, item.name);
  return out;
}

export async function handle(request, env, ctx, fetchImpl = fetch) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/name') return json({ error: 'not found' }, 404, cors);
  if (!cors['access-control-allow-origin']) return json({ error: 'forbidden' }, 403, {});

  const req = parseRequest(await request.json().catch(() => null));
  if (!req) return json({ error: 'bad request' }, 400, cors);

  // One install can't burn everyone's daily allowance.
  if (env.PER_INSTALL) {
    const { success } = await env.PER_INSTALL.limit({ key: req.installId });
    if (!success) return json({ error: 'slow down' }, 429, cors);
  }

  const names = {};
  const misses = [];
  for (const g of req.groups) {
    const hit = env.NAMES ? await env.NAMES.get(cacheKey(g.words)) : null;
    if (hit) names[g.id] = hit;
    else misses.push(g);
  }

  if (misses.length) {
    let fresh;
    try {
      fresh = await askGroq(misses, env, fetchImpl);
    } catch {
      // Out of allowance, slow, or malformed: the extension keeps its own names.
      // Still return whatever came from the cache.
      return json({ names }, Object.keys(names).length ? 200 : 503, cors);
    }
    for (const g of misses) {
      const name = cleanName(fresh.get(g.id));
      if (!name) continue;
      names[g.id] = name;
      if (env.NAMES) {
        const write = env.NAMES.put(cacheKey(g.words), name, { expirationTtl: CACHE_TTL_SECONDS }).catch(() => {});
        ctx?.waitUntil ? ctx.waitUntil(write) : await write;
      }
    }
  }

  return json({ names }, 200, cors);
}

export default { fetch: (request, env, ctx) => handle(request, env, ctx) };
