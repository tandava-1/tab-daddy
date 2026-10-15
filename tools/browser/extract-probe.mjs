// Runs the extension's real page reader (lib/read.js:extractPage) on given
// pages and prints what it extracts. Usage: node extract-probe.mjs <url>...
import fs from 'node:fs';
import { launch, REPO } from './chrome.mjs';

const src = fs.readFileSync(`${REPO}/lib/read.js`, 'utf8');
const fnSrc = src.slice(src.indexOf('export function extractPage')).replace('export ', '');
const out = process.argv.find((a) => a.startsWith('--save='))?.slice(7);
const urls = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const browser = await launch();
const saved = [];
for (const url of urls) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch((e) => console.log('nav failed:', e.message));
  await new Promise((r) => setTimeout(r, 1500));
  const t0 = Date.now();
  const r = await page.evaluate(`(${fnSrc})()`).catch((e) => ({ error: e.message }));
  console.log(`\n## ${url.slice(0, 90)}  (${Date.now() - t0} ms)`);
  console.log(JSON.stringify({ title: r.title, headings: r.headings?.slice(0, 4), clues: r.clues, sensitive: r.sensitive, body: r.body?.slice(0, 240), error: r.error }));
  saved.push({ url: page.url(), ...r });
}
if (out) fs.writeFileSync(out, JSON.stringify(saved, null, 1));
await browser.close();
