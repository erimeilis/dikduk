import { WORKER_URL } from './config';
import { cacheKeyFor } from './cache-key';
import type { LookupResponse, LookupMessage } from './types';
import { containsHebrew, extractWord } from './hebrew';

async function fetchLookup(word: string): Promise<LookupResponse> {
  const key = cacheKeyFor(word);

  try {
    const cached = await chrome.storage.local.get(key);
    if (cached[key]) return cached[key] as LookupResponse;
  } catch (e) {
    console.error('[pealim] storage read failed:', e);
  }

  try {
    const res = await fetch(`${WORKER_URL}/lookup?q=${encodeURIComponent(word)}`);
    const data = (await res.json()) as LookupResponse;
    if (!('code' in data)) {
      try {
        await chrome.storage.local.set({ [key]: data });
      } catch (e) {
        console.error('[pealim] storage write failed:', e);
      }
    }
    return data;
  } catch (e) {
    console.error('[pealim] worker fetch failed:', e);
    return { error: `Lookup failed: ${(e as Error).message}`, code: 'UPSTREAM' };
  }
}

chrome.runtime.onMessage.addListener((msg: LookupMessage, _sender, sendResponse) => {
  if (msg?.type !== 'lookup') return false;
  fetchLookup(msg.word).then(sendResponse);
  return true; // keep the message channel open for the async response
});

const MENU_ID = 'pealim-lookup';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Look up "%s" in Pealim',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const word = extractWord(info.selectionText ?? '');
  const data = !word || !containsHebrew(word)
    ? { error: 'Select a Hebrew word to look up.', code: 'NO_RESULTS' as const }
    : await fetchLookup(word);
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'render', data });
  } catch (e) {
    console.error('[pealim] could not deliver lookup result to tab:', e);
  }
});
