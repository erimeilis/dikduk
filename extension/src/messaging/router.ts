import { fetchLookup } from '../lookup/lookup-service';
import { fetchGrammar } from '../spellcheck/grammar-service';
import { relaySpellRequest } from '../spellcheck/spell-relay';
import type { LookupMessage } from '../contracts/messages';
import type { GrammarAnalyzeRequest } from '../contracts/grammar';
import type { SpellCheckRequest, SpellSuggestRequest } from '../contracts/spell';

// Background onMessage dispatch table. Each listener claims only its own message
// type (returning false otherwise) and keeps the channel open for an async response.
export function registerRouter(): void {
  chrome.runtime.onMessage.addListener((msg: LookupMessage, _sender, sendResponse) => {
    if (msg?.type !== 'lookup') return false;
    fetchLookup(msg.word).then(sendResponse);
    return true; // keep the message channel open for the async response
  });

  chrome.runtime.onMessage.addListener((msg: GrammarAnalyzeRequest | { type?: string }, _sender, sendResponse) => {
    if (msg?.type !== 'grammar-analyze') return false;
    fetchGrammar((msg as GrammarAnalyzeRequest).text).then(sendResponse);
    return true; // keep the message channel open for the async response
  });

  chrome.runtime.onMessage.addListener(
    (msg: SpellCheckRequest | SpellSuggestRequest | { type?: string }, _sender, sendResponse) => {
      if (msg?.type !== 'spell-check' && msg?.type !== 'spell-suggest') return false;
      void (async () => {
        try {
          sendResponse(await relaySpellRequest(msg as SpellCheckRequest | SpellSuggestRequest));
        } catch (e) {
          console.error('[dikduk] spell relay failed:', e);
          sendResponse({ error: e instanceof Error ? e.message : String(e) });
        }
      })();
      return true; // keep the channel open for the async sendResponse
    },
  );
}
