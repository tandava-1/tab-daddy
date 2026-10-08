import { countDuplicates } from './lib/analyze.js';

let pending = null;

async function refreshBadge() {
  const tabs = await chrome.tabs.query({});
  const count = countDuplicates(tabs);
  await chrome.action.setBadgeBackgroundColor({ color: '#E5484D' });
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  await chrome.action.setTitle({
    title: count > 0
      ? `Tab Daddy — ${count} duplicate tab${count === 1 ? '' : 's'} open`
      : 'Tab Daddy'
  });
}

// Tab events fire in bursts (a window closing, a session restoring), so coalesce.
function scheduleRefresh() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    refreshBadge().catch(() => {});
  }, 400);
}

chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') scheduleRefresh();
});
chrome.tabs.onRemoved.addListener(scheduleRefresh);
chrome.tabs.onCreated.addListener(scheduleRefresh);
chrome.tabs.onReplaced.addListener(scheduleRefresh);
chrome.runtime.onStartup.addListener(scheduleRefresh);
chrome.runtime.onInstalled.addListener(scheduleRefresh);

// The service worker can be revived by a message from the popup after a close.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'refreshBadge') {
    refreshBadge().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

scheduleRefresh();
