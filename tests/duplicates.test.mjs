import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicates } from '../lib/analyze.js';
import { isReadable } from '../lib/tabs.js';
import * as F from './helpers.mjs';

test('regression: blank New Tab pages are not duplicates', () => {
  assert.equal(findDuplicates([F.tab('chrome://newtab/', 'New Tab'), F.tab('chrome://newtab/', 'New Tab')]).length, 0);
});

test('the same page at different-looking addresses is a duplicate', () => {
  const t = [F.tab('https://github.com/x/y', 'a'), F.tab('http://www.github.com/x/y/?utm_source=n#readme', 'b')];
  assert.equal(findDuplicates(t).length, 1);
});

test('which tabs can be read', () => {
  assert.equal(isReadable({ url: 'https://a.com', status: 'complete' }), true);
  assert.equal(isReadable({ url: 'https://a.com', discarded: true }), false);
  assert.equal(isReadable({ url: 'https://a.com', status: 'unloaded' }), false);
  assert.equal(isReadable({ url: 'chrome://newtab' }), false);
  assert.equal(isReadable({ url: 'https://chromewebstore.google.com/detail/x' }), false);
});
