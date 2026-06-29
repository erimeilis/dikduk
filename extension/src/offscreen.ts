import { createWorker, type Worker } from 'tesseract.js';
import type { SpellCheckOsRequest, SpellSuggestOsRequest } from './spellcheck/protocol';
import { createDictionaryEngine, type SpellEngine } from './spellcheck/engine';

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('heb', 1, {
      workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
      corePath: chrome.runtime.getURL('tesseract/'),
      langPath: chrome.runtime.getURL('tessdata'), // no trailing slash; Tesseract fetches tessdata/heb.traineddata.gz
      // MV3 CSP (script-src 'self', no worker-src/blob:) refuses a blob: Worker URL.
      // Load worker.min.js directly from the chrome-extension:// URL ('self', CSP-clean).
      workerBlobURL: false,
    }).catch((err: unknown) => {
      // Reset so a subsequent message can retry initialisation
      workerPromise = null;
      return Promise.reject(err);
    });
  }
  return workerPromise;
}

chrome.runtime.onMessage.addListener(
  (msg: { type?: string; dataUrl?: string }, _sender, sendResponse) => {
    if (msg?.type !== 'ocr-image' || !msg.dataUrl) return false;
    const dataUrl = msg.dataUrl;

    void (async () => {
      try {
        const worker = await getWorker();
        const { data } = await worker.recognize(dataUrl);
        sendResponse({ type: 'ocr-result', text: data.text ?? '' });
      } catch (e) {
        console.error('[dikduk] OCR failed:', e);
        sendResponse({
          type: 'ocr-failed',
          message: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        });
      }
    })();

    return true; // keep the message channel open for the async sendResponse
  },
);

// --- Hebrew spell engine (Hspell dictionary) ----------------------------------
// Loaded once in the offscreen document (extension origin), shared across tabs.
let spellPromise: Promise<SpellEngine> | null = null;

function getSpell(): Promise<SpellEngine> {
  if (!spellPromise) {
    spellPromise = (async () => {
      const [aff, dic] = await Promise.all([
        fetch(chrome.runtime.getURL('spelldata/he.aff')).then((r) => r.text()),
        fetch(chrome.runtime.getURL('spelldata/he.dic')).then((r) => r.text()),
      ]);
      return createDictionaryEngine(aff, dic);
    })().catch((err: unknown) => {
      spellPromise = null; // allow a later message to retry initialisation
      throw err;
    });
  }
  return spellPromise;
}

chrome.runtime.onMessage.addListener(
  (msg: SpellCheckOsRequest | SpellSuggestOsRequest | { type?: string }, _sender, sendResponse) => {
    if (msg?.type === 'spell-check-os') {
      const { tokens } = msg as SpellCheckOsRequest;
      getSpell()
        .then((s) => sendResponse({ misspelled: s.check(tokens) }))
        .catch((e: unknown) => {
          console.error('[dikduk] spell check (offscreen) failed:', e);
          sendResponse({ error: e instanceof Error ? e.message : String(e) });
        });
      return true;
    }
    if (msg?.type === 'spell-suggest-os') {
      const { word } = msg as SpellSuggestOsRequest;
      getSpell()
        .then((s) => sendResponse({ suggestions: s.suggest(word).slice(0, 6) }))
        .catch((e: unknown) => {
          console.error('[dikduk] spell suggest (offscreen) failed:', e);
          sendResponse({ error: e instanceof Error ? e.message : String(e) });
        });
      return true;
    }
    return false;
  },
);
