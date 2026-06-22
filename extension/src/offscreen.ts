import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('heb', 1, {
      workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
      corePath: chrome.runtime.getURL('tesseract/'),
      langPath: chrome.runtime.getURL('tessdata'), // no trailing slash; Tesseract fetches tessdata/heb.traineddata.gz
    }).catch((err: unknown) => {
      // Reset so a subsequent message can retry initialisation
      workerPromise = null;
      return Promise.reject(err);
    });
  }
  return workerPromise;
}

chrome.runtime.onMessage.addListener(
  (msg: { type?: string; srcUrl?: string }, _sender, sendResponse) => {
    if (msg?.type !== 'ocr-image' || !msg.srcUrl) return false;
    const srcUrl = msg.srcUrl;

    void (async () => {
      try {
        const worker = await getWorker();
        const { data } = await worker.recognize(srcUrl);
        sendResponse({ type: 'ocr-result', text: data.text ?? '' });
      } catch (e) {
        console.error('[pealim] OCR failed:', e);
        sendResponse({
          type: 'ocr-failed',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    return true; // keep the message channel open for the async sendResponse
  },
);
