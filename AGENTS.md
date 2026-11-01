# Working on Tab Daddy

Read `CONTEXT.md` before starting, if you have it. Its "Current state" section
is where the project stands; its log is how it got there. Update both as you
work. This repo is public: `CONTEXT.md` stays local and is gitignored, so keep
anything private out of this file, the README and `docs/`.

Tab Daddy is a Manifest V3 Chrome extension, formerly **Tab Tidy** (v1.0.0). It
groups open tabs into meaningful groups and finds duplicate tabs. Everything
runs locally: no server, no network requests.

How grouping works is in `docs/engineering/grouping.md`. Store listing copy,
permission justifications and release steps are in
`docs/product/store/listing.md`.

## Rules

- The extension makes no network requests, and page text never leaves the
  popup's memory. The store listing and privacy policy promise both.
- Permissions are `tabs`, `tabGroups`, `scripting`, plus optional `<all_urls>`.
  Don't add a permission without a reason the store listing can justify.
- `lib/sites.js` is generated. Edit the research or `tools/sites/build.py`, then
  run `python3 tools/sites/merge.py tools/sites/research` and
  `python3 tools/sites/build.py tools/sites/research/merged.json lib/sites.js`.
- `index.html` at the root is the privacy policy, served by GitHub Pages at
  https://tandava-1.github.io/tab-daddy/. It is not part of the extension.
- Keep tests and test tools in the repo, not in a scratch folder.

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

## Releasing an update

- `version` in `manifest.json` **must increment** before rebuilding the zip — the
  store rejects an upload whose version is not higher than what is live. This is
  the step that catches everyone out.
- The store zip holds only `manifest.json`, `background.js`, `popup.*`, `lib/`
  and `icons/` — never `tests/`, `tools/`, `docs/` or `index.html`. Build it into
  `docs/product/store/`; `*.zip` is gitignored.

## Testing

`npm test` (repo root) runs `tests/*.test.mjs` with node:test, no dependencies:
topic, use case, existing groups, duplicates. Topic fixtures use
made-up `.example` addresses (avoid real words as hostnames: a site called
`rates.example` makes "rates" a site name). `tests/real-pages.json` = 13 real
pages captured with the extension's own reader; `realPages({ neutral: true })`
gives them made-up addresses so only content counts.

Real browser: `tools/browser/` (`npm install`, `npm run chrome` installs Chrome
for Testing into `.chrome/`, git-ignored). `extract-probe.mjs <urls>` runs the
real reader on live pages (`--save=` to capture). `drive.mjs` loads the
extension, opens real tabs, can create user groups (`--groups=`), screenshot
(`--shot=`) and apply (`--apply`). `--granted` runs a temp copy with site access
required, because Puppeteer can't click Chrome's permission prompt.
