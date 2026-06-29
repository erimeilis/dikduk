// Spell engine messages. The engine runs in the offscreen document (a content
// script cannot construct a Worker from a chrome-extension:// URL — cross-origin),
// so the flow is: content script → background → offscreen → back.

// Content script → background.
export interface SpellCheckRequest { type: 'spell-check'; tokens: string[] }
export interface SpellSuggestRequest { type: 'spell-suggest'; word: string }

// Background → offscreen. Distinct types so the offscreen handler never picks up
// the content script's original (broadcast) message — only the forwarded one.
export interface SpellCheckOsRequest { type: 'spell-check-os'; tokens: string[] }
export interface SpellSuggestOsRequest { type: 'spell-suggest-os'; word: string }

// Responses (offscreen → background → content).
export interface SpellCheckResult { misspelled: string[] }
export interface SpellSuggestResult { suggestions: string[] }
export interface SpellErrorResult { error: string }
export type SpellResult = SpellCheckResult | SpellSuggestResult | SpellErrorResult;
