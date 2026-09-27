import { isEnabled, setEnabled } from './spellcheck/userdict';
import { loadAiKey, saveAiKey, clearAiKey, headersFor, validateAiKey, type AiProvider } from './shared/ai-key';
import { fetchGrammar } from './spellcheck/grammar-service';

const box = document.getElementById('toggle') as HTMLInputElement;
void (async () => { box.checked = await isEnabled(); })();
box.addEventListener('change', () => void setEnabled(box.checked));

// AI key: the user's own Gemini / Workers AI key (or the owner token) pays for grammar.
const providerEl = document.getElementById('provider') as HTMLSelectElement;
const keyEl = document.getElementById('key') as HTMLInputElement;
const accountEl = document.getElementById('account') as HTMLInputElement;
const resultEl = document.getElementById('result') as HTMLDivElement;
const syncAccount = () => { accountEl.hidden = providerEl.value !== 'workers-ai'; };
const show = (message: string, kind: 'ok' | 'err' | '' = '') => {
  resultEl.textContent = message;
  resultEl.className = kind;
};
providerEl.addEventListener('change', syncAccount);

void (async () => {
  const current = await loadAiKey();
  if (current) {
    providerEl.value = current.provider;
    keyEl.value = current.key;
    accountEl.value = current.account ?? '';
  }
  syncAccount();
})();

const current = () => ({
  provider: providerEl.value as AiProvider,
  key: keyEl.value,
  account: providerEl.value === 'workers-ai' ? accountEl.value : undefined,
});

document.getElementById('save')!.addEventListener('click', () => void (async () => {
  const problem = validateAiKey(current());
  if (problem) { show(problem, 'err'); return; }
  await saveAiKey(current());
  show('Saved.', 'ok');
})());

document.getElementById('remove')!.addEventListener('click', () => void (async () => {
  await clearAiKey();
  keyEl.value = '';
  accountEl.value = '';
  show('Removed.');
})());

document.getElementById('test')!.addEventListener('click', () => void (async () => {
  // Test the typed key without saving it, so a wrong key never replaces a working one.
  const problem = validateAiKey(current());
  if (problem) { show(problem, 'err'); return; }
  show('Testing…');
  const result = await fetchGrammar('הספר טובה', headersFor(current()));
  if ('issues' in result) show('✓ Key works', 'ok');
  else show(`✗ ${result.code ?? ''} ${result.error}`.replace('✗  ', '✗ '), 'err');
})());
