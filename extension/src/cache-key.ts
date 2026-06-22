export function cacheKeyFor(word: string): string {
  return `pealim:${word.trim()}`;
}
