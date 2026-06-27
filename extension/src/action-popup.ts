import { isEnabled, setEnabled } from './spellcheck/userdict';

const box = document.getElementById('toggle') as HTMLInputElement;
void (async () => { box.checked = await isEnabled(); })();
box.addEventListener('change', () => void setEnabled(box.checked));
