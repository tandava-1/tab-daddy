# Tab Daddy naming server

A Cloudflare Worker between the extension and Groq. It takes only lists of plain
words (never page text, titles or addresses), asks `openai/gpt-oss-20b` for short
natural group names, checks them, and caches them in KV for 7 days so other users
with the same words cost no model call. Request logging is off.

**Not part of the extension.** Keep `server/` out of the store zip.

## Contract

`POST /name` from a `chrome-extension://` origin:

```json
{ "installId": "<uuid v4>", "groups": [{ "id": "g0", "words": ["mortgage", "rates"] }] }
```

returns `{ "names": { "g0": "Home loans" } }`. Up to 12 groups, 2 to 8 words each,
letters only. 400 on anything else, 429 when one install sends over 10 a minute,
503 when Groq is unavailable and nothing was cached.

## Deploy

```
npm install
npx wrangler login
npx wrangler kv namespace create NAMES   # paste the id into wrangler.toml
npx wrangler deploy
npx wrangler secret put GROQ_API_KEY     # paste the key at the prompt
```

Then set `NAMING_ENDPOINT` in `../lib/naming.js` to the deployed
`https://tab-daddy-names.<account>.workers.dev/name`. For release, set
`ALLOWED_ORIGINS` in `wrangler.toml` to `chrome-extension://<store id>`.

## Test

`npm test`. Groq, KV and the rate limiter are stand-ins; nothing is called.
