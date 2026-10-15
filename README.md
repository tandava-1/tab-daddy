# Tab Daddy

A Chrome extension (Manifest V3) that cleans up browser clutter two ways:
**meaningful tab groups** and **duplicate detection**.

Everything runs on your computer. No account, no server, no tracking: the
extension makes no network requests, and nothing about your tabs leaves the
browser.

## Install

**From the Chrome Web Store:** one click, auto-updates, no Developer mode.

**From source:**

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder
4. Pin "Tab Daddy" to the toolbar

## Grouping

Tabs are grouped **by what you're using them for first, and by topic for the rest**.

1. **Use case.** Tab Daddy recognises about 1,150 well-known sites and web apps
   and the group each belongs in: Myntra, Flipkart and Amazon are **Shopping**,
   X and Instagram are **Social**, GitHub and Stack Overflow are **Coding**, a
   Google Sheet or an Excel file is **Sheets**. Sites it doesn't know can still
   say what they are: a page with a price and an add-to-cart button is Shopping,
   a recipe is Food, a news story is News. Two or more tabs with the same use
   case make a group with that name. The list lives in `lib/sites.js`, built
   from research on the most-visited sites worldwide and in India
   (`tools/sites/`). Addresses are matched on your computer only.
2. **Topic.** Tabs with no use case are grouped by what their pages say. With
   your permission, Tab Daddy reads a short summary of each page (its title,
   description, main headings and the start of its main text, never menus,
   headers, sidebars or hidden text) and groups pages that share enough
   ordinary words.

A lone tab with a use case (one Amazon tab among your research) goes to
"Everything else" rather than into a topic. Two tabs never group on a shared
name alone: they need an ordinary word in common, so a person's X profile and
their book on Amazon stay apart.

Some pages can't be read: tabs Chrome has put to sleep, `chrome://` pages and
the Web Store. Those fall back to their title and site name, and the popup tags
them **title only**. Until you allow page reading, every tab is grouped that way.

The popup previews every proposed group before anything happens: rename inline,
uncheck what you don't want, expand to see members. **"Everything else" is
unchecked by default**.

### Group names

Use-case groups are named for their use case ("Shopping", "Coding", "Sheets").
Topic groups are named after the words most of their tabs share, as the pages
write them ("Mortgage rates", "useEffect"), and never after a site. Rename any
group in the popup before applying.

### Your existing groups

Tabs already in a group are never moved. Before making new groups, Tab Daddy
offers each ungrouped tab to the groups you already have in the same window,
under **Add to your groups**. A tab joins a group if it's as close to any one of
that group's tabs, or to the group's name, as two tabs need to be to form a new
group. Whatever doesn't fit goes on to new groups as usual.

Your groups are never renamed or recoloured. Applying only adds the tabs you
left ticked. If you rename a new group to the name of one of yours, its tabs
fold into your group and it keeps its colour. Pinned tabs and `chrome://` pages
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
| `manifest.json` | MV3 manifest |
| `background.js` | Service worker; keeps the duplicate badge count current |
| `popup.html/.css/.js` | The UI and all user actions |
| `lib/sites.js` | Generated list of known sites and their use cases (`tools/sites/build.py`) |
| `lib/usecase.js` | A tab's use case, from the site list or the page's own clues |
| `lib/read.js` | Page-access permission and reading page summaries |
| `lib/cluster.js` | Grouping tabs by content, and naming the groups |
| `lib/keywords.js` | Word splitting and the ignored-word list |
| `lib/tabs.js` | Which tabs take part or can be read, site names, group colours |
| `lib/analyze.js` | The grouping entry point, URL canonicalization, duplicate finding |

## Tests

`npm test` runs the logic suite in `tests/` (Node 24, no dependencies). Real
pages captured with the extension's own reader live in `tests/real-pages.json`.
`tools/browser/` drives the real extension in Chrome for Testing: `npm install`,
`npm run chrome`, then `node drive.mjs --granted`.

## Tweaking

`MERGE_THRESHOLD` in `lib/cluster.js` decides how alike two tabs must be to
group: lower joins more, higher splits more. `FIELD_WEIGHTS` sets how much the
title, headings and body count. If a group forms around a meaningless word, the
fix is usually a new entry in `STOPWORDS` in `lib/keywords.js`.
`MIN_GROUP_SIZE` in `lib/analyze.js` sets the smallest group proposed.

Reload from `chrome://extensions` after editing.

## Permissions

- `tabs`: read tab titles and addresses, to group them and compare for duplicates
- `tabGroups`: create and name the resulting native tab groups
- `scripting`: run the small page-summary reader in your open tabs
- Access to all sites (**optional**, asked for on first use): needed for the
  page-summary reader to run on the pages you have open

Page text is held in the popup's memory only while it's open. It is never
stored, logged or sent anywhere.
