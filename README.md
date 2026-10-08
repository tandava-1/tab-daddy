# Tab Daddy

A Chrome extension (Manifest V3) that cleans up browser clutter two ways:
**meaningful tab groups** and **duplicate detection**.

Everything runs locally. No account, no server, no network requests, no data
collection — the extension has no networking code at all.

## Install

**From the Chrome Web Store:** one click, auto-updates, no Developer mode.

**From source:**

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder
4. Pin "Tab Daddy" to the toolbar

## Grouping

Tabs fall through a four-pass pipeline. Each pass gets the tabs the previous one
couldn't place, and a bucket needs at least 2 tabs to survive — you never end up
with a group of one.

| Pass | Signal | Example |
| --- | --- | --- |
| 1. Topic rules | Hostname (and sometimes path) against 17 built-in topics | `mail.google.com` → **Email** |
| 2. Site | Registrable domain, subdomains collapsed | 4 tabs on `*.notion.so` → **Notion** |
| 3. Keyword | Significant words shared across tab *titles* | NerdWallet + Bankrate + Chase → **Mortgage** |
| 4. Catch-all | Everything still loose | → **Everything else** |

Pass 3 is what catches a single topic spread across unrelated domains — the case
no amount of URL matching can see. It strips the trailing `– Site Name` segment
from each title first (otherwise every tab on a site shares that site's name),
drops stopwords and short words, then greedily takes the word covering the most
tabs, emits it as a group, removes those tabs, and repeats.

The popup previews every proposed group before anything happens: rename inline,
uncheck what you don't want, expand to see members. **"Everything else" is
unchecked by default** — it's a judgement call you opt into.

Applying uses Chrome's native tab groups and folds into an existing group of the
same name rather than creating a second one. Pinned tabs and `chrome://` pages
are left alone.

## Duplicates

The toolbar badge shows a live count of redundant tabs. URLs are compared in
canonical form, so these all count as the same page:

```
https://github.com/x/y
http://www.github.com/x/y/
https://github.com/x/y?utm_source=newsletter
https://github.com/x/y#readme
```

Each duplicate set keeps one tab — the pinned one, else the active one, else the
most recently used — and offers to close the rest. **Reopen closed** restores
anything you just closed.

A scope toggle switches both panels between the current window and all windows.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest; permissions are `tabs` and `tabGroups` |
| `background.js` | Service worker; keeps the duplicate badge count current |
| `popup.html/.css/.js` | The UI and all user actions |
| `lib/categorize.js` | Topic rules, site-key extraction, group colors |
| `lib/keywords.js` | Title tokenizer, stopwords, keyword clustering |
| `lib/analyze.js` | URL canonicalization, the grouping pipeline, duplicate finding |

## Tweaking

**Add a site to a topic** — `RULES` in `lib/categorize.js` is ordered, first match
wins, and `hosts` entries match a hostname or any subdomain of it:

```js
{ name: 'Code', color: 'blue', hosts: ['github.com', 'your-internal-git.example'] }
```

**Other knobs** — `MIN_GROUP_SIZE` in `lib/analyze.js` sets the smallest group
proposed. `STOPWORDS`, `MIN_TOKEN_LENGTH`, and `MAX_KEYWORD_GROUPS` in
`lib/keywords.js` tune the keyword pass; if it produces an odd group name, the
fix is usually a new stopword.

Reload from `chrome://extensions` after editing.

## Permissions

- `tabs` — read tab titles and URLs to categorize them and compare for duplicates
- `tabGroups` — create and name the resulting native tab groups

Neither is used for anything else, and nothing leaves your machine.
