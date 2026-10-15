# Tab Daddy — project context

Formerly **Tab Tidy** (v1.0.0). Renamed in v2.0.0; the store item ID is unchanged.

Manifest V3 Chrome extension. Two features: group open tabs into meaningful
groups, and find duplicate tabs. Grouping runs locally; the only network call
is optional, opt-in AI naming. Live on the Chrome Web Store.

## Status

- v1.0.0 (as Tab Tidy) is live on the Chrome Web Store. Its upload zip is gone;
  rebuild from source if needed.
- v2.0.0 in progress: rename to Tab Daddy, use-case + topic grouping, joining
  existing groups, opt-in AI naming. Not yet submitted to the store.
- Privacy policy live at https://tandava-1.github.io/tab-daddy/ (repo renamed
  2026-10-11; the old `/tab-tidy/` address 404s, which breaks 1.0.0's listing link).
- Source repo: https://github.com/tandava-1/tab-daddy (also `homepage_url`).
- Naming server live at https://tab-daddy-names.shivankshridhar1.workers.dev
  (Cloudflare account shivankshridhar1@gmail.com; KV `NAMES`
  10bee68159b346ec85c24c616dd78893; Groq key set as Worker secret).
  `ALLOWED_ORIGINS` = store item `gomobpfmegmaojmogfnmdiollcolndkm` plus the
  unpacked copy at `/Users/shivankshridhar/Claude/tab-daddy`
  (`pdmbkbhgcnhppbbbpmckfnkbcipimapj`, derived from the path). Moving the folder
  changes that ID; unpacked copies elsewhere get word names only.

## Grouping — use case first, topic for the rest

Decided with the founder 2026-10-15. `lib/analyze.js:planGroups(tabs, pages, existing)`:

1. **Use case** per tab (`lib/usecase.js:useCaseOf`): `siteCategory(url)` from
   `lib/sites.js`, else `clueCategory(page.clues)`. 27 use cases, ~1,300 rules.
   Matching walks host -> parent domains; at each level plain and `*.` rules
   compete, longest path (then query) wins, so `*.sharepoint.com/:x:/` (Sheets)
   beats a bare `sharepoint.com` (Work). Clues: schema.org types / og:type /
   price + add-to-cart; Product data alone is NOT Shopping (NerdWallet tags
   reviewed cards as Products).
2. Use-case tabs join a user group only if it's named for the use case or >50%
   its tabs share it. Tabs without a use case may join by content
   (`joinExisting`).
3. >= 2 tabs of a use case -> group named for it (`source: 'usecase'`, never AI-named).
   A lone one goes to "Everything else", never into topic grouping.
4. Remaining tabs -> topic clustering (`lib/cluster.js:clusterTabs`).

`lib/sites.js` is GENERATED: `python3 tools/sites/merge.py tools/sites/research`
then `python3 tools/sites/build.py tools/sites/research/merged.json lib/sites.js`.
Research = three agent passes (global, India, web-app URL patterns; Semrush,
Ahrefs, Wikipedia/Similarweb, Aug–Oct 2026) + `manual.json` gap fills. Category
merges/renames (Email & calendar, Chat & calls, Coding, Work…) live in build.py.

**Topic engine.** `pages` comes from `lib/read.js:readPages` -> `extractPage`
(chrome.scripting, 8 at a time, 1.5 s each): title, meta description, h1/h2 and
~1,500 chars of main text collected with a TreeWalker that skips furniture
(nav/footer/aside/form/button/site-level header/ARIA landmarks) and anything
`checkVisibility()` says is hidden (Wikipedia's 300-language picker otherwise
became the topic). Plus `clues` and `sensitive`.

- Each tab -> weighted word bag (title 3, description/headings 2, body 1), top
  40 words, IDF-discounted, unit-length, plurals folded.
- **Ordinary words** (`terms.ordinary`): words written in lowercase somewhere on
  that tab. Two tabs link only if they share an ordinary word (plus the old
  two-words-or-one-long-word rule), so a person's name can't link tabs. Cost:
  place names can't either — two Lisbon sites sharing only "Lisbon" stay apart.
  Title-only tabs in Title Case count every word as ordinary.
- Average-linkage merging until below `MERGE_THRESHOLD` (0.11; safe band on real
  pages 0.06–0.17).
- Word names: strongest word in >= half the group, + a second only if adjacent in
  a title/heading; spelled as the page writes it, shouting ("LISBON") de-capped,
  acronyms (<= 4 letters) kept; sentence case; never a site name.
- "Everything else" catch-all last and default-deselected.

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
users'. Only `source: 'content'` groups are named. Payload per group = `sharedWords`
(cluster.js:sharedWordsOf: words on >= 2 tabs, ordinary on every tab that has
them, top 8, no site names, sensitive pages skipped) then `cleanWords` (letters
only); fewer than 2 words -> not sent. In practice that's often too few once
names are excluded (two Lisbon guides shared only "city"). Request body is exactly `{ installId, groups: [{ id, words }] }`
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

- `listing.md` — all dashboard copy, permission justifications, data disclosure
  (tick "Website content" only), release steps.
- `index.html` / `privacy-policy.html` — identical to this repo's `index.html`,
  which GitHub Pages serves as the privacy policy.
- `screenshots-v2/` — 1280x800 shots from 2026-10-09, before use-case grouping:
  retake. `screenshots-letterbox/` are 1.0.0's (Tab Tidy, a Netflix page): don't use.
- `tab-daddy-2.0.0.zip` — rebuild before upload; zip only manifest, background,
  popup.*, lib/, icons/ (never server/, tests/, tools/, index.html).

## Releasing an update

`version` in `manifest.json` **must increment** before rebuilding the zip — the
store rejects an upload whose version is not higher than what is live. This is the
step that catches everyone out.

## Testing

`npm test` (repo root) runs `tests/*.test.mjs` with node:test, no dependencies:
topic, use case, existing groups, naming/privacy, duplicates. Topic fixtures use
made-up `.example` addresses (avoid real words as hostnames: a site called
`rates.example` makes "rates" a site name). `tests/real-pages.json` = 13 real
pages captured with the extension's own reader; `realPages({ neutral: true })`
gives them made-up addresses so only content counts. Server: `cd server && npm test`.

The scratchpad was wiped once (2026-10-15) and took the old harness with it:
keep tests and tools in the repo.

Real browser: `tools/browser/` (`npm install`, `npm run chrome` installs Chrome
for Testing into `.chrome/`, git-ignored). `extract-probe.mjs <urls>` runs the
real reader on live pages (`--save=` to capture). `drive.mjs` loads the
extension, opens real tabs, can create user groups (`--groups=`), set AI consent
(`--ai=yes`), screenshot (`--shot=`) and apply (`--apply`). `--granted` runs a
temp copy with site access required, because Puppeteer can't click Chrome's
permission prompt — but a temp copy has a different extension ID, so the naming
server refuses it. To test live AI naming with page access, temporarily move
`<all_urls>` to `host_permissions` in the repo's own manifest and restore it.
