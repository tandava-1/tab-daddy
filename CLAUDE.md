# Tab Daddy — project context

Formerly **Tab Tidy** (v1.0.0). Renamed in v2.0.0; the store item ID is unchanged.

Manifest V3 Chrome extension. Two features: group open tabs into meaningful
groups, and find duplicate tabs. Grouping runs locally; the only network call
is optional, opt-in AI naming. Live on the Chrome Web Store.

## Status

- v1.0.0 (as Tab Tidy) is live on the Chrome Web Store. Its upload zip is gone;
  rebuild from source if needed.
- v2.0.0 in progress: rename to Tab Daddy, page-content grouping, joining
  existing groups.
- Privacy policy: https://tandava-1.github.io/tab-daddy/ once the repo rename
  lands (was `/tab-tidy/`).
- Source repo: https://github.com/tandava-1/tab-daddy (also `homepage_url`).
- Naming server live at https://tab-daddy-names.shivankshridhar1.workers.dev
  (Cloudflare account shivankshridhar1@gmail.com; KV `NAMES`
  10bee68159b346ec85c24c616dd78893; Groq key set as Worker secret).
  `ALLOWED_ORIGINS` is still empty — set it to the store item's
  chrome-extension:// origin before release.

## Grouping — by page content

`lib/analyze.js:planGroups(tabs, pages)` hands groupable tabs to
`lib/cluster.js:clusterTabs`. `pages` comes from `lib/read.js:readPages`, which
injects `extractPage` (title, meta description, h1/h2, first 1,500 chars of
`article|main|body`) via `chrome.scripting`, 8 at a time, 1.5 s timeout each.

- Each tab -> weighted word bag (`FIELD_WEIGHTS`: title 3, description/headings 2,
  body 1), top 40 words, IDF-discounted, unit-length.
- Average-linkage merging until the best pair is below `MERGE_THRESHOLD` (0.14).
  The sweep on real pages put the safe band at roughly 0.08–0.19: below it,
  Wikipedia furniture joins unrelated articles; above it, real topics split.
- Unreadable tabs (`isReadable` false: discarded, unloaded, non-http, Web Store)
  use title + site name. Popup tags them "title only" once access is granted.
- Name = strongest word(s) present in >= half the group's tabs.
- "Everything else" catch-all last and default-deselected, as before.

**Existing groups** (`cluster.js:joinExisting`, runs first). Only ungrouped tabs
(`groupId === -1`) are candidates; grouped tabs only describe their group. A
group's docs = its tabs' term bags + its title as one extra short doc. A tab joins
the group holding its single closest doc if that score >= `JOIN_THRESHOLD` (=
`MERGE_THRESHOLD`), same window only. Closest-member, not average: user groups are
broad, and real related pages score 0.14–0.3 (an earlier 0.35 single-match bar,
set from fixtures, rejected obvious fits). `planGroups` returns
`{ additions, groups }`; the popup renders "Add to your groups" above new groups.
Applying never renames or recolours a user's group — including when a new
group's name folds into an existing one.

**Naming** (`lib/naming.js`). Decided with the founder: grouping is local; AI
only names, and names are fetched *before* groups are shown (popup shows
"Naming groups…", 3 s timeout, then word names). Chrome's built-in AI was
dropped — neither of the founder's machines (8 GB M2) qualifies, nor would most
users'. Payload per group = `sharedWords` (cluster.js:sharedWordsOf: words on
>= 2 tabs, top 8, no site names, sensitive pages skipped) then `cleanWords`
(letters only). Request body is exactly `{ installId, groups: [{ id, words }] }`
— a test asserts no titles/URLs leak. Replies pass `validName` (<= 24 chars,
<= 4 words, no addresses). Cache in `chrome.storage.local` keyed by the word
list, 7-day TTL, 300 entries. Consent stored as `aiNaming: 'yes'|'no'`; asked
once via a card, toggle line under the list. `NAMING_ENDPOINT` points at the Worker in
`server/` (see its README): Groq `openai/gpt-oss-20b`, `reasoning_effort: low`,
strict JSON schema, 2.5 s timeout, shared KV name cache keyed by sorted words,
10 req/min per install, request logging off. `server/` must stay out of the
store zip. Extension caps a request at 12 groups to match the server. Fallback names never use
a site name.

Site access is `optional_host_permissions: <all_urls>`, requested from the popup's
Allow button. Without it everything groups on title + site name.

## Two bug fixes that must not regress

- **`chrome://newtab` duplicates.** `isGroupable` excluded internal pages from
  grouping but `findDuplicates` had no equivalent filter, so blank New Tab pages
  inflated the badge and left a permanent nag. Fixed by `isDedupable()` in
  `lib/analyze.js` — http(s) only.
- **Spurious short-token groups.** The old keyword pass once joined a broker and a
  shopping site on the shared word "india". Carried into `lib/cluster.js:similarity`:
  a pair scores zero unless it shares `CORROBORATING_TOKENS` (2) words or one word
  longer than `SHORT_TOKEN_MAX` (5). `STOPWORDS` keeps the commerce and geography
  entries.

## Constraints worth knowing before editing

- `chrome.tabs.group()` accepts tabs from **one window only** — `popup.js:applyGroups`
  splits by `windowId` before calling it.
- Tab group colors are fixed by the API: `grey|blue|red|yellow|green|pink|purple|cyan|orange`.
- Popup is 400px wide, `max-height: 600px` (Chrome's ceiling). Both list panels are
  **empty in `popup.html`** — every card and row is built in `popup.js`.
- Applying twice must fold into the existing group via `chrome.tabGroups.query({ windowId, title })`,
  not create a second one.
- Permissions are `tabs`, `tabGroups`, `scripting`, `storage` (AI consent + name
  cache), plus optional `<all_urls>`. Do not add a permission without a reason the
  store listing can justify. Page text must never leave the popup's memory; only
  `sharedWords` may, and only with consent.

## Store assets

Outside this repo, at `~/Claude/tab-daddy-store/`:

- `listing.md` — all dashboard copy. Short description is 127/132 chars; detailed
  description is 1481/1600, ASCII-only. Both permission justifications live here.
- `index.html` / `privacy-policy.html` — identical, self-contained, zero external refs.
- `screenshots-letterbox/` — the three 1280x800 shots used in the listing
  (verified `hasAlpha: no`). `screenshots/` holds the cropped variants, unused.

## Releasing an update

`version` in `manifest.json` **must increment** before rebuilding the zip — the
store rejects an upload whose version is not higher than what is live. This is the
step that catches everyone out.

## Testing

No test runner in-repo. The logic suite lives in a scratchpad harness: copies of
`lib/*.js` imported directly (Node 22+ detects ES modules), `fixtures.mjs`, and
`real.json`: eight real pages captured with `extractPage` (NerdWallet, Bankrate's
bot check, a Serious Eats 404, BBC Good Food carbonara, Wikipedia Mortgage /
Carbonara / Kubernetes, GitHub React). Expected: mortgage pair, carbonara pair,
rest loose. 40 tests, including existing-group cases on the real pages and the
naming privacy rules. The browser driver can run a stand-in naming server on
127.0.0.1:8787 and print exactly what the extension sent. Re-create it rather than looking for it — scratchpads are
session-local.

Real-browser checks run the extension in **Chrome for Testing** (branded Chrome
dropped `--load-extension`): `npx @puppeteer/browsers install chrome@stable` plus
`puppeteer-core@24`, launched with `enableExtensions: true` and
`browser.installExtension(dir)`. `chrome.action.openPopup()` from the service
worker opens the real popup. Puppeteer can't click Chrome's native permission
prompt, so the granted path is tested on a copy whose manifest moves `<all_urls>`
from `optional_host_permissions` to `host_permissions`.
