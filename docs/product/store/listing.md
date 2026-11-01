# Tab Daddy — Web Store submission copy (v2.0.0)

Paste-ready text for the Developer Dashboard. Store item:
`gomobpfmegmaojmogfnmdiollcolndkm` (was Tab Tidy 1.0.0). Package:
`tab-daddy-2.0.0.zip`, built locally into this folder and kept out of git (rebuild
from source before uploading)

---

## Item name
Tab Daddy

## Short description (132 char max)
Group tabs by what you're doing: Shopping, Social, Coding, Sheets and more. Joins your own groups and closes duplicate tabs.

## Detailed description (1600 char max, ASCII-only, NO brand or site names)

Rejected once (2026-10, "Yellow Argon" keyword spam) for naming Myntra, Flipkart,
Amazon, X, Instagram, GitHub, Stack Overflow, Google Sheet and Excel. Describe use
cases, never other companies' products.

Tab Daddy cleans up browser clutter two ways.

GROUP TABS BY WHAT YOU'RE DOING
Tab Daddy recognises over a thousand popular sites and web apps and sorts their tabs by use: shopping, social media, coding, spreadsheets, documents, email, news and more. Sites it doesn't know can still tell it what they are, like a shop page with an add-to-cart button. Everything else is grouped by topic, so three articles about mortgages on three different sites end up together. Every group is a proposal you review first: rename it, untick it, or expand it to see its tabs. Nothing changes until you press Group.

WORKS WITH YOUR GROUPS
Already have tab groups? Loose tabs are offered to the group they fit first. Your groups are never renamed or recoloured, and grouped tabs are never moved.

FIND DUPLICATES
The toolbar badge counts redundant tabs. The same page counts as a duplicate even with "www", a #section or tracking codes like utm_source. Each set keeps one tab and closes the rest on your command; Reopen closed puts them back.

Switch either panel between the current window and all windows. Pinned tabs are never touched.

PRIVACY
Everything happens on your computer. Tab Daddy has no server and makes no network requests; page reading happens only after you allow it, and nothing about your tabs ever leaves your browser.

## Category
Workflow & Planning

## Single purpose statement
Tab Daddy organizes a user's open browser tabs into named groups and identifies duplicate tabs so they can be closed.

---

## Permission justifications

**tabs**
Reads the titles and addresses of open tabs. Addresses are compared in canonical form to find duplicate tabs, and matched against a list bundled in the extension to recognise well-known sites and web apps (e.g. an online spreadsheet goes in the Sheets group). Titles are used to group tabs whose pages can't be read. Held in memory while the popup is open; never transmitted.

**tabGroups**
Creates Chrome tab groups when the user applies a proposed grouping, adds tabs to groups the user already has, and reads existing groups so loose tabs can be offered to the group they fit.

**scripting**
Runs a small bundled function in open tabs that returns a summary of the page (title, meta description, main headings, the first 1,500 characters of the main text). That summary is how tabs are grouped by topic. It runs only after the user grants site access, only when the popup is opened, and the summary never leaves the computer.

**Host permission (optional `<all_urls>`)**
Optional, requested from the popup when the user clicks Allow. Needed for the page-summary function above to run on whatever pages the user has open; the set of sites is the user's own open tabs, so it can't be narrowed in advance. Without it, the extension groups by titles only.

**Remote code**
No. All scripts are bundled in the package, and the extension makes no network requests. No external scripts, no eval.

---

## Data usage disclosure

Check **nothing** in the data collection table: no data leaves the user's computer.

Affirm all three certifications:
- Does not sell or transfer user data to third parties outside approved use cases
- Does not use or transfer user data for purposes unrelated to the item's single purpose
- Does not use or transfer user data to determine creditworthiness or for lending purposes

Privacy policy URL: https://tandava-1.github.io/tab-daddy/

---

## Assets checklist

- [x] Store icon 128x128: `icons/icon128.png` in the package (placeholder moustache)
- [ ] Screenshots 1280x800: `screenshots-v2/` predates use-case grouping; retake before
      submitting. Replace the old 1.0.0 shots (`screenshots/`, `screenshots-letterbox/`,
      kept locally and out of git): they show Tab Tidy over a real browser session.
- [ ] Small promo tile 440x280 (optional)

---

## Release steps (update to the existing item, not a new item)

1. Push to GitHub and confirm the privacy policy at the URL above is the
   "works entirely on your computer" version (the repo is already renamed).
2. Developer Dashboard -> Tab Daddy (was Tab Tidy) -> **Package** -> upload
   `tab-daddy-2.0.0.zip`.
3. **Store listing**: new name, descriptions, screenshots.
4. **Privacy practices**: single purpose, the four justifications above, remote code
   = no, data disclosure (nothing), new privacy policy URL.
5. Submit for review.

Expect closer review than 1.0.0: this update adds `scripting` and an optional all-sites
host permission. Reviewers read the scripting and host-permission
justifications most closely.
