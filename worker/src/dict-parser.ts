import { parse, type HTMLElement } from 'node-html-parser';
import type { Conjugation } from './types';

const PAST_IDS = {
  '1s': 'PERF-1s', '1p': 'PERF-1p',
  '2ms': 'PERF-2ms', '2fs': 'PERF-2fs', '2mp': 'PERF-2mp', '2fp': 'PERF-2fp',
  '3ms': 'PERF-3ms', '3fs': 'PERF-3fs', '3p': 'PERF-3p',
} as const;

const FUTURE_IDS = {
  '1s': 'IMPF-1s', '1p': 'IMPF-1p',
  '2ms': 'IMPF-2ms', '2fs': 'IMPF-2fs', '2mp': 'IMPF-2mp', '2fp': 'IMPF-2fp',
  '3ms': 'IMPF-3ms', '3fs': 'IMPF-3fs', '3mp': 'IMPF-3mp', '3fp': 'IMPF-3fp',
} as const;

const IMP_IDS = {
  '2ms': 'IMP-2ms', '2fs': 'IMP-2fs', '2mp': 'IMP-2mp', '2fp': 'IMP-2fp',
} as const;

function formById(root: HTMLElement, id: string): string {
  const cell = root.getElementById(id);
  if (!cell) return '';
  const menukad = cell.querySelector('.menukad');
  const raw = menukad?.text ?? cell.text;
  return raw.split('~')[0].replace(/\s+/g, ' ').trim();
}

function mapForms<K extends string>(
  root: HTMLElement,
  ids: Record<K, string>,
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(ids) as K[]) out[key] = formById(root, ids[key]);
  return out;
}

export function parseDictPage(html: string): { binyan: string | null; conjugation: Conjugation } {
  const root = parse(html);

  let binyan: string | null = null;
  for (const h of root.querySelectorAll('h3.page-header')) {
    if (h.text.trim().startsWith('Active forms')) {
      const small = h.querySelector('.small')?.text ?? '';
      binyan = small.replace(/^Binyan\s+/i, '').trim() || null;
      break;
    }
  }

  const conjugation: Conjugation = {
    present: {
      ms: formById(root, 'AP-ms'),
      fs: formById(root, 'AP-fs'),
      mp: formById(root, 'AP-mp'),
      fp: formById(root, 'AP-fp'),
    },
    past: mapForms(root, PAST_IDS),
    future: mapForms(root, FUTURE_IDS),
    imperative: mapForms(root, IMP_IDS),
    infinitive: formById(root, 'INF-L'),
  };

  return { binyan, conjugation };
}
