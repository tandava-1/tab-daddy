# Tab Tidy — project context

Manifest V3 Chrome extension. Two features: group open tabs into meaningful
groups, and find duplicate tabs. Runs entirely locally, no network calls, no
storage. Published (or pending review) on the Chrome Web Store.

## Status

- v1.0.0 built and packaged as `~/tab-tidy-1.0.0.zip` (15 files, `manifest.json`
  at archive root).
- Submitted to the Chrome Web Store. Awaiting review as of 2026-08-29.
- Privacy policy live at https://tandava-1.github.io/tab-tidy/ (HTTP 200).
- Source repo: https://github.com/tandava-1/tab-tidy (also `homepage_url`).

## Grouping pipeline — four passes, fall-through

Implemented in `lib/analyze.js:planGroups`. Whatever fails one pass gets another
chance at the next. A bucket needs `MIN_GROUP_SIZE` (2) tabs to survive, so a
group of one is never created.

1. **Topic rule** — 17 ordered rules in `lib/categorize.js:RULES`, first match wins.
2. **Site** — `siteKey()` collapses subdomains and handles two-part TLDs (`co.uk`).
3. **Title keyword** — `lib/keywords.js:clusterByKeyword`. The only signal URL
   structure cannot see: three mortgage tabs on three unrelated domains share a
   word but no domain and no rule.
4. **Catch-all** — "Everything else", grey. Appended *after* the confidence sort
   so a junk drawer never heads the list, and default-**deselected** in the popup.

Groups are ordered by confidence: `category` > `site` > `keyword` > `other`.
A topic rule is a deliberate judgement, a shared domain is a fact, a shared title
word is an inference — least certain never leads.

## Two bug fixes that must not regress

- **`chrome://newtab` duplicates.** `isGroupable` excluded internal pages from
  grouping but `findDuplicates` had no equivalent filter, so blank New Tab pages
  inflated the badge and left a permanent nag. Fixed by `isDedupable()` in
  `lib/analyze.js` — http(s) only.
- **Spurious short-token groups.** The keyword pass once joined a broker and a
  shopping site on the shared word "india". Fixed three ways in `lib/keywords.js`:
  short tokens (<= `SHORT_TOKEN_MAX`) now need a second shared word to corroborate
  (`sharedTokenCount >= CORROBORATING_TOKENS`); `STOPWORDS` gained ~45 commerce and
  geography entries; and confidence ordering demotes keyword groups.

## Constraints worth knowing before editing

- `chrome.tabs.group()` accepts tabs from **one window only** — `popup.js:applyGroups`
  splits by `windowId` before calling it.
- Tab group colors are fixed by the API: `grey|blue|red|yellow|green|pink|purple|cyan|orange`.
- Popup is 400px wide, `max-height: 600px` (Chrome's ceiling). Both list panels are
  **empty in `popup.html`** — every card and row is built in `popup.js`.
- Applying twice must fold into the existing group via `chrome.tabGroups.query({ windowId, title })`,
  not create a second one.
- Permissions are `tabs` and `tabGroups` only. `storage` was removed as unused —
  do not add a permission back without a reason the store listing can justify.

## Store assets

Outside this repo, at `~/tab-tidy-store/`:

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
`lib/*.js` plus a `package.json` with `{"type":"module"}` (Node treats bare `.js`
there as CJS otherwise), and `test.mjs` with 24 assertions across 11 fixtures.
Re-create it rather than looking for it — scratchpads are session-local.
