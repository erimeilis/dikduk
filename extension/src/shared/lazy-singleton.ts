// Memoized-promise-with-reset helper. Lazily runs `factory` once and caches the
// resulting promise; if the promise rejects, the cache is cleared so a later call
// can retry initialisation. Used for the offscreen Tesseract worker and the Hspell
// engine singletons.
export function lazySingleton<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    if (!promise) {
      promise = factory().catch((err: unknown) => {
        promise = null; // allow a later call to retry initialisation
        throw err;
      });
    }
    return promise;
  };
}
