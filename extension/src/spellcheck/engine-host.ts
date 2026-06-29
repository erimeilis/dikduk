import { createDictionaryEngine, type SpellEngine } from './engine';
import { lazySingleton } from '../shared/lazy-singleton';
import type { SpellCheckOsRequest, SpellSuggestOsRequest } from '../contracts/spell';

// --- Hebrew spell engine (Hspell dictionary) ----------------------------------
// Loaded once in the offscreen document (extension origin), shared across tabs.
const getSpell = lazySingleton<SpellEngine>(async () => {
  const [aff, dic] = await Promise.all([
    fetch(chrome.runtime.getURL('spelldata/he.aff')).then((r) => r.text()),
    fetch(chrome.runtime.getURL('spelldata/he.dic')).then((r) => r.text()),
  ]);
  return createDictionaryEngine(aff, dic);
});

export function registerSpellEngineHost(): void {
  chrome.runtime.onMessage.addListener(
    (msg: SpellCheckOsRequest | SpellSuggestOsRequest | { type?: string }, _sender, sendResponse) => {
      if (msg?.type === 'spell-check-os') {
        const { tokens } = msg as SpellCheckOsRequest;
        getSpell()
          .then((s) => sendResponse({ misspelled: s.check(tokens) }))
          .catch((e: unknown) => {
            console.error('[dikduk] spell check (offscreen) failed:', e);
            sendResponse({ error: e instanceof Error ? e.message : String(e) });
          });
        return true;
      }
      if (msg?.type === 'spell-suggest-os') {
        const { word } = msg as SpellSuggestOsRequest;
        getSpell()
          .then((s) => sendResponse({ suggestions: s.suggest(word).slice(0, 6) }))
          .catch((e: unknown) => {
            console.error('[dikduk] spell suggest (offscreen) failed:', e);
            sendResponse({ error: e instanceof Error ? e.message : String(e) });
          });
        return true;
      }
      return false;
    },
  );
}
