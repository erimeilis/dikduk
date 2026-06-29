import { tokenizeHebrew, shouldSkip, stripDiacritics, type Token } from '../shared/hebrew';
import type { GrammarIssue } from '../contracts/grammar';
import { OverlayRenderer } from './overlay-renderer';
import {
  type Editable,
  findContentEditableHost,
  offsetForEvent,
  pointRect,
  rangeFromOffsets,
} from './editable-locator';

// Anything carrying a character span: a misspelled Token or a GrammarIssue.
export interface OffsetItem {
  start: number;
  end: number;
}

// Where a flagged item was hit: the resolved item plus the geometry needed to
// anchor a popup and (for contenteditable) replace the text.
export interface FlagHit<T extends OffsetItem> {
  field: Editable;
  item: T;
  rect: DOMRect;
  range?: Range;
  isTextField: boolean;
}

// Compute the misspell-check candidates for a piece of text: the tokens worth
// flagging and the unique normalized forms to send to the engine.
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

// Owns the per-field state: the overlay renderers and the current spell + grammar
// flags. A single generic hit-test handles both spell tokens and grammar issues.
export class FlagStore {
  private overlays = new WeakMap<HTMLElement, OverlayRenderer>();
  private spellFlags = new WeakMap<HTMLElement, Token[]>();
  private grammarFlags = new WeakMap<HTMLElement, GrammarIssue[]>();

  setSpellFlags(el: HTMLElement, tokens: Token[]): void {
    this.spellFlags.set(el, tokens);
  }

  setGrammarFlags(el: HTMLElement, issues: GrammarIssue[]): void {
    this.grammarFlags.set(el, issues);
  }

  overlayFor(field: HTMLInputElement | HTMLTextAreaElement): OverlayRenderer {
    let ov = this.overlays.get(field);
    if (!ov) {
      ov = new OverlayRenderer(field);
      this.overlays.set(field, ov);
    }
    return ov;
  }

  clearOverlay(el: HTMLElement): void {
    this.overlays.get(el)?.clear();
  }

  clear(el: HTMLElement): void {
    this.spellFlags.delete(el);
    this.grammarFlags.delete(el);
    this.overlays.get(el)?.clear();
  }

  findSpellHit(e: MouseEvent): FlagHit<Token> | null {
    return this.findHitAtClick(this.spellFlags, e);
  }

  findGrammarHit(e: MouseEvent): FlagHit<GrammarIssue> | null {
    return this.findHitAtClick(this.grammarFlags, e);
  }

  // Generic hit-test: dispatch by target kind, resolve the click to a character
  // offset, and find the stored item whose span contains it.
  private findHitAtClick<T extends OffsetItem>(
    store: WeakMap<HTMLElement, T[]>,
    e: MouseEvent,
  ): FlagHit<T> | null {
    const target = e.target as HTMLElement | null;
    if (!target) return null;

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const item = findItemAtOffset(store.get(target) ?? [], target.selectionStart ?? -1);
      if (!item) return null;
      return { field: target, item, rect: pointRect(e, target), isTextField: true };
    }

    const host = findContentEditableHost(target);
    if (!host) return null;

    const offset = offsetForEvent(host, e);
    if (offset === null) return null;

    const item = findItemAtOffset(store.get(host) ?? [], offset);
    if (!item) return null;

    const range = rangeFromOffsets(host, item.start, item.end) ?? undefined;
    return {
      field: host,
      item,
      rect: range ? range.getBoundingClientRect() : pointRect(e, host),
      range,
      isTextField: false,
    };
  }
}

function findItemAtOffset<T extends OffsetItem>(items: T[], offset: number): T | null {
  return items.find((item) => offset >= item.start && offset <= item.end) ?? null;
}
