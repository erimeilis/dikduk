import nspell from 'nspell';
import type { ToWorker, FromWorker } from './protocol';

let spell: ReturnType<typeof nspell> | null = null;

function post(msg: FromWorker): void {
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = async (e: MessageEvent<ToWorker>): Promise<void> => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      const [aff, dic] = await Promise.all([
        fetch(msg.affUrl).then((r) => r.text()),
        fetch(msg.dicUrl).then((r) => r.text()),
      ]);
      spell = nspell({ aff, dic });
      post({ type: 'ready' });
    } else if (msg.type === 'check') {
      const misspelled = spell ? msg.tokens.filter((w) => !spell!.correct(w)) : [];
      post({ type: 'checked', id: msg.id, misspelled });
    } else if (msg.type === 'suggest') {
      const suggestions = spell ? spell.suggest(msg.word).slice(0, 6) : [];
      post({ type: 'suggested', id: msg.id, word: msg.word, suggestions });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
