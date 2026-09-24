import { containsHebrew } from '../shared/hebrew';
import {
  type Editable,
  currentText,
  normalizeEditable,
} from './editable-locator';

const DEBOUNCE_MS = 500;

export interface EngagementHandlers {
  // Called when a field has no checkable text (cleared immediately).
  clear(field: Editable): void;
  // Called after the debounce with a field that has Hebrew text to check.
  run(field: Editable, text: string, isTextField: boolean): void;
}

// Owns the input/focus listeners and the scan debounce. Delegates the actual
// check + clear work to the supplied handlers.
export class Engagement {
  private timer: number | undefined;

  constructor(private readonly handlers: EngagementHandlers) {}

  start(): void {
    document.addEventListener('input', this.onInput, true);
    document.addEventListener('focusin', this.onFocusIn, true);
  }

  stop(): void {
    document.removeEventListener('input', this.onInput, true);
    document.removeEventListener('focusin', this.onFocusIn, true);
  }

  // Scan a field's current text (used on both typing and focus, so pre-existing
  // text is checked, not only newly-typed characters).
  scan(el: Editable): void {
    const field = normalizeEditable(el);
    if (!field) return;
    const isTextField = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement;
    const text = currentText(field, isTextField);
    if (text === null || !containsHebrew(text)) {
      this.handlers.clear(field);
      return;
    }
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.handlers.run(field, text, isTextField), DEBOUNCE_MS);
  }

  private onInput = (e: Event): void => {
    const field = normalizeEditable(e.target as Editable | null);
    if (field) {
      this.handlers.clear(field);
      this.scan(field);
    }
  };

  private onFocusIn = (e: Event): void => {
    const el = e.target as Editable | null;
    if (el) this.scan(el);
  };
}
