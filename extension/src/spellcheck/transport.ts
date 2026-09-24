import { stripDiacritics } from '../shared/hebrew';
import type { GrammarAnalyzeRequest, GrammarIssue, GrammarResult } from '../contracts/grammar';
import type {
  SpellCheckRequest,
  SpellSuggestRequest,
  SpellResult,
} from '../contracts/spell';

// Abstraction over chrome.runtime.sendMessage so the controller/transport can be
// driven by a stub in tests without a global `chrome`.
export interface Messenger {
  sendMessage(msg: unknown): Promise<unknown>;
}

// Default real implementation — unchanged runtime behavior.
export const chromeMessenger: Messenger = {
  sendMessage: (msg) => chrome.runtime.sendMessage(msg),
};

// Talks to the background worker for spell-check, spell-suggest and grammar
// analysis. All failures are logged and degrade to an empty result.
export class SpellTransport {
  constructor(private readonly messenger: Messenger = chromeMessenger) {}

  async check(tokens: string[]): Promise<string[]> {
    try {
      const res = (await this.messenger.sendMessage({
        type: 'spell-check',
        tokens,
      } satisfies SpellCheckRequest)) as SpellResult | undefined;
      return res && 'misspelled' in res ? res.misspelled : [];
    } catch (e) {
      console.error('[dikduk] spell check failed:', e);
      return [];
    }
  }

  async suggest(word: string): Promise<string[]> {
    try {
      const res = (await this.messenger.sendMessage({
        type: 'spell-suggest',
        word: stripDiacritics(word),
      } satisfies SpellSuggestRequest)) as SpellResult | undefined;
      return res && 'suggestions' in res ? res.suggestions : [];
    } catch (e) {
      console.error('[dikduk] spell suggest failed:', e);
      return [];
    }
  }

  async analyzeGrammar(text: string): Promise<GrammarAnalysis> {
    try {
      const res = (await this.messenger.sendMessage({
        type: 'grammar-analyze',
        text,
      } satisfies GrammarAnalyzeRequest)) as GrammarResult | undefined;
      if (res && 'error' in res && res.error) {
        return { issues: [], error: res.error, code: res.code };
      }
      if (res && 'issues' in res) {
        return { issues: res.issues.filter((issue) => isValidIssue(issue, text.length)) };
      }
      return { issues: [] };
    } catch (e) {
      console.error('[dikduk] grammar analyze failed:', e);
      return { issues: [], error: (e as Error).message };
    }
  }
}

export interface GrammarAnalysis {
  issues: GrammarIssue[];
  error?: string;
  code?: string;
}

function isValidIssue(issue: GrammarIssue, textLength: number): boolean {
  return Number.isInteger(issue.start)
    && Number.isInteger(issue.end)
    && issue.start >= 0
    && issue.end > issue.start
    && issue.end <= textLength;
}
