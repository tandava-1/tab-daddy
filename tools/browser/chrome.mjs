// Shared launcher: finds Chrome for Testing under .chrome/ and starts it.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const here = path.dirname(new URL(import.meta.url).pathname);
export const REPO = path.resolve(here, '../..');

export function chromePath() {
  const base = path.join(here, '.chrome/chrome');
  const build = fs.readdirSync(base).sort().pop();
  return path.join(base, build, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
}

export function launch({ profile, extensions = false, headless = true } = {}) {
  return puppeteer.launch({
    executablePath: chromePath(), headless, enableExtensions: extensions,
    userDataDir: profile, args: ['--no-first-run', '--window-size=1280,800']
  });
}
