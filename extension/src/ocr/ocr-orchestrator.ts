import { extractHebrewWords } from '../shared/hebrew';
import { ensureOffscreen, sendToOffscreen } from '../messaging/offscreen-relay';
import type { OcrResponse } from '../contracts/messages';

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

// Orchestrate OCR for an image URL: notify the tab, fetch the image bytes, run OCR
// in the offscreen document, then deliver the extracted Hebrew words (or an error).
export async function runOcr(srcUrl: string, tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'ocr-loading' });

    let buffer: ArrayBuffer;
    let mime: string;
    try {
      const resp = await fetch(srcUrl);
      if (!resp.ok) throw new Error(`image fetch returned ${resp.status}`);
      buffer = await resp.arrayBuffer();
      mime = resp.headers.get('content-type') || 'image/png';
    } catch (e) {
      console.error('[dikduk] image fetch failed:', e);
      await chrome.tabs.sendMessage(tabId, { type: 'ocr-error', message: "Couldn't load that image." });
      return;
    }

    await ensureOffscreen();
    const res = await sendToOffscreen<OcrResponse>({ type: 'ocr-image', dataUrl: bytesToDataUrl(buffer, mime) });
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
}
