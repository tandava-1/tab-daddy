import { planGroups, findDuplicates } from './lib/analyze.js';

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
  footerMsg: document.getElementById('footerMsg')
};

const state = {
  panel: 'groups',
  scope: 'window',
  groups: [],          // planned groups
  selectedGroups: new Set(),
  dupSets: [],
  selectedDupTabs: new Set(),
  lastClosed: []       // urls closed in this session, for "Reopen closed"
};

/* ---------- data ---------- */

async function loadTabs() {
  return state.scope === 'window'
    ? chrome.tabs.query({ currentWindow: true })
    : chrome.tabs.query({});
}

async function refresh() {
  const tabs = await loadTabs();
  state.groups = planGroups(tabs);
  state.dupSets = findDuplicates(tabs);
  // Topic, site and keyword groups are confident enough to pre-select; the
  // catch-all is a judgement call the user opts into.
  state.selectedGroups = new Set(
    state.groups.filter((g) => g.source !== 'other').map((g) => g.key)
  );
  state.selectedDupTabs = new Set(state.dupSets.flatMap((s) => s.duplicates.map((t) => t.id)));
  render();
}

/* ---------- rendering ---------- */

function tabRow(tab, { tag } = {}) {
  const row = document.createElement('div');
  row.className = 'tab-row' + (tag === 'keep' ? ' keep' : '');

  const icon = document.createElement('img');
  icon.src = tab.favIconUrl || 'icons/icon16.png';
  icon.addEventListener('error', () => { icon.src = 'icons/icon16.png'; });
  row.append(icon);

  const title = document.createElement('span');
  title.className = 't';
  title.textContent = tab.title || tab.url;
  title.title = tab.url;
  title.addEventListener('click', () => focusTab(tab));
  row.append(title);

  if (tag) {
    const badge = document.createElement('span');
    badge.className = 'tag' + (tag === 'keep' ? ' keep' : '');
    badge.textContent = tag === 'keep' ? 'keep' : 'duplicate';
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

  const chev = document.createElement('span');
  chev.className = 'chev';
  chev.textContent = '▶';
  head.append(chev);

  head.addEventListener('click', () => wrap.classList.toggle('is-open'));
  wrap.append(head, body);
  return wrap;
}

function renderGroups() {
  el.groupsList.replaceChildren();
  const total = state.groups.reduce((n, g) => n + g.tabs.length, 0);

  if (!state.groups.length) {
    el.groupsSummary.textContent = '';
    el.groupsList.append(emptyState('Nothing to group', 'No two open tabs share a topic or a site right now.'));
    updateFooter();
    return;
  }

  el.groupsSummary.textContent =
    `${state.groups.length} group${state.groups.length === 1 ? '' : 's'} from ${total} tabs. Rename any group before applying.`;

  for (const group of state.groups) {
    const body = document.createElement('div');
    body.className = 'card-body';
    group.tabs.forEach((tab) => body.append(tabRow(tab)));

    el.groupsList.append(card({
      checked: state.selectedGroups.has(group.key),
      color: group.color,
      title: group.name,
      count: `${group.tabs.length} tab${group.tabs.length === 1 ? '' : 's'}`,
      editableTitle: true,
      onToggle: (on) => {
        on ? state.selectedGroups.add(group.key) : state.selectedGroups.delete(group.key);
        updateFooter();
      },
      onRename: (value) => { group.name = value; },
      body
    }));
  }
  updateFooter();
}

function renderDuplicates() {
  el.dupList.replaceChildren();
  const dupCount = state.dupSets.reduce((n, s) => n + s.duplicates.length, 0);

  el.dupPill.hidden = dupCount === 0;
  el.dupPill.textContent = dupCount;

  if (!state.dupSets.length) {
    el.dupSummary.textContent = '';
    el.dupList.append(emptyState('No duplicates', 'Every open tab points somewhere different. Nice.'));
    updateFooter();
    return;
  }

  el.dupSummary.textContent =
    `${dupCount} redundant tab${dupCount === 1 ? '' : 's'} across ${state.dupSets.length} address${state.dupSets.length === 1 ? '' : 'es'}. One tab per address is kept.`;

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

function render() {
  renderGroups();
  renderDuplicates();
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
  const selected = state.groups.filter((g) => state.selectedGroups.has(g.key));
  let grouped = 0;

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
        const [existing] = await chrome.tabGroups.query({ windowId, title: group.name });
        const groupId = existing
          ? await chrome.tabs.group({ tabIds, groupId: existing.id })
          : await chrome.tabs.group({ tabIds, createProperties: { windowId } });
        await chrome.tabGroups.update(groupId, { title: group.name, color: group.color });
        grouped += tabIds.length;
      } catch (err) {
        console.error('Failed to group', group.name, err);
      }
    }
  }

  await refresh();
  say(grouped ? `Grouped ${grouped} tabs.` : 'Nothing was grouped.');
}

async function closeDuplicates() {
  const ids = [...state.selectedDupTabs];
  if (!ids.length) return;

  const urlById = new Map();
  state.dupSets.forEach((s) => s.duplicates.forEach((t) => urlById.set(t.id, t.url)));
  state.lastClosed = ids.map((id) => urlById.get(id)).filter(Boolean);

  await chrome.tabs.remove(ids);
  chrome.runtime.sendMessage({ type: 'refreshBadge' }).catch(() => {});
  await refresh();
  say(`Closed ${ids.length} duplicate${ids.length === 1 ? '' : 's'}.`);
}

async function reopenClosed() {
  const urls = state.lastClosed;
  state.lastClosed = [];
  for (const url of urls) await chrome.tabs.create({ url, active: false });
  await refresh();
  say(`Reopened ${urls.length} tab${urls.length === 1 ? '' : 's'}.`);
}

/* ---------- wiring ---------- */

el.tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.panel = btn.dataset.panel;
    el.tabBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
    Object.entries(el.panels).forEach(([name, panel]) => panel.classList.toggle('is-active', name === state.panel));
    el.footerMsg.textContent = '';
    updateFooter();
  });
});

el.scopeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    state.scope = input.value;
    refresh();
  });
});

el.applyBtn.addEventListener('click', applyGroups);
el.closeDupBtn.addEventListener('click', closeDuplicates);
el.undoBtn.addEventListener('click', reopenClosed);

refresh();
