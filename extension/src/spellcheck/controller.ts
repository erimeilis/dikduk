import { tokenizeHebrew, shouldSkip, stripDiacritics, type Token } from './normalize';
import { loadUserDict, isEnabled } from './userdict';
import type {
  GrammarAnalyzeRequest,
  GrammarResult,
  GrammarIssue,
  SpellCheckRequest,
  SpellSuggestRequest,
  SpellResult,
} from './protocol';
import { OverlayRenderer, type OverlayRange } from './render-overlay';
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

export interface SpellFlagHit {
  field: Editable;
  word: string;
  start: number;
  end: number;
  rect: DOMRect;
  range?: Range;
  isTextField: boolean;
}

export interface GrammarFlagHit {
  field: Editable;
  issue: GrammarIssue;
  rect: DOMRect;
  range?: Range;
  isTextField: boolean;
}

export class SpellController {
  private enabled = false;
  private userDict = new Set<string>();
  private ignore = new Set<string>();
  private overlays = new WeakMap<HTMLElement, OverlayRenderer>();
  private flags = new WeakMap<HTMLElement, Token[]>();
  private grammarFlags = new WeakMap<HTMLElement, GrammarIssue[]>();
  private timer: number | undefined;

  async start(): Promise<void> {
    const en = await isEnabled();
    if (!en) return;
    this.enabled = true;
    this.userDict = await loadUserDict();
    document.addEventListener('input', this.onInput, true);
    document.addEventListener('focusin', this.onFocusIn, true);
    document.addEventListener('focusout', this.onFocusOut, true);
  }

  stop(): void {
    this.enabled = false;
    document.removeEventListener('input', this.onInput, true);
    document.removeEventListener('focusin', this.onFocusIn, true);
    document.removeEventListener('focusout', this.onFocusOut, true);
  }

  // The engine lives in the offscreen document; the background relays the request.
  private async check(tokens: string[]): Promise<string[]> {
    try {
      const res = (await chrome.runtime.sendMessage({
        type: 'spell-check',
        tokens,
      } satisfies SpellCheckRequest)) as SpellResult | undefined;
      return res && 'misspelled' in res ? res.misspelled : [];
    } catch (e) {
      console.error('[dikduk] spell check failed:', e);
      return [];
    }
  }

  private async analyzeGrammar(text: string): Promise<GrammarIssue[]> {
    try {
      const res = (await chrome.runtime.sendMessage({
        type: 'grammar-analyze',
        text,
      } satisfies GrammarAnalyzeRequest)) as GrammarResult | undefined;
      return res && 'issues' in res ? res.issues.filter((issue) => isValidIssue(issue, text.length)) : [];
    } catch (e) {
      console.error('[dikduk] grammar analyze failed:', e);
      return [];
    }
  }

  async suggest(word: string): Promise<string[]> {
    try {
      const res = (await chrome.runtime.sendMessage({
        type: 'spell-suggest',
        word: stripDiacritics(word),
      } satisfies SpellSuggestRequest)) as SpellResult | undefined;
      return res && 'suggestions' in res ? res.suggestions : [];
    } catch (e) {
      console.error('[dikduk] spell suggest failed:', e);
      return [];
    }
  }

  ignoreWord(word: string): void {
    this.ignore.add(stripDiacritics(word));
  }

  rememberUserWord(word: string): void {
    this.userDict.add(stripDiacritics(word));
  }

  rescan(el: Editable): void {
    this.scan(el);
  }

  findFlagAtClick(e: MouseEvent): SpellFlagHit | null {
    const target = e.target as HTMLElement | null;
    if (!target) return null;

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return this.findTextFieldHit(target, e);
    }

    const host = findContentEditableHost(target);
    return host ? this.findContentEditableHit(host, e) : null;
  }

  findGrammarAtClick(e: MouseEvent): GrammarFlagHit | null {
    const target = e.target as HTMLElement | null;
    if (!target) return null;

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return this.findTextFieldGrammarHit(target, e);
    }

    const host = findContentEditableHost(target);
    return host ? this.findContentEditableGrammarHit(host, e) : null;
  }

  // Scan a field's current text (used on both typing and focus, so pre-existing
  // text is checked, not only newly-typed characters).
  private scan(el: Editable): void {
    if (!this.enabled) return;
    const field = normalizeEditable(el);
    if (!field) return;
    const isTextField = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement;
    const text = isTextField
      ? field.value
      : field instanceof HTMLElement && isContentEditable(field)
        ? field.textContent
        : null;
    if (text === null || !containsHebrew(text)) {
      this.clear(field);
      return;
    }
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(field, text, isTextField), DEBOUNCE_MS);
  }

  private onInput = (e: Event): void => {
    const el = e.target as Editable | null;
    const field = normalizeEditable(el);
    if (field) {
      this.clear(field);
      this.scan(field);
    }
  };

  private onFocusIn = (e: Event): void => {
    const el = e.target as Editable | null;
    if (el) this.scan(el);
  };

  private onFocusOut = (e: Event): void => {
    const el = normalizeEditable(e.target as Editable | null);
    if (el && this.overlays.has(el)) this.overlays.get(el)!.clear();
  };

  private async run(el: Editable, text: string, isTextField: boolean): Promise<void> {
    const { tokens, norms } = computeCandidates(text, this.userDict, this.ignore);
    const [misspelledWords, grammarIssues] = await Promise.all([
      norms.length ? this.check(norms) : Promise.resolve([]),
      shouldAnalyzeGrammar(text) ? this.analyzeGrammar(text) : Promise.resolve([]),
    ]);
    if (currentText(el, isTextField) !== text) return;
    const misspelled = new Set(misspelledWords);
    const flagged = tokens.filter((t) => misspelled.has(stripDiacritics(t.text)));
    const visibleGrammarIssues = grammarIssues.filter((issue) =>
      !flagged.some((token) => rangesOverlap(issue, token)),
    );
    this.flags.set(el as HTMLElement, flagged);
    this.grammarFlags.set(el as HTMLElement, visibleGrammarIssues);
    const grammarRanges = visibleGrammarIssues.map(issueToRange);

    if (isTextField) {
      const field = el as HTMLInputElement | HTMLTextAreaElement;
      let ov = this.overlays.get(field);
      if (!ov) {
        ov = new OverlayRenderer(field);
        this.overlays.set(field, ov);
      }
      ov.mark([...flagged.map(tokenToRange), ...grammarRanges]);
    } else {
      window.dispatchEvent(
        new CustomEvent('dikduk-spell-flags', {
          detail: {
            offsets: flagged.map((t) => ({ start: t.start, end: t.end })),
            grammarOffsets: grammarRanges.map((t) => ({ start: t.start, end: t.end })),
          },
        }),
      );
    }
  }

  private clear(el: Editable): void {
    this.flags.delete(el as HTMLElement);
    this.grammarFlags.delete(el as HTMLElement);
    const overlay = this.overlays.get(el as HTMLElement);
    if (overlay) overlay.clear();
  }

  private findTextFieldHit(
    field: HTMLInputElement | HTMLTextAreaElement,
    e: MouseEvent,
  ): SpellFlagHit | null {
    const token = findTokenAtOffset(this.flags.get(field) ?? [], field.selectionStart ?? -1);
    if (!token) return null;
    return {
      field,
      word: token.text,
      start: token.start,
      end: token.end,
      rect: pointRect(e, field),
      isTextField: true,
    };
  }

  private findContentEditableHit(host: HTMLElement, e: MouseEvent): SpellFlagHit | null {
    const offset = offsetFromPoint(host, e.clientX, e.clientY) ?? offsetFromSelection(host);
    if (offset === null) return null;

    const token = findTokenAtOffset(this.flags.get(host) ?? [], offset);
    if (!token) return null;

    const range = rangeFromOffsets(host, token.start, token.end) ?? undefined;
    return {
      field: host,
      word: token.text,
      start: token.start,
      end: token.end,
      rect: range ? range.getBoundingClientRect() : pointRect(e, host),
      range,
      isTextField: false,
    };
  }

  private findTextFieldGrammarHit(
    field: HTMLInputElement | HTMLTextAreaElement,
    e: MouseEvent,
  ): GrammarFlagHit | null {
    const issue = findRangeAtOffset(this.grammarFlags.get(field) ?? [], field.selectionStart ?? -1);
    if (!issue) return null;
    return {
      field,
      issue,
      rect: pointRect(e, field),
      isTextField: true,
    };
  }

  private findContentEditableGrammarHit(host: HTMLElement, e: MouseEvent): GrammarFlagHit | null {
    const offset = offsetFromPoint(host, e.clientX, e.clientY) ?? offsetFromSelection(host);
    if (offset === null) return null;

    const issue = findRangeAtOffset(this.grammarFlags.get(host) ?? [], offset);
    if (!issue) return null;

    const range = rangeFromOffsets(host, issue.start, issue.end) ?? undefined;
    return {
      field: host,
      issue,
      rect: range ? range.getBoundingClientRect() : pointRect(e, host),
      range,
      isTextField: false,
    };
  }
}

function normalizeEditable(el: Editable | null): Editable | null {
  if (!el) return null;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
  return findContentEditableHost(el);
}

function findContentEditableHost(el: HTMLElement): HTMLElement | null {
  if (isContentEditable(el)) return el;
  return el.closest('[contenteditable]') as HTMLElement | null;
}

function isContentEditable(el: HTMLElement): boolean {
  const attr = el.getAttribute('contenteditable');
  return el.isContentEditable || attr === '' || attr === 'true';
}

function currentText(el: Editable, isTextField: boolean): string | null {
  return isTextField
    ? (el as HTMLInputElement | HTMLTextAreaElement).value
    : el instanceof HTMLElement && isContentEditable(el)
      ? el.textContent
      : null;
}

function findTokenAtOffset<T extends Token>(tokens: T[], offset: number): T | null {
  return tokens.find((token) => offset >= token.start && offset <= token.end) ?? null;
}

function findRangeAtOffset<T extends { start: number; end: number }>(ranges: T[], offset: number): T | null {
  return ranges.find((range) => offset >= range.start && offset <= range.end) ?? null;
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function tokenToRange(token: Token): OverlayRange {
  return { start: token.start, end: token.end, kind: 'spell' };
}

function issueToRange(issue: GrammarIssue): OverlayRange {
  return { start: issue.start, end: issue.end, kind: 'grammar' };
}

function isValidIssue(issue: GrammarIssue, textLength: number): boolean {
  return Number.isInteger(issue.start)
    && Number.isInteger(issue.end)
    && issue.start >= 0
    && issue.end > issue.start
    && issue.end <= textLength;
}

function shouldAnalyzeGrammar(text: string): boolean {
  const tokens = tokenizeHebrew(text).filter((token) => !shouldSkip(token.text));
  return tokens.length >= 2;
}

function pointRect(e: MouseEvent, fallback: HTMLElement): DOMRect {
  if (e.clientX || e.clientY) return new DOMRect(e.clientX, e.clientY, 0, 0);
  return fallback.getBoundingClientRect();
}

function offsetFromPoint(host: HTMLElement, x: number, y: number): number | null {
  const doc = host.ownerDocument;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position && host.contains(position.offsetNode)) {
    return textOffsetWithin(host, position.offsetNode, position.offset);
  }

  const range = doc.caretRangeFromPoint?.(x, y);
  if (range && host.contains(range.startContainer)) {
    return textOffsetWithin(host, range.startContainer, range.startOffset);
  }

  return null;
}

function offsetFromSelection(host: HTMLElement): number | null {
  const selection = host.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!host.contains(range.startContainer)) return null;
  return textOffsetWithin(host, range.startContainer, range.startOffset);
}

function textOffsetWithin(host: HTMLElement, node: Node, offset: number): number | null {
  try {
    const range = host.ownerDocument.createRange();
    range.setStart(host, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

function rangeFromOffsets(host: HTMLElement, start: number, end: number): Range | null {
  const a = locateTextOffset(host, start);
  const b = locateTextOffset(host, end);
  if (!a || !b) return null;

  const range = host.ownerDocument.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

function locateTextOffset(host: HTMLElement, offset: number): { node: Text; offset: number } | null {
  const walker = host.ownerDocument.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode() as Text | null;

  while (node) {
    const length = node.data.length;
    if (offset <= seen + length) return { node, offset: offset - seen };
    seen += length;
    node = walker.nextNode() as Text | null;
  }

  return null;
}
