// Background-side relay to the offscreen document. The offscreen document hosts
// the Tesseract OCR worker and the Hspell engine (a content script can't construct
// those cross-origin), so OCR + spell requests are forwarded here.

export async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS' as chrome.offscreen.Reason],
    justification: 'Run Tesseract.js OCR on an image off the main thread.',
  });
}

// Send a message to the offscreen document, retrying briefly because the offscreen
// listener may not be ready immediately after the document is created.
export async function sendToOffscreen<T>(msg: object, { retries = 3 } = {}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return (await chrome.runtime.sendMessage(msg)) as T;
    } catch (e) {
      lastErr = e; // offscreen listener not ready yet — brief backoff then retry
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw lastErr;
}
