import { normalizeHebrew } from '../shared/hebrew';

// Strips niqqud/cantillation via normalizeHebrew so vowelled Pealim forms (e.g. "לֶאֱכוֹל")
// and unvowelled user queries (e.g. "לאכול") normalize to the same bare-letter key. This
// keeps the D1 alias read path (WHERE query_key = ?) aligned with the scraper's write path,
// which aliases fully-vowelled `.menukad` forms parsed from Pealim.
export function normalizeQuery(raw: string): string {
  return normalizeHebrew(
    raw
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[""''"'«».,;:!?()\[\]{}<>״׳]+|[""''"'«».,;:!?()\[\]{}<>״׳]+$/gu, '')
      .trim(),
  );
}
