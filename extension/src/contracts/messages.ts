// Lookup, render and OCR messages exchanged between the content script and the
// background service worker / offscreen document.

import type { LookupResponse } from './lookup';

export interface LookupMessage {
  type: 'lookup';
  word: string;
}

export interface RenderMessage {
  type: 'render';
  data: LookupResponse;
}

// Background → offscreen OCR request, and the offscreen → background responses.
export interface OcrImageRequest { type: 'ocr-image'; dataUrl: string }
export interface OcrResultResponse { type: 'ocr-result'; text: string }
export interface OcrFailedResponse { type: 'ocr-failed'; message: string }
export type OcrResponse = OcrResultResponse | OcrFailedResponse;

// Background → content tab OCR status messages.
export interface OcrLoadingMessage { type: 'ocr-loading' }
export interface OcrWordsMessage { type: 'ocr-words'; words: string[] }
export interface OcrErrorMessage { type: 'ocr-error'; message: string }
