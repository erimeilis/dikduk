export function cacheKeyFor(word: string): string {
  return `pealim:v2:${word.trim()}`;
}
