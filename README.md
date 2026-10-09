# Tab Daddy

A Chrome extension (Manifest V3) that cleans up browser clutter two ways:
**meaningful tab groups** and **duplicate detection**.

Grouping runs entirely on your computer. The one optional exception is **AI
naming**: if you say yes, the extension sends a few words per group to our
naming server so groups get natural names. No account, no tracking, and nothing
is sent unless you opt in.

## Install

**From the Chrome Web Store:** one click, auto-updates, no Developer mode.

**From source:**

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder
4. Pin "Tab Daddy" to the toolbar

## Grouping

Tabs are grouped by **what their pages are about**, not by their addresses.

With your permission, Tab Daddy reads a short summary of each open page: its
title, its own description, its main headings and the start of its main text.
Each tab becomes a weighted list of significant words (title words count most,
body text least), and tabs are merged, most similar first, until nothing left
is similar enough. A group needs at least 2 tabs, so you never end up with a
group of one; it's named after the words most of its tabs share.

Some pages can't be read: tabs Chrome has put to sleep, `chrome://` pages and
the Web Store. Those fall back to their title and site name, and the popup tags
them **title only**. Until you allow page reading, every tab is grouped that way.

Two tabs only count as related if they share two significant words, or one word
longer than five letters, so a coincidence like a broker and a shop both
mentioning "India" doesn't make a group.

The popup previews every proposed group before anything happens: rename inline,
uncheck what you don't want, expand to see members. **"Everything else" is
unchecked by default** — it's a judgement call you opt into.

### Group names

Groups are decided on your computer first; only then are they named. By
default a group is named after the words most of its tabs share, and never
after a site ("Lo-fi music", not "YouTube").

The first time there's something to name, the popup asks whether to **name
groups with AI**. If you say yes, it sends, for each new group, up to eight
words that appear on at least two of its tabs. An OTP, an account number or a
name in an email subject almost never appears on two different pages, so it
doesn't survive that rule; anything with digits or symbols is dropped as well.
Page text, titles and addresses are never sent, and pages with a password,
card or one-time-code field contribute nothing. Names come back from an open
model (via Groq) behind our own small server, and are cached on your computer
for 7 days, so reopening the popup on the same tabs sends nothing. If naming
is slow (over 3 seconds) or fails, the word-based names are used. You can turn
it off from the line under the groups list.

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
| `lib/read.js` | Page-access permission and reading page summaries |
| `lib/cluster.js` | Grouping tabs by content, and naming the groups |
| `lib/keywords.js` | Word splitting and the ignored-word list |
| `lib/tabs.js` | Which tabs take part or can be read, site names, group colours |
| `lib/naming.js` | Optional AI naming: consent, what's sent, cache, validation |
| `lib/analyze.js` | The grouping entry point, URL canonicalization, duplicate finding |

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
- `storage`: remember your AI-naming choice and cache names on your computer
- Access to all sites (**optional**, asked for on first use): needed for the
  page-summary reader to run on the pages you have open

Page text is held in the popup's memory only while it's open. It is never
stored, logged or sent anywhere. With AI naming on, only the shared words
described above leave your computer.
