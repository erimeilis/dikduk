import { tokenizeHebrew, shouldSkip, stripDiacritics, type Token } from './normalize';
import { loadUserDict, isEnabled } from './userdict';
import type { ToWorker, FromWorker } from './protocol';
import { OverlayRenderer } from './render-overlay';
import { containsHebrew } from '../hebrew';

export function computeCandidates(
  text: string,
  userDict: Set<string>,
  ignore: Set<string>,
): { tokens: Token[]; norms: string[] } {
  const tokens: Token[] = [];
  const norms: string[] = [];
  const seen = new Set<string>();
  for (const t of tokenizeHebrew(text)) {
    if (shouldSkip(t.text)) continue;
    const norm = stripDiacritics(t.text);
    if (userDict.has(norm) || ignore.has(norm)) continue;
    tokens.push(t);
    if (!seen.has(norm)) {
      seen.add(norm);
      norms.push(norm);
    }
  }
  return { tokens, norms };
}

const DEBOUNCE_MS = 500;
type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export class SpellController {
  private worker: Worker | null = null;
  private ready = false;
  private userDict = new Set<string>();
  private ignore = new Set<string>();
  private reqId = 0;
  private overlays = new WeakMap<HTMLElement, OverlayRenderer>();
  private timer: number | undefined;
  private pending = new Map<number, (m: FromWorker) => void>();

  async start(): Promise<void> {
    if (!(await isEnabled())) return;
    this.userDict = await loadUserDict();
    this.worker = new Worker(new URL('./engine-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onWorker(e.data);
    this.worker.onerror = (e) => console.error('[pealim] spell worker error:', e.message);
    this.post({
      type: 'init',
      affUrl: chrome.runtime.getURL('spelldata/he.aff'),
      dicUrl: chrome.runtime.getURL('spelldata/he.dic'),
    });
    document.addEventListener('input', this.onInput, true);
    document.addEventListener('focusout', this.onFocusOut, true);
  }

  stop(): void {
    document.removeEventListener('input', this.onInput, true);
    document.removeEventListener('focusout', this.onFocusOut, true);
    this.worker?.terminate();
    this.worker = null;
  }

  private post(msg: ToWorker): void {
    this.worker?.postMessage(msg);
  }

  private onWorker(m: FromWorker): void {
    if (m.type === 'ready') { this.ready = true; return; }
    if (m.type === 'error') { console.error('[pealim] spell engine:', m.message); return; }
    const cb = this.pending.get(m.id);
    if (cb) { this.pending.delete(m.id); cb(m); }
  }

  private check(tokens: string[]): Promise<string[]> {
    return new Promise((resolve) => {
      const id = ++this.reqId;
      const timer = window.setTimeout(() => {
        if (this.pending.delete(id)) {
          console.warn('[pealim] spell check timed out; skipping this pass');
          resolve([]);
        }
      }, 5000);
      this.pending.set(id, (m) => {
        window.clearTimeout(timer);
        resolve(m.type === 'checked' ? m.misspelled : []);
      });
      this.post({ type: 'check', id, tokens });
    });
  }

  private onInput = (e: Event): void => {
    const el = e.target as Editable | null;
    if (!el || !this.ready) return;
    const isTextField = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    const text = isTextField ? el.value : (el as HTMLElement).isContentEditable ? (el as HTMLElement).innerText : null;
    if (text === null || !containsHebrew(text)) return; // engage only on Hebrew
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(el, text, isTextField), DEBOUNCE_MS);
  };

  private onFocusOut = (e: Event): void => {
    const el = e.target as HTMLElement | null;
    if (el && this.overlays.has(el)) this.overlays.get(el)!.clear();
  };

  private async run(el: Editable, text: string, isTextField: boolean): Promise<void> {
    const { tokens, norms } = computeCandidates(text, this.userDict, this.ignore);
    const misspelled = norms.length ? new Set(await this.check(norms)) : new Set<string>();
    const flagged = tokens.filter((t) => misspelled.has(stripDiacritics(t.text)));

    if (isTextField) {
      const field = el as HTMLInputElement | HTMLTextAreaElement;
      let ov = this.overlays.get(field);
      if (!ov) { ov = new OverlayRenderer(field); this.overlays.set(field, ov); }
      ov.mark(flagged);
    } else {
      window.dispatchEvent(
        new CustomEvent('pealim-spell-flags', {
          detail: { offsets: flagged.map((t) => ({ start: t.start, end: t.end })) },
        }),
      );
    }
  }
}
