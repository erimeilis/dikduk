export type ToWorker =
  | { type: 'init'; affUrl: string; dicUrl: string }
  | { type: 'check'; id: number; tokens: string[] }
  | { type: 'suggest'; id: number; word: string };
export type FromWorker =
  | { type: 'ready' }
  | { type: 'checked'; id: number; misspelled: string[] }
  | { type: 'suggested'; id: number; word: string; suggestions: string[] }
  | { type: 'error'; message: string };
