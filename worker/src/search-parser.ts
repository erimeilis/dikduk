import { parse } from 'node-html-parser';
import type { SearchResult } from './types';

const BASE = 'https://www.pealim.com';

export function parseSearchResults(html: string): SearchResult | null {
  const root = parse(html);
  const first = root.querySelector('.verb-search-result');
  if (!first) return null;

  const lemmaEl = first.querySelector('.verb-search-lemma');
  const dictLink =
    lemmaEl?.querySelector('a[href^="/dict/"]') ?? first.querySelector('a[href^="/dict/"]');
  const href = dictLink?.getAttribute('href');
  if (!href) return null;

  const lemma = (lemmaEl?.text ?? dictLink?.text ?? '').split('~')[0].replace(/\s+/g, ' ').trim();

  // Use the anchor inside .verb-search-root to avoid the "Root: " label text
  const rootLinkText = first.querySelector('.verb-search-root a')?.text ?? '';
  const root_ = rootLinkText
    .replace(/\s*-\s*/g, '־')
    .replace(/\s+/g, ' ')
    .trim();

  const translation = (first.querySelector('.verb-search-meaning')?.text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const buttonText = first.querySelector('.verb-search-button')?.text ?? '';
  const isVerb = /full conjugation/i.test(buttonText);

  return {
    lemma,
    root: root_,
    translation,
    isVerb,
    dictUrl: href.startsWith('http') ? href : BASE + href,
  };
}
