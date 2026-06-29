export function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[""''"'«».,;:!?()\[\]{}<>״׳]+|[""''"'«».,;:!?()\[\]{}<>״׳]+$/gu, '')
    .trim();
}
