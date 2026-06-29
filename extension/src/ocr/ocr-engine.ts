import { createWorker, type Worker } from 'tesseract.js';
import { lazySingleton } from '../shared/lazy-singleton';

// Tesseract worker singleton, created lazily in the offscreen document and shared
// across OCR requests. The os onMessage handler is registered here.
const getWorker = lazySingleton<Worker>(() =>
  createWorker('heb', 1, {
    workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('tesseract/'),
    langPath: chrome.runtime.getURL('tessdata'), // no trailing slash; Tesseract fetches tessdata/heb.traineddata.gz
    // MV3 CSP (script-src 'self', no worker-src/blob:) refuses a blob: Worker URL.
    // Load worker.min.js directly from the chrome-extension:// URL ('self', CSP-clean).
    workerBlobURL: false,
  }),
);

export function registerOcrEngine(): void {
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
}
