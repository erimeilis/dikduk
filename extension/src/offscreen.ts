// Offscreen document entry point. Hosts the Tesseract OCR worker and the Hspell
// spell engine (a content script can't construct those cross-origin Workers).
import { registerOcrEngine } from './ocr/ocr-engine';
import { registerSpellEngineHost } from './spellcheck/engine-host';

registerOcrEngine();
registerSpellEngineHost();
