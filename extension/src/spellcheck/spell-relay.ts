import { ensureOffscreen, sendToOffscreen } from '../messaging/offscreen-relay';
import type {
  SpellCheckRequest,
  SpellSuggestRequest,
  SpellResult,
} from '../contracts/spell';

// Spell engine lives in the offscreen document (content scripts can't construct a
// cross-origin Worker). Relay the content script's request through it.
export async function relaySpellRequest(
  msg: SpellCheckRequest | SpellSuggestRequest,
): Promise<SpellResult> {
  await ensureOffscreen();
  const osMsg =
    msg.type === 'spell-check'
      ? { type: 'spell-check-os', tokens: msg.tokens }
      : { type: 'spell-suggest-os', word: msg.word };
  return sendToOffscreen<SpellResult>(osMsg, { retries: 5 });
}
