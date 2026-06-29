export function cacheKeyFor(word: string): string {
  return `dikduk:v2:${word.trim()}`;
}
