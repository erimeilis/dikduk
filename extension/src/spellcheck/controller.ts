import { stripDiacritics, tokenizeHebrew, shouldSkip, type Token } from '../shared/hebrew';
import { loadUserDict, isEnabled } from './userdict';
import type { GrammarIssue } from '../contracts/grammar';
import { type OverlayRange } from './overlay-renderer';
import { computeCandidates, FlagStore } from './flag-store';
import { Engagement } from './engagement';
import { SpellTransport, type Messenger, type GrammarAnalysis } from './transport';
import { type Editable, currentText } from './editable-locator';
import { FIELD_ID_ATTR, type SpellFlagsDetail } from '../shared/dom-offsets';

// Re-exported so existing importers (and tests) keep their entry point.
export { computeCandidates };

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

// Thin coordinator: wires the engagement listeners, the transport to the
// background worker, and the per-field flag store. Holds no DOM-walking or
// messaging logic itself.
export class SpellController {
  private enabled = false;
  private userDict = new Set<string>();
  private ignore = new Set<string>();
  private readonly store = new FlagStore();
  // Latest raw grammar issues per field, before overlap suppression. Held here
  // (not in FlagStore, which keeps the visible set) so `paint` can re-derive the
  // visible grammar set whenever the spell flags change, regardless of the order
  // the two decoupled flows finish in. Keyed by the text the issues were computed
  // for, so a re-scan of unchanged text (e.g. refocus) keeps showing them while
  // the new grammar request is in flight, and stale text never uses them.
  private readonly grammarByField = new WeakMap<HTMLElement, { text: string; issues: GrammarIssue[] }>();
  // Per-field scan generation. Text equality alone can't order two scans of the
  // same text (refocus, or the rescan after Ignore / Add to dictionary), so each
  // flow only applies results from the field's latest scan.
  private readonly scanGen = new WeakMap<HTMLElement, number>();
  private readonly transport: SpellTransport;
  private readonly engagement: Engagement;

  constructor(messenger?: Messenger) {
    this.transport = new SpellTransport(messenger);
    this.engagement = new Engagement({
      clear: (field) => {
        const el = field as HTMLElement;
        this.store.clear(el);
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          emitHighlights(el, [], []);
        }
      },
      run: (field, text, isTextField) => void this.run(field, text, isTextField),
    });
  }

  async start(): Promise<void> {
    const en = await isEnabled();
    if (!en) return;
    this.enabled = true;
    this.userDict = await loadUserDict();
    this.engagement.start();
  }

  stop(): void {
    this.enabled = false;
    this.engagement.stop();
  }

  async suggest(word: string): Promise<string[]> {
    return this.transport.suggest(word);
  }

  ignoreWord(word: string): void {
    this.ignore.add(stripDiacritics(word));
  }

  rememberUserWord(word: string): void {
    this.userDict.add(stripDiacritics(word));
  }

  rescan(el: Editable): void {
    if (!this.enabled) return;
    this.engagement.scan(el);
  }

  findFlagAtClick(e: MouseEvent): SpellFlagHit | null {
    const hit = this.store.findSpellHit(e);
    if (!hit) return null;
    return {
      field: hit.field,
      word: hit.item.text,
      start: hit.item.start,
      end: hit.item.end,
      rect: hit.rect,
      range: hit.range,
      isTextField: hit.isTextField,
    };
  }

  findGrammarAtClick(e: MouseEvent): GrammarFlagHit | null {
    const hit = this.store.findGrammarHit(e);
    if (!hit) return null;
    return {
      field: hit.field,
      issue: hit.item,
      rect: hit.rect,
      range: hit.range,
      isTextField: hit.isTextField,
    };
  }

  // Spell and grammar are decoupled: the fast local spell check must never wait
  // on the slow network grammar call. Each flow guards staleness on its own and
  // repaints as soon as it has results, so a slow (or hanging) grammar request
  // can no longer delay or drop the spell underlines.
  private async run(el: Editable, text: string, isTextField: boolean): Promise<void> {
    const gen = (this.scanGen.get(el as HTMLElement) ?? 0) + 1;
    this.scanGen.set(el as HTMLElement, gen);
    const { tokens, norms } = computeCandidates(text, this.userDict, this.ignore);
    await Promise.all([
      this.runSpell(el, text, isTextField, gen, tokens, norms),
      this.runGrammar(el, text, isTextField, gen),
    ]);
  }

  private isStale(el: Editable, text: string, isTextField: boolean, gen: number): boolean {
    return this.scanGen.get(el as HTMLElement) !== gen || currentText(el, isTextField) !== text;
  }

  private async runSpell(
    el: Editable,
    text: string,
    isTextField: boolean,
    gen: number,
    tokens: Token[],
    norms: string[],
  ): Promise<void> {
    const misspelledWords = norms.length ? await this.transport.check(norms) : [];
    if (this.isStale(el, text, isTextField, gen)) return;
    const misspelled = new Set(misspelledWords);
    const flagged = tokens.filter((t) => misspelled.has(stripDiacritics(t.text)));
    this.store.setSpellFlags(el as HTMLElement, flagged);
    this.paint(el, text, isTextField);
  }

  private async runGrammar(el: Editable, text: string, isTextField: boolean, gen: number): Promise<void> {
    const grammar: GrammarAnalysis = shouldAnalyzeGrammar(text)
      ? await this.transport.analyzeGrammar(text)
      : { issues: [] };
    if (this.isStale(el, text, isTextField, gen)) return;
    this.grammarByField.set(el as HTMLElement, { text, issues: grammar.issues });
    this.paint(el, text, isTextField);

    if (grammar.error && this.store.grammarFlagsFor(el as HTMLElement).length === 0) {
      window.dispatchEvent(
        new CustomEvent('dikduk-grammar-status', {
          detail: { message: grammarStatusMessage(grammar.error, grammar.code) },
        }),
      );
    }
  }

  // Re-derives the visible grammar set (issues not hidden under a spell flag)
  // from the latest spell + grammar results and repaints the field. Called by
  // both flows so whichever finishes last produces the correct combined view.
  private paint(el: Editable, text: string, isTextField: boolean): void {
    const flagged = this.store.spellFlagsFor(el as HTMLElement);
    const grammarEntry = this.grammarByField.get(el as HTMLElement);
    const rawGrammar = grammarEntry?.text === text ? grammarEntry.issues : [];
    const visibleGrammarIssues = rawGrammar.filter((issue) =>
      !flagged.some((token) => rangesOverlap(issue, token)),
    );
    this.store.setGrammarFlags(el as HTMLElement, visibleGrammarIssues);
    const grammarRanges = visibleGrammarIssues.map(issueToRange);

    if (isTextField) {
      this.store.overlayFor(el as HTMLInputElement | HTMLTextAreaElement)
        .mark([...flagged.map(tokenToRange), ...grammarRanges]);
    } else {
      emitHighlights(el as HTMLElement, flagged, grammarRanges);
    }
  }
}

// contenteditable flags are painted by highlight-main.ts in the MAIN world.
// Each host gets its own id so its highlights stay on it, instead of landing on
// whichever element happens to be focused when results arrive.
let nextFieldId = 0;

function fieldId(el: HTMLElement): string {
  let id = el.getAttribute(FIELD_ID_ATTR);
  if (!id) {
    id = String(++nextFieldId);
    el.setAttribute(FIELD_ID_ATTR, id);
  }
  return id;
}

function emitHighlights(
  el: HTMLElement,
  spell: { start: number; end: number }[],
  grammar: { start: number; end: number }[],
): void {
  const detail: SpellFlagsDetail = {
    fieldId: fieldId(el),
    offsets: spell.map((t) => ({ start: t.start, end: t.end })),
    grammarOffsets: grammar.map((t) => ({ start: t.start, end: t.end })),
  };
  window.dispatchEvent(new CustomEvent('dikduk-spell-flags', { detail }));
}

export function grammarStatusMessage(error: string, code?: string): string {
  if (code === 'BUDGET') return 'Grammar paused — monthly limit reached';
  if (code === 'NEEDS_KEY') return 'Grammar needs your AI key — click the DikDuk toolbar icon';
  if (code === 'BAD_KEY') return 'AI key rejected — check it in the DikDuk toolbar popup';
  return error;
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

function shouldAnalyzeGrammar(text: string): boolean {
  const tokens = tokenizeHebrew(text).filter((token) => !shouldSkip(token.text));
  return tokens.length >= 2;
}
