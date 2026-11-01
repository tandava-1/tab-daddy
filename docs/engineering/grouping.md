# How grouping works

The design behind `lib/analyze.js`, `lib/usecase.js`, `lib/read.js` and
`lib/cluster.js`. Update it when the algorithm changes.

## Use case first, topic for the rest

Decided 2026-10-15. `lib/analyze.js:planGroups(tabs, pages, existing)`:

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
3. >= 2 tabs of a use case -> group named for it (`source: 'usecase'`).
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
became the topic). Plus `clues` for the use case.

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

Site access is `optional_host_permissions: <all_urls>`, requested from the popup's
Allow button. Without it everything groups on title + site name.

