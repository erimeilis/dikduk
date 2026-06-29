import { ANALYZE_WORKER_URLS, WORKER_URL } from './config';
import { cacheKeyFor } from './cache-key';
import type { LookupResponse, LookupMessage, RenderMessage } from './types';
import { containsHebrew, extractWord, extractHebrewWords } from './hebrew';
import type {
  GrammarAnalyzeRequest,
  GrammarResult,
  SpellCheckRequest,
  SpellSuggestRequest,
  SpellResult,
} from './spellcheck/protocol';

async function fetchLookup(word: string): Promise<LookupResponse> {
  const key = cacheKeyFor(word);

  try {
    const cached = await chrome.storage.local.get(key);
    if (cached[key]) return cached[key] as LookupResponse;
  } catch (e) {
    console.error('[dikduk] storage read failed:', e);
  }

  try {
    const res = await fetch(`${WORKER_URL}/lookup?q=${encodeURIComponent(word)}`);
    const data = (await res.json()) as LookupResponse;
    if (!('code' in data)) {
      try {
        await chrome.storage.local.set({ [key]: data });
      } catch (e) {
        console.error('[dikduk] storage write failed:', e);
      }
    }
    return data;
  } catch (e) {
    console.error('[dikduk] worker fetch failed:', e);
    return { error: `Lookup failed: ${(e as Error).message}`, code: 'UPSTREAM' };
  }
}

async function fetchGrammar(text: string): Promise<GrammarResult> {
  let lastError = 'Analyzer failed';
  for (const baseUrl of ANALYZE_WORKER_URLS) {
    try {
      const res = await fetch(`${baseUrl}/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as GrammarResult & { code?: string };
      if (res.ok && 'issues' in data) return { issues: data.issues };
      lastError = 'error' in data ? data.error : `Analyzer returned ${res.status}`;
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  return { error: lastError };
}

chrome.runtime.onMessage.addListener((msg: LookupMessage, _sender, sendResponse) => {
  if (msg?.type !== 'lookup') return false;
  fetchLookup(msg.word).then(sendResponse);
  return true; // keep the message channel open for the async response
});

chrome.runtime.onMessage.addListener((msg: GrammarAnalyzeRequest | { type?: string }, _sender, sendResponse) => {
  if (msg?.type !== 'grammar-analyze') return false;
  fetchGrammar((msg as GrammarAnalyzeRequest).text).then(sendResponse);
  return true; // keep the message channel open for the async response
});

const MENU_ID = 'dikduk-lookup';
const IMAGE_MENU_ID = 'dikduk-ocr-image';

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

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS' as chrome.offscreen.Reason],
    justification: 'Run Tesseract.js OCR on an image off the main thread.',
  });
}

// chrome.runtime.sendMessage serializes as JSON, so an ArrayBuffer does NOT survive
// the hop to the offscreen document (it arrives as {}). Send the image as a base64
// data: URL string instead — JSON-safe, and Tesseract.recognize() decodes it natively.
function bytesToDataUrl(buffer: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000; // avoid call-stack overflow from spreading a large array
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const baseMime = (mime.split(';')[0] || 'image/png').trim();
  return `data:${baseMime};base64,${btoa(binary)}`;
}

async function sendToOffscreen(dataUrl: string): Promise<{ type: string; text?: string; message?: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await chrome.runtime.sendMessage({ type: 'ocr-image', dataUrl });
    } catch (e) {
      lastErr = e; // offscreen listener not ready yet — brief backoff then retry
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw lastErr;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== IMAGE_MENU_ID || !tab?.id || !info.srcUrl) return;
  const tabId = tab.id;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'ocr-loading' });

    let buffer: ArrayBuffer;
    let mime: string;
    try {
      const resp = await fetch(info.srcUrl);
      if (!resp.ok) throw new Error(`image fetch returned ${resp.status}`);
      buffer = await resp.arrayBuffer();
      mime = resp.headers.get('content-type') || 'image/png';
    } catch (e) {
      console.error('[dikduk] image fetch failed:', e);
      await chrome.tabs.sendMessage(tabId, { type: 'ocr-error', message: "Couldn't load that image." });
      return;
    }

    await ensureOffscreen();
    const res = await sendToOffscreen(bytesToDataUrl(buffer, mime));
    if (res?.type === 'ocr-result') {
      const words = extractHebrewWords(res.text ?? '');
      await chrome.tabs.sendMessage(tabId, { type: 'ocr-words', words });
    } else {
      console.error('[dikduk] OCR failed in offscreen:', res?.message);
      await chrome.tabs.sendMessage(tabId, { type: 'ocr-error', message: "Couldn't read the image." });
    }
  } catch (e) {
    console.error('[dikduk] OCR orchestration failed:', e);
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'ocr-error', message: "Couldn't read the image." });
    } catch (e2) {
      console.error('[dikduk] could not notify tab of OCR error:', e2);
    }
  }
});

// Spell engine lives in the offscreen document (content scripts can't construct a
// cross-origin Worker). Relay the content script's request through it.
async function forwardToOffscreen(osMsg: object): Promise<SpellResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return (await chrome.runtime.sendMessage(osMsg)) as SpellResult;
    } catch (e) {
      lastErr = e; // offscreen listener not ready yet — brief backoff then retry
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw lastErr;
}

chrome.runtime.onMessage.addListener(
  (msg: SpellCheckRequest | SpellSuggestRequest | { type?: string }, _sender, sendResponse) => {
    if (msg?.type !== 'spell-check' && msg?.type !== 'spell-suggest') return false;
    void (async () => {
      try {
        await ensureOffscreen();
        const osMsg =
          msg.type === 'spell-check'
            ? { type: 'spell-check-os', tokens: (msg as SpellCheckRequest).tokens }
            : { type: 'spell-suggest-os', word: (msg as SpellSuggestRequest).word };
        sendResponse(await forwardToOffscreen(osMsg));
      } catch (e) {
        console.error('[dikduk] spell relay failed:', e);
        sendResponse({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return true; // keep the channel open for the async sendResponse
  },
);
