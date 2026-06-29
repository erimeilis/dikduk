import { containsHebrew, extractWord } from '../shared/hebrew';
import { fetchLookup } from '../lookup/lookup-service';
import { runOcr } from '../ocr/ocr-orchestrator';
import type { RenderMessage } from '../contracts/messages';

const MENU_ID = 'dikduk-lookup';
const IMAGE_MENU_ID = 'dikduk-ocr-image';

export function registerMenus(): void {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID,
        title: 'Look up "%s" in Pealim',
        contexts: ['selection'],
      });
      chrome.contextMenus.create({
        id: IMAGE_MENU_ID,
        title: 'Look up Hebrew in this image',
        contexts: ['image'],
      });
    });
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID || !tab?.id) return;
    const word = extractWord(info.selectionText ?? '');
    const data = !word || !containsHebrew(word)
      ? { error: 'Select a Hebrew word to look up.', code: 'NO_RESULTS' as const }
      : await fetchLookup(word);
    // content script may not be injected on this tab (e.g. chrome:// pages)
    try {
      const message: RenderMessage = { type: 'render', data };
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (e) {
      console.error('[dikduk] could not deliver lookup result to tab:', e);
    }
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== IMAGE_MENU_ID || !tab?.id || !info.srcUrl) return;
    await runOcr(info.srcUrl, tab.id);
  });
}
