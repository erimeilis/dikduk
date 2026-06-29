const DICT_KEY = 'dikduk:spell:dict';
const ENABLED_KEY = 'dikduk:spell:enabled';

export async function loadUserDict(): Promise<Set<string>> {
  try {
    const got = await chrome.storage.local.get(DICT_KEY);
    return new Set((got[DICT_KEY] as string[]) ?? []);
  } catch (e) {
    console.error('[dikduk] spell dict read failed:', e);
    return new Set();
  }
}

export async function addUserWord(word: string): Promise<void> {
  try {
    const set = await loadUserDict();
    set.add(word);
    await chrome.storage.local.set({ [DICT_KEY]: [...set] });
  } catch (e) {
    console.error('[dikduk] spell dict write failed:', e);
  }
}

export async function isEnabled(): Promise<boolean> {
  try {
    const got = await chrome.storage.local.get(ENABLED_KEY);
    return (got[ENABLED_KEY] as boolean | undefined) ?? true;
  } catch (e) {
    console.error('[dikduk] spell enabled read failed:', e);
    return true;
  }
}

export async function setEnabled(on: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ [ENABLED_KEY]: on });
  } catch (e) {
    console.error('[dikduk] spell enabled write failed:', e);
  }
}
