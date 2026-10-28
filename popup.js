import { planGroups, findDuplicates } from './lib/analyze.js';
import { readPages, hasPageAccess, requestPageAccess } from './lib/read.js';
import { isGroupable } from './lib/tabs.js';

const GROUP_DOT_COLORS = {
  grey: '#8a8f98', blue: '#4285f4', red: '#e5484d', yellow: '#f4c025',
  green: '#34a853', pink: '#e05fa0', purple: '#8e5ff2', cyan: '#22b8cf', orange: '#f4813f'
};

const el = {
  scopeInputs: document.querySelectorAll('input[name="scope"]'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  panels: { groups: document.getElementById('panel-groups'), duplicates: document.getElementById('panel-duplicates') },
  groupsList: document.getElementById('groupsList'),
  groupsSummary: document.getElementById('groupsSummary'),
  dupList: document.getElementById('dupList'),
  dupSummary: document.getElementById('dupSummary'),
  dupPill: document.getElementById('dupPill'),
  applyBtn: document.getElementById('applyBtn'),
  closeDupBtn: document.getElementById('closeDupBtn'),
  undoBtn: document.getElementById('undoBtn'),
  footerMsg: document.getElementById('footerMsg'),
  accessNote: document.getElementById('accessNote'),
  accessBtn: document.getElementById('accessBtn')
};

const state = {
  panel: 'groups',
  scope: 'window',
  additions: [],       // ungrouped tabs headed for the user's existing groups
  groups: [],          // planned new groups
  unmatched: [],       // a lone tab that fits nowhere, too few for "Everything else"
  selectedGroups: new Set(),
  dupSets: [],
  dupsElsewhere: 0,    // duplicates in other windows while scope is "This window"
  selectedDupTabs: new Set(),
  lastClosed: [],      // { url, windowId, index, pinned, groupId } closed this session, for "Reopen"
  access: false,       // may we read page content?
  readIds: new Set(),  // tabs whose page was actually read this refresh
  pageCache: new Map(),// "tabId|url" -> page summary, kept while the popup is open
  run: 0               // bumps on every refresh so a stale one can bow out
};

/* ---------- data ---------- */

function loadExistingGroups() {
  return state.scope === 'window'
    ? chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT })
    : chrome.tabGroups.query({});
}

// A tab that is still loading has no `url` yet, only `pendingUrl`. Without this,
// tabs just reopened by "Reopen" are invisible to the refresh that follows.
const withUrl = (tab) => (tab.url || !tab.pendingUrl ? tab : { ...tab, url: tab.pendingUrl });

async function loadTabs() {
  const tabs = await (state.scope === 'window'
    ? chrome.tabs.query({ currentWindow: true })
    : chrome.tabs.query({}));
  return tabs.map(withUrl);
}

/** Duplicates in other windows, so "This window" can say why the badge is higher. */
async function countElsewhere(windowCount) {
  if (state.scope !== 'window') return 0;
  const all = (await chrome.tabs.query({})).map(withUrl);
  return findDuplicates(all).reduce((n, s) => n + s.duplicates.length, 0) - windowCount;
}

/**
 * Reads the pages we haven't read yet in this popup session. Applying groups
 * triggers a refresh, and re-reading every page for that would be wasted work,
 * so summaries are cached by tab and address until the popup closes.
 */
async function readWithCache(tabs, onProgress) {
  const keyOf = (tab) => `${tab.id}|${tab.url}`;
  const fresh = await readPages(tabs.filter((t) => !state.pageCache.has(keyOf(t))), { onProgress });
  for (const tab of tabs) {
    if (fresh.has(tab.id)) state.pageCache.set(keyOf(tab), fresh.get(tab.id));
  }
  const pages = new Map();
  for (const tab of tabs) {
    const page = state.pageCache.get(keyOf(tab));
    if (page) pages.set(tab.id, page);
  }
  return pages;
}

async function refresh() {
  const run = ++state.run;
  const tabs = await loadTabs();

  // Duplicates need no page content, so show them straight away.
  state.dupSets = findDuplicates(tabs);
  state.selectedDupTabs = new Set(state.dupSets.flatMap((s) => s.duplicates.map((t) => t.id)));
  state.dupsElsewhere = await countElsewhere(state.dupSets.reduce((n, s) => n + s.duplicates.length, 0));
  if (run !== state.run) return;
  renderDuplicates();

  state.access = await hasPageAccess();
  el.accessNote.hidden = state.access;
  let pages = new Map();
  if (state.access) {
    el.groupsList.replaceChildren();
    el.groupsSummary.textContent = 'Reading pages…';
    pages = await readWithCache(tabs.filter(isGroupable), (done, total) => {
      if (run === state.run) el.groupsSummary.textContent = `Reading pages… ${done} of ${total}`;
    });
  }
  // The scope changed or the user applied groups while we were reading.
  if (run !== state.run) return;

  const existing = await loadExistingGroups();
  if (run !== state.run) return;

  state.readIds = new Set(pages.keys());
  ({ additions: state.additions, groups: state.groups, unmatched: state.unmatched } = planGroups(tabs, pages, existing));
  // Additions and content groups are confident enough to pre-select; the
  // catch-all is a judgement call the user opts into.
  state.selectedGroups = new Set([
    ...state.additions.map((a) => a.key),
    ...state.groups.filter((g) => g.source !== 'other').map((g) => g.key)
  ]);
  renderGroups();
}

/* ---------- rendering ---------- */

function tabRow(tab, { tag } = {}) {
  const row = document.createElement('div');
  row.className = 'tab-row' + (tag === 'keep' ? ' keep' : '');

  const icon = document.createElement('img');
  icon.src = tab.favIconUrl || 'icons/icon16.png';
  icon.addEventListener('error', () => { icon.src = 'icons/icon16.png'; });
  row.append(icon);

  // A button, so keyboard users can jump to the tab too.
  const title = document.createElement('button');
  title.type = 'button';
  title.className = 't';
  title.textContent = tab.title || tab.url;
  title.title = tab.url;
  title.addEventListener('click', () => focusTab(tab));
  row.append(title);

  if (tag) {
    const badge = document.createElement('span');
    badge.className = 'tag' + (tag === 'keep' ? ' keep' : '');
    badge.textContent = { keep: 'keep', dup: 'duplicate', titleOnly: 'title only' }[tag];
    if (tag === 'titleOnly') badge.title = "This page couldn't be read (asleep, or a protected page), so its title and address were used.";
    row.append(badge);
  }
  return row;
}

function card({ checked, color, title, count, editableTitle, onToggle, onRename, body }) {
  const wrap = document.createElement('div');
  wrap.className = 'card';

  const head = document.createElement('div');
  head.className = 'card-head';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('click', (e) => e.stopPropagation());
  box.addEventListener('change', () => onToggle(box.checked));
  head.append(box);

  if (color) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = GROUP_DOT_COLORS[color] || GROUP_DOT_COLORS.grey;
    head.append(dot);
  }

  const name = document.createElement('span');
  name.className = 'card-title';
  name.textContent = title;
  if (editableTitle) {
    name.contentEditable = 'true';
    name.spellcheck = false;
    name.addEventListener('click', (e) => e.stopPropagation());
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
    });
    name.addEventListener('blur', () => onRename(name.textContent.trim() || title));
  }
  head.append(name);

  const badge = document.createElement('span');
  badge.className = 'count';
  badge.textContent = count;
  head.append(badge);

  // A real button, so the keyboard can expand a card; the whole head still
  // toggles on click for the mouse.
  const chev = document.createElement('button');
  chev.type = 'button';
  chev.className = 'chev';
  chev.textContent = '▶';
  chev.setAttribute('aria-expanded', 'false');
  chev.setAttribute('aria-label', `Show tabs in ${title}`);
  chev.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  head.append(chev);

  function toggle() {
    const open = wrap.classList.toggle('is-open');
    chev.setAttribute('aria-expanded', String(open));
  }
  head.addEventListener('click', toggle);
  wrap.append(head, body);
  return wrap;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function sectionHeading(text) {
  const h = document.createElement('h3');
  h.className = 'section';
  h.textContent = text;
  return h;
}

function groupCard(group, { isAddition }) {
  const body = document.createElement('div');
  body.className = 'card-body';
  // Only worth flagging once page reading is on; before that, every tab is title-only.
  group.tabs.forEach((tab) => body.append(tabRow(tab, {
    tag: state.access && !state.readIds.has(tab.id) ? 'titleOnly' : null
  })));

  return card({
    checked: state.selectedGroups.has(group.key),
    color: group.color,
    title: group.name,
    // An addition shows only the tabs it brings, so say so.
    count: isAddition ? `+${plural(group.tabs.length, 'tab')}` : plural(group.tabs.length, 'tab'),
    // The user's own groups are never renamed.
    editableTitle: !isAddition,
    onToggle: (on) => {
      on ? state.selectedGroups.add(group.key) : state.selectedGroups.delete(group.key);
      updateFooter();
    },
    onRename: (value) => { group.name = value; },
    body
  });
}

function renderGroups() {
  el.groupsList.replaceChildren();
  const { additions, groups } = state;

  if (!additions.length && !groups.length) {
    el.groupsSummary.textContent = '';
    el.groupsList.append(emptyState('Nothing to group', 'No two open tabs are about the same thing right now.'));
    updateFooter();
    return;
  }

  const parts = [];
  if (additions.length) {
    const n = additions.reduce((sum, a) => sum + a.tabs.length, 0);
    parts.push(`${plural(n, 'tab')} fit${n === 1 ? 's' : ''} your existing groups`);
  }
  const fresh = groups.filter((g) => g.source !== 'other');
  if (fresh.length) {
    const n = fresh.reduce((sum, g) => sum + g.tabs.length, 0);
    parts.push(`${plural(fresh.length, 'new group')} from ${plural(n, 'tab')}`);
  }
  const leftover = groups.find((g) => g.source === 'other');
  if (leftover) parts.push(`${plural(leftover.tabs.length, 'tab')} matched nothing`);
  // Too few for "Everything else", but still say so, or the counts don't add up.
  else if (state.unmatched.length) parts.push(`${plural(state.unmatched.length, 'tab')} matched nothing and stays as it is`);
  el.groupsSummary.textContent = parts.join('; ') + '.';

  // Headings only earn their place when there are two kinds of thing to tell apart.
  if (additions.length) {
    el.groupsList.append(sectionHeading('Add to your groups'));
    additions.forEach((a) => el.groupsList.append(groupCard(a, { isAddition: true })));
    if (groups.length) el.groupsList.append(sectionHeading(fresh.length ? 'New groups' : "Didn't fit anywhere"));
  }
  groups.forEach((g) => el.groupsList.append(groupCard(g, { isAddition: false })));
  updateFooter();
}

function renderDuplicates() {
  el.dupList.replaceChildren();
  const dupCount = state.dupSets.reduce((n, s) => n + s.duplicates.length, 0);

  el.dupPill.hidden = dupCount === 0;
  el.dupPill.textContent = dupCount;

  // The toolbar badge counts every window; say so when this window shows fewer.
  const elsewhere = state.dupsElsewhere
    ? `${plural(state.dupsElsewhere, 'more duplicate')} in other windows. Switch to All windows to see ${state.dupsElsewhere === 1 ? 'it' : 'them'}.`
    : '';

  if (!state.dupSets.length) {
    el.dupSummary.textContent = '';
    el.dupList.append(elsewhere
      ? emptyState('No duplicates in this window', elsewhere)
      : emptyState('No duplicates', 'Every open tab points somewhere different. Nice.'));
    updateFooter();
    return;
  }

  el.dupSummary.textContent =
    `${dupCount} redundant tab${dupCount === 1 ? '' : 's'} across ${state.dupSets.length} address${state.dupSets.length === 1 ? '' : 'es'}. One tab per address is kept.` +
    (elsewhere ? ` ${elsewhere}` : '');

  for (const set of state.dupSets) {
    const body = document.createElement('div');
    body.className = 'card-body';
    body.append(tabRow(set.keep, { tag: 'keep' }));
    set.duplicates.forEach((tab) => body.append(tabRow(tab, { tag: 'dup' })));

    const url = document.createElement('div');
    url.className = 'dup-url';
    url.textContent = set.url;

    const wrap = card({
      checked: set.duplicates.every((t) => state.selectedDupTabs.has(t.id)),
      color: null,
      title: set.keep.title || set.url,
      count: `${set.duplicates.length + 1} copies`,
      editableTitle: false,
      onToggle: (on) => {
        set.duplicates.forEach((t) => on ? state.selectedDupTabs.add(t.id) : state.selectedDupTabs.delete(t.id));
        updateFooter();
      },
      body
    });
    wrap.insertBefore(url, wrap.querySelector('.card-body'));
    el.dupList.append(wrap);
  }
  updateFooter();
}

function emptyState(heading, detail) {
  const div = document.createElement('div');
  div.className = 'empty';
  const strong = document.createElement('strong');
  strong.textContent = heading;
  div.append(strong, document.createTextNode(detail));
  return div;
}

function updateFooter() {
  const onGroups = state.panel === 'groups';
  el.applyBtn.hidden = !onGroups;
  el.closeDupBtn.hidden = onGroups;
  el.undoBtn.hidden = onGroups || state.lastClosed.length === 0;

  if (onGroups) {
    const n = state.selectedGroups.size;
    el.applyBtn.disabled = n === 0;
    el.applyBtn.textContent = n ? `Group ${n} selected` : 'Group selected';
  } else {
    const n = state.selectedDupTabs.size;
    el.closeDupBtn.disabled = n === 0;
    el.closeDupBtn.textContent = n ? `Close ${n} duplicate${n === 1 ? '' : 's'}` : 'Close duplicates';
    el.undoBtn.textContent = `Reopen ${state.lastClosed.length}`;
  }
}

function say(message) {
  el.footerMsg.textContent = message;
  if (message) setTimeout(() => { if (el.footerMsg.textContent === message) el.footerMsg.textContent = ''; }, 4000);
}

/* ---------- actions ---------- */

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  window.close();
}

async function applyGroups() {
  let grouped = 0;

  // Into the user's own groups: add tabs, never touch the name or colour.
  for (const addition of state.additions.filter((a) => state.selectedGroups.has(a.key))) {
    try {
      await chrome.tabs.group({ tabIds: addition.tabs.map((t) => t.id), groupId: addition.groupId });
      grouped += addition.tabs.length;
    } catch (err) {
      console.error('Failed to add to group', addition.name, err);
    }
  }

  const selected = state.groups.filter((g) => state.selectedGroups.has(g.key));

  for (const group of selected) {
    // chrome.tabs.group only accepts tabs from a single window, so split first.
    const byWindow = new Map();
    for (const tab of group.tabs) {
      if (!byWindow.has(tab.windowId)) byWindow.set(tab.windowId, []);
      byWindow.get(tab.windowId).push(tab.id);
    }

    for (const [windowId, tabIds] of byWindow) {
      try {
        // Fold into an existing group of the same name rather than making a second one.
        // If that group is one the user already had, its colour stays theirs.
        const [existing] = await chrome.tabGroups.query({ windowId, title: group.name });
        if (existing) {
          await chrome.tabs.group({ tabIds, groupId: existing.id });
        } else {
          const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
          await chrome.tabGroups.update(groupId, { title: group.name, color: group.color });
        }
        grouped += tabIds.length;
      } catch (err) {
        console.error('Failed to group', group.name, err);
      }
    }
  }

  await refresh();
  say(grouped ? `Grouped ${plural(grouped, 'tab')}.` : 'Nothing was grouped.');
}

async function closeDuplicates() {
  const ids = [...state.selectedDupTabs];
  if (!ids.length) return;

  // Remember where each tab was, so "Reopen" can put it back in place. Only in
  // this popup's memory: the privacy policy promises nothing is written to disk.
  const byId = new Map();
  state.dupSets.forEach((s) => s.duplicates.forEach((t) => byId.set(t.id, t)));
  // Chrome deletes a group when its last tab closes, so keep its name and colour too.
  const groupInfo = new Map((await chrome.tabGroups.query({})).map((g) => [g.id, { title: g.title, color: g.color }]));
  state.lastClosed = ids.map((id) => byId.get(id)).filter(Boolean)
    .map(({ url, windowId, index, pinned, groupId }) => ({ url, windowId, index, pinned, groupId, group: groupInfo.get(groupId) }));

  await chrome.tabs.remove(ids);
  chrome.runtime.sendMessage({ type: 'refreshBadge' }).catch(() => {});
  await refresh();
  say(`Closed ${plural(ids.length, 'duplicate')}.`);
}

/** Puts a reopened tab back in its old group, recreating the group if Chrome removed it. */
async function regroup(created, tab, regrouped) {
  let groupId = regrouped.get(tab.groupId);
  if (groupId === undefined) {
    const alive = await chrome.tabGroups.get(tab.groupId).catch(() => null);
    groupId = alive?.id;
  }
  if (groupId !== undefined) {
    await chrome.tabs.group({ tabIds: [created.id], groupId });
  } else {
    groupId = await chrome.tabs.group({ tabIds: [created.id], createProperties: { windowId: tab.windowId } });
    await chrome.tabGroups.update(groupId, { title: tab.group.title, color: tab.group.color });
  }
  regrouped.set(tab.groupId, groupId);
}

async function reopenClosed() {
  const closed = state.lastClosed;
  state.lastClosed = [];
  const windows = new Set((await chrome.windows.getAll()).map((w) => w.id));
  const regrouped = new Map(); // old groupId -> the group it went back into

  // Lowest index first, so each tab lands where it was before the ones after it.
  for (const tab of [...closed].sort((a, b) => a.windowId - b.windowId || a.index - b.index)) {
    const home = windows.has(tab.windowId);
    const created = await chrome.tabs.create({
      url: tab.url,
      active: false,
      pinned: tab.pinned,
      // Its window may have closed since; then it opens in this one, at the end.
      ...(home ? { windowId: tab.windowId, index: tab.index } : {})
    });
    if (home && tab.group) await regroup(created, tab, regrouped).catch(() => {});
  }
  chrome.runtime.sendMessage({ type: 'refreshBadge' }).catch(() => {});
  await refresh();
  say(`Reopened ${plural(closed.length, 'tab')}.`);
}

/* ---------- wiring ---------- */

function showPanel(btn) {
  state.panel = btn.dataset.panel;
  el.tabBtns.forEach((b) => {
    const on = b === btn;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  Object.entries(el.panels).forEach(([name, panel]) => panel.classList.toggle('is-active', name === state.panel));
  el.footerMsg.textContent = '';
  updateFooter();
}

el.tabBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => showPanel(btn));
  // Arrow keys move between tabs, as screen readers expect of a tablist.
  btn.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = el.tabBtns[(i + (e.key === 'ArrowRight' ? 1 : -1) + el.tabBtns.length) % el.tabBtns.length];
    next.focus();
    showPanel(next);
  });
});

el.scopeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    state.scope = input.value;
    refresh();
  });
});

el.accessBtn.addEventListener('click', async () => {
  // Chrome may close the popup while its permission prompt is up; if so the
  // grant still sticks, and the next open reads pages.
  const granted = await requestPageAccess().catch(() => false);
  if (granted) refresh();
  else say('Still grouping by titles only.');
});

el.applyBtn.addEventListener('click', applyGroups);
el.closeDupBtn.addEventListener('click', closeDuplicates);
el.undoBtn.addEventListener('click', reopenClosed);

refresh();
