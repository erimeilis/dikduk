import { createWorker, type Worker } from 'tesseract.js';

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
        console.error('[pealim] OCR failed:', e);
        sendResponse({
          type: 'ocr-failed',
          message: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        });
      }
    })();

    return true; // keep the message channel open for the async sendResponse
  },
);
