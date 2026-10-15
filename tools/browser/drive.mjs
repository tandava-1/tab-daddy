// Loads the real extension in Chrome for Testing, opens real tabs, optionally
// sets up user groups, opens the real popup and reports what it shows.
//
//   node drive.mjs [--granted] [--ai=yes|no] [--apply] [--shot=out.png]
//                  [--groups='[{"title":"Shopping","color":"red","match":["*://*.flipkart.com/*"]}]']
//                  [--urls=a,b,c] [--ext=<dir>]
//
// --granted runs a copy whose manifest makes site access required, because
// Puppeteer can't click Chrome's own permission prompt.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, REPO } from './chrome.mjs';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name) => process.argv.includes(`--${name}`);

const DEFAULT_URLS = [
  'https://www.amazon.in/dp/B0CHX1W1XY', 'https://www.amazon.in/dp/B0DGHYDZR9', 'https://www.flipkart.com/',
  'https://github.com/facebook/react', 'https://stackoverflow.com/questions/111102/how-do-javascript-closures-work',
  'https://react.dev/learn', 'https://react.dev/reference/react/useEffect',
  'https://www.bbc.com/news', 'https://www.theguardian.com/international',
  'https://en.wikipedia.org/wiki/Mortgage', 'https://en.wikipedia.org/wiki/Lisbon',
  'https://en.wikivoyage.org/wiki/Lisbon', 'https://www.nerdwallet.com/mortgages/mortgage-rates'
];

let ext = arg('ext') || REPO;
if (flag('granted')) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdaddy-ext-'));
  for (const f of ['manifest.json', 'background.js', 'popup.html', 'popup.css', 'popup.js']) fs.copyFileSync(path.join(ext, f), path.join(copy, f));
  fs.cpSync(path.join(ext, 'lib'), path.join(copy, 'lib'), { recursive: true });
  fs.cpSync(path.join(ext, 'icons'), path.join(copy, 'icons'), { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(copy, 'manifest.json')));
  m.host_permissions = m.optional_host_permissions; delete m.optional_host_permissions;
  fs.writeFileSync(path.join(copy, 'manifest.json'), JSON.stringify(m));
  ext = copy;
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdaddy-profile-'));
const browser = await launch({ profile, extensions: true });
const id = await browser.installExtension(ext);
const urls = arg('urls')?.split(',') ?? DEFAULT_URLS;

const [first] = await browser.pages();
await first.goto(urls[0], { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
for (const u of urls.slice(1)) {
  const p = await browser.newPage();
  await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch((e) => console.log('nav failed', u, e.message.slice(0, 60)));
}
await new Promise((r) => setTimeout(r, 2000));

const sw = await (await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(id))).worker();
if (arg('groups')) {
  const made = await sw.evaluate(async (spec) => {
    for (const g of spec) {
      const ids = [];
      for (const m of g.match) ids.push(...(await chrome.tabs.query({ url: m })).map((t) => t.id));
      if (!ids.length) continue;
      const gid = await chrome.tabs.group({ tabIds: ids });
      await chrome.tabGroups.update(gid, { title: g.title, color: g.color });
    }
    return (await chrome.tabGroups.query({})).map((g) => `${g.title}/${g.color}`);
  }, JSON.parse(arg('groups')));
  console.log('user groups before:', made.join(', '));
}
if (arg('ai')) await sw.evaluate((v) => chrome.storage.local.set({ aiNaming: v }), arg('ai'));

// The popup as a page in the same window, at 2x for screenshots.
const popup = await browser.newPage();
await popup.setViewport({ width: 400, height: 600, deviceScaleFactor: 2 });
popup.on('pageerror', (e) => console.log('[popup error]', e.message));
popup.on('console', (m) => m.type() === 'error' && console.log('[popup console]', m.text()));
await popup.goto(`chrome-extension://${id}/popup.html`);
await popup.waitForFunction(() => document.querySelectorAll('#groupsList .card, #groupsList .empty').length
  && !/Reading|Naming|Scanning/.test(document.getElementById('groupsSummary').textContent), { timeout: 30000 }).catch(() => console.log('popup did not settle'));

const report = await popup.evaluate(() => ({
  banner: !document.getElementById('accessNote').hidden,
  aiNote: !document.getElementById('aiNote').hidden,
  summary: document.getElementById('groupsSummary').textContent,
  sections: [...document.querySelectorAll('#groupsList h3.section')].map((h) => h.textContent),
  groups: [...document.querySelectorAll('#groupsList .card')].map((c) => ({
    name: c.querySelector('.card-title').textContent,
    count: c.querySelector('.count').textContent,
    checked: c.querySelector('input').checked,
    tabs: [...c.querySelectorAll('.tab-row')].map((r) => r.querySelector('.t').textContent.slice(0, 40) + (r.querySelector('.tag') ? ` [${r.querySelector('.tag').textContent}]` : ''))
  }))
}));
console.log(JSON.stringify(report, null, 1));

if (arg('shot')) {
  await popup.evaluate(() => [...document.querySelectorAll('#groupsList .card')].slice(0, 2).forEach((c) => c.classList.add('is-open')));
  await popup.screenshot({ path: arg('shot') });
}
if (flag('apply')) {
  await popup.click('#applyBtn');
  await new Promise((r) => setTimeout(r, 1500));
  const made = await sw.evaluate(async () => Promise.all((await chrome.tabGroups.query({})).map(async (g) =>
    `${g.title}/${g.color}: ${(await chrome.tabs.query({ groupId: g.id })).length} tabs`)));
  console.log('tab groups in Chrome after applying:', made.join(' | '));
}
await browser.close();
fs.rmSync(profile, { recursive: true, force: true });
