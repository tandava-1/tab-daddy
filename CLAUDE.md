# Tab Daddy — project context

Formerly **Tab Tidy** (v1.0.0). Renamed in v2.0.0; the store item ID is unchanged.

Manifest V3 Chrome extension. Two features: group open tabs into meaningful
groups, and find duplicate tabs. Runs entirely locally, no network calls, no
storage. Live on the Chrome Web Store.

## Status

- v1.0.0 (as Tab Tidy) is live on the Chrome Web Store. Its upload zip is gone;
  rebuild from source if needed.
- v2.0.0 in progress: rename to Tab Daddy, page-content grouping, joining
  existing groups.
- Privacy policy: https://tandava-1.github.io/tab-daddy/ once the repo rename
  lands (was `/tab-tidy/`).
- Source repo: https://github.com/tandava-1/tab-daddy (also `homepage_url`).

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
- Permissions are `tabs`, `tabGroups`, `scripting`, plus optional `<all_urls>`.
  `storage` was removed as unused — do not add a permission without a reason the
  store listing can justify. Page text must never leave the popup's memory.

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
rest loose. 18 tests. Re-create it rather than looking for it — scratchpads are
session-local.
