import { stripDiacritics, tokenizeHebrew, shouldSkip, type Token } from '../shared/hebrew';
import { loadUserDict, isEnabled } from './userdict';
import type { GrammarIssue } from '../contracts/grammar';
import { type OverlayRange } from './overlay-renderer';
import { computeCandidates, FlagStore } from './flag-store';
import { Engagement } from './engagement';
import { SpellTransport, type Messenger, type GrammarAnalysis } from './transport';
import { type Editable, currentText } from './editable-locator';

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
  private readonly transport: SpellTransport;
  private readonly engagement: Engagement;

  constructor(messenger?: Messenger) {
    this.transport = new SpellTransport(messenger);
    this.engagement = new Engagement({
      clear: (field) => this.store.clear(field as HTMLElement),
      clearOverlay: (field) => this.store.clearOverlay(field as HTMLElement),
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

  private async run(el: Editable, text: string, isTextField: boolean): Promise<void> {
    const { tokens, norms } = computeCandidates(text, this.userDict, this.ignore);
    const [misspelledWords, grammar] = await Promise.all([
      norms.length ? this.transport.check(norms) : Promise.resolve([]),
      shouldAnalyzeGrammar(text)
        ? this.transport.analyzeGrammar(text)
        : Promise.resolve<GrammarAnalysis>({ issues: [] }),
    ]);
    if (currentText(el, isTextField) !== text) return;
    const misspelled = new Set(misspelledWords);
    const flagged = tokens.filter((t) => misspelled.has(stripDiacritics(t.text)));
    const visibleGrammarIssues = grammar.issues.filter((issue) =>
      !flagged.some((token) => rangesOverlap(issue, token)),
    );
    this.store.setSpellFlags(el as HTMLElement, flagged);
    this.store.setGrammarFlags(el as HTMLElement, visibleGrammarIssues);
    const grammarRanges = visibleGrammarIssues.map(issueToRange);

    if (isTextField) {
      this.store.overlayFor(el as HTMLInputElement | HTMLTextAreaElement)
        .mark([...flagged.map(tokenToRange), ...grammarRanges]);
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

    if (grammar.error && visibleGrammarIssues.length === 0) {
      window.dispatchEvent(
        new CustomEvent('dikduk-grammar-status', {
          detail: { message: grammarStatusMessage(grammar.error, grammar.code) },
        }),
      );
    }
  }
}

function grammarStatusMessage(error: string, code?: string): string {
  if (code === 'BUDGET') return 'Grammar paused — monthly limit reached';
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
