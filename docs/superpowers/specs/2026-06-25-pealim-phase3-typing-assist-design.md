# Pealim Phase 3 — Hebrew Typing Assist (spell-flag) — Design Spec

**Date:** 2026-06-25
**Status:** Approved design, pending implementation plan
**Extends:** the shipped extension (v1 + v2 + Phase 2 OCR). **The Worker and the `/lookup` contract are untouched** — Phase 3 is fully on-device. Architecturally independent of the lookup/OCR subsystems; reuses only the Shadow-DOM popup host, `computePosition`, and `hebrew.ts` primitives.

## 1. Purpose & scope

While the user types Hebrew into an editable field, flag words that appear **mistyped** and offer corrections. Grammarly-style underline → click a flag → ranked suggestions (one-click replace) + "Look up in Pealim" + "Add to my words" / "Ignore".

**In scope (this pass):**
- Live spell-flagging of Hebrew words in `<input>`, `<textarea>`, and `contenteditable` (including rich editors that keep real DOM text).
- **Fully on-device** spell engine: a bundled Hunspell-compatible engine (**nspell**) + the **Hspell** Hebrew dictionary. Both flagging and suggestions run locally — nothing ever leaves the device.
- A flag-click popup: ranked suggestions (click → replace), a "Look up in Pealim" link into the existing accordion flow, "Add to my words", "Ignore once".
- Auto-activation: engage a field only when it contains Hebrew; a single global on/off toggle in the extension popup.
- A persistent user dictionary (allow-list) and a session ignore-list.

**Out of scope (each its own spec if ever chosen):**
- **Canvas-rendered editors** (Google Docs and similar): their text is painted to a canvas with no DOM text nodes, so no DOM-based checker or overlay can reach it. Documented hard limit, not a bug.
- Grammar / agreement / word-order / punctuation checking — spelling only.
- Non-Hebrew languages; transliteration; autocomplete/predictive typing.
- Per-site enable/disable UI (the single global toggle is the only control this pass).
- Auto-correct / replace-as-you-type (replacement is always user-initiated from the popup).

## 2. Licensing decision (load-bearing, resolved)

The Hebrew engine data is **Hspell** (© 2000–2017 Nadav Har'El & Dan Kenigsberg). Per its own notice, *"not only the programs… but also the dictionary files and the generated word lists are licensed under the GNU Affero General Public License (AGPL) version 3."* The bundled dictionary is therefore AGPL data shipped inside the extension.

**Decision:** license the whole repo under **AGPLv3** and add:
- a top-level `LICENSE` (AGPLv3 full text),
- a `NOTICE`/attribution crediting Hspell (Nadav Har'El & Dan Kenigsberg, http://hspell.ivrix.org.il/) and the packaging source.

Because Phase 3 keeps the dictionary **entirely client-side** (no dict on any Worker), the AGPL network-service clause does not add a server-source obligation for this feature — the existing lookup Worker stays as-is. AGPL still governs distribution of the extension (it embeds AGPL data); the user has accepted this.

**Dictionary artifact (pinned):** the Hspell-derived Hunspell pair as packaged by `wooorm/dictionaries` (`he`), which generates from **Hspell 1.4**:
- `he.dic` — **341,585** base entries, 5.69 MB raw / **869 KB gzipped**
- `he.aff` — 79 KB (prefix + inflection affix rules; `# generated … by the Hspell project`)

## 3. Engine: fully on-device (resolved — was "hybrid")

The original pick was "local flag / server suggest," chosen on the assumption that a local engine would be large. Measurement overturned that assumption, so this spec uses the simpler, more private design:

- **nspell** (`2.1.5`, MIT, **42 KB** unpacked, one tiny dep) is a Hunspell-compatible JS engine exposing `.correct(word)` (membership) and `.suggest(word)` (ranked edit-distance candidates honoring the `.aff` rules).
- nspell + the Hspell `.dic`/`.aff` is the **whole oracle**: `.correct()` answers flagging, `.suggest()` answers the on-click corrections — both locally.
- Total added bundle ≈ **~1 MB gzipped** (dict ~869 KB + aff ~79 KB + engine ~42 KB) — well under Phase 2's several-MB Tesseract precedent.
- **No Worker endpoint, no `spell-suggest` network message, no keystroke ever leaves the device.** This is the simplest design that meets the goal and is strictly more private than the hybrid.

> This is the one change from the previously-approved answers (oracle = "hybrid"). It is an evidence-driven simplification; if the user prefers to keep suggestions server-side anyway, §3/§8/§9 revert to the hybrid (nspell on the Worker, dict in KV — KV value limit is 25 MiB, so the 5.7 MB `.dic` fits; the Worker *script* limit is 1 MB, so the dict could not be inlined).

## 4. Flagging logic

nspell already applies the Hspell `.aff` rules (the prefix particles ו/ה/ב/כ/ל/מ/ש and inflection), so no hand-rolled affix peeler is needed. The extension wraps it with normalization and noise-suppression:

1. **Normalize** the token before testing: strip niqqud and cantillation (the Hebrew combining range U+0591–U+05C7) and bidi/zero-width marks. Web text and the dictionary are both unvocalized; this matches how the v1/v2 worker already strips niqqud/bidi marks.
2. **Membership:** `nspell.correct(normalizedToken)` → if false, the token is a flag candidate.
3. **Skip rules** (never flag): tokens shorter than 2 Hebrew letters; any token containing Latin letters or digits; acronyms/abbreviations carrying geresh `׳` or gershayim `״`; tokens in the user dictionary or session ignore-list.
4. A candidate that survives the skip rules is **flagged**.

**Known error profile (acknowledged, not solved):** Hspell/nspell still over- and under-flags at the margins (names, neologisms, loanwords, some rare valid forms). This is the inherent ceiling of free Hebrew spell-checking; the mitigation is low-friction dismissal (user dictionary + ignore), not perfect precision.

## 5. Architecture & data flow

New code lives in its own folder, `extension/src/spellcheck/`, with small single-purpose units:

- `engine-worker.ts` — a **dedicated Web Worker** that loads nspell + the `.dic`/`.aff` once (the dict is multi-MB to parse; doing it off the main thread keeps typing smooth — same "heavy work off the hot path" rationale as Phase 2's offscreen OCR). Handles `{ check: string[] } → misspelled string[]` and `{ suggest: string } → string[]`.
- `normalize.ts` — niqqud/cantillation/zero-width stripping + tokenization + skip rules (shared by the content side and reused conceptually with `hebrew.ts`).
- `controller.ts` — field engagement (Hebrew-present detection), debounce, global-toggle wiring, orchestrates Worker round-trips and rendering, teardown.
- `render-overlay.ts` — mirror-`<div>` overlay for `<input>`/`<textarea>` (extension-owned DOM; runs in the isolated world).
- `highlight-main.ts` — the CSS Custom Highlight API renderer; runs in the **page MAIN world** (see §6), fed flagged offsets from the controller.
- `suggest-popup.ts` — flag-click popup (reuses the Shadow-DOM host + `computePosition`): renders `.suggest()` results; applies replace / lookup / add-to-dict / ignore.
- `userdict.ts` — `chrome.storage.local` allow-list + in-memory session ignore-list; the global toggle state.

Wiring points (existing files): `content.ts` initializes the spellcheck controller and creates the engine Web Worker; `manifest.json` gains `web_accessible_resources` (engine worker script + `.dic`/`.aff`) and a second `content_scripts` entry with `"world": "MAIN"` for `highlight-main.ts`; `popup.ts` gains the global toggle control. `background.ts` and the Worker are **unchanged**.

### Data flow

```
keystroke in an engaged field
  → controller debounce (~500ms)
  → normalize + tokenize + skip rules
  → postMessage { check: tokens } → engine Web Worker (nspell.correct)
  → worker returns misspelled tokens (+ their field offsets)
  → renderer marks flagged words:
       • contenteditable / DOM text → MAIN-world Highlight API (no DOM mutation)
       • input / textarea           → mirror-div overlay (isolated world)
click a flagged word
  → postMessage { suggest: word } → engine Web Worker (nspell.suggest)
  → suggestion popup (Shadow-DOM host + computePosition):
       suggestion → replace text in field + dispatch InputEvent + restore caret
       "Look up in Pealim" → existing lookupAndShow(word, anchor)
       "Add to my words" → persist to user dictionary, clear the flag
       "Ignore once" → session ignore-list, clear the flag
```

## 6. Rendering (Highlight-API isolated-world question — resolved by design)

- **Highlight API path** (`contenteditable` + ordinary DOM text): a page `<style>` defines `::highlight(pealim-misspelled)` (dotted-red underline) and the renderer maintains `Range`s over flagged text nodes via `CSS.highlights`. **Zero DOM mutation** → safe for rich editors; preserves the site's undo stack, caret, and change handlers.
  - **Runs in the page MAIN world**, declared as a second `content_scripts` entry with `"world": "MAIN"` (Chrome 111+). This sidesteps the open question of whether `CSS.highlights` set from an *isolated* world paints on the page — MAIN-world code shares the page's `CSS` registry, so it renders for certain. The isolated controller passes flagged `{ textNode locator, start, end }` offsets to the MAIN-world script via `CustomEvent`/`window.postMessage` (live `Range` objects can't cross worlds, so offsets are passed and Ranges rebuilt in MAIN).
  - **Fallback:** if the Highlight API is unavailable, fall back to the overlay path.
- **Overlay path** (`<input>`/`<textarea>`): a mirror `<div>` clones the field's text and copies its computed type/box styles, is positioned over the field, scroll-synced, with underline marks at flagged offsets. Display-only; the field stays the source of truth; click hit-testing maps a mark back to its word/offset.
- Both paths resolve a click to `{ word, field, range/offset }` so `suggest-popup.ts` can replace precisely.

## 7. UX details

- **Activation:** a single delegated `focusin`/`input` listener finds editable targets; a field engages only once `containsHebrew` is true for its content (invisible on non-Hebrew fields/sites, zero config). The global toggle lives in the extension popup, stored in `chrome.storage`; turning it off clears all highlights/overlays and detaches listeners.
- **User dictionary & ignore:** "Add to my words" persists to `chrome.storage.local` (allow-list checked during the skip rules); "Ignore once" adds to an in-memory session set. Both immediately clear the word's flag.
- **Replace:** for `<input>`/`<textarea>`, splice the value and dispatch a real `InputEvent`; for `contenteditable`, replace the target range's text and dispatch `InputEvent` — so the host site's own handlers fire — then restore the caret.
- **Suggestion popup states:** results (clickable list), empty ("No suggestions"). Suggestions are local and synchronous-ish (one `postMessage` round-trip), so no network loading/error state is needed; a Worker-side error path does not exist.

## 8. Messages & permissions (extension-internal only)

```ts
// content/controller ↔ engine Web Worker (postMessage):
interface CheckRequest   { type: 'check';   tokens: string[] }
interface CheckResult    { type: 'checked'; misspelled: string[] }
interface SuggestRequest { type: 'suggest'; word: string }
interface SuggestResult  { type: 'suggested'; word: string; suggestions: string[] }
// controller → MAIN-world highlighter (CustomEvent / postMessage): flagged offsets
```

No `chrome.runtime` messaging and **no Worker/network message** are added — the existing `lookup` / `render` / `ocr-*` channels are untouched, and "Look up in Pealim" reuses the existing `lookup` path.

**Permissions:** no new Chrome permissions. `storage` (already present) covers the toggle + user dictionary; the content script already matches `<all_urls>`. `manifest.json` adds: `web_accessible_resources` for the engine worker script + `.dic`/`.aff`, and a second `content_scripts` entry (`world: "MAIN"`, same `<all_urls>` match) for `highlight-main.ts`.

## 9. Resolved findings (former open spikes)

All four spikes are closed with measurements taken on 2026-06-25:

- **Engine + dictionary size — RESOLVED.** nspell 2.1.5 = 42 KB; Hspell `he.dic` = 341,585 entries / 869 KB gz; `he.aff` = 79 KB. Total ≈ ~1 MB gz, fully client-side → no bloom filter, no server suggestions, no hand-rolled affix peeler. Engine loads in a Web Worker to avoid parse jank.
- **Suggestion source — RESOLVED.** `nspell.suggest()` locally (one word, on click) — no Worker engine selection or KV/R2 hosting needed. (Cloudflare reference, only relevant to the rejected hybrid: Worker script limit 1 MB, KV value limit 25 MiB.)
- **Highlight API from content script — RESOLVED by design.** Render in the MAIN world via a declarative `world:"MAIN"` content script (Chrome 111+); overlay fallback. No reliance on isolated-world registry behavior.
- **Dictionary license + attribution — RESOLVED.** AGPLv3 (data included); exact copyright/attribution captured in §2; repo goes AGPLv3 with `LICENSE` + `NOTICE`.

## 10. Error handling (No Silent Failures)

- Engine Web Worker fails to load nspell/dict → log with context; the controller stays dormant (no flags) rather than throwing into pages; the global toggle reflects an unavailable state. No silent half-state.
- A `check`/`suggest` round-trip errors or times out → log; flags for that pass are skipped (typing is never blocked).
- Replace dispatch failure → log and leave the field unchanged.
- No empty catches anywhere; every failure path logs with context.

## 11. Testing

- **Unit (Vitest/happy-dom, matching the existing suite):**
  - `normalize.ts` — niqqud/cantillation/zero-width stripping; tokenization + skip rules (Latin/digit/geresh/length exclusions, offsets).
  - engine wrapper — `.correct()`/`.suggest()` behavior against a **tiny fixture `.dic`/`.aff`** (not the full dict): known word passes, typo fails + yields a suggestion, prefixed/inflected form passes via the `.aff` rules.
  - `userdict.ts` — allow-list/ignore suppression.
  - replace logic — input/textarea splice + contenteditable range replace, caret restore, `InputEvent` dispatched.
- **Manual (load-unpacked, user-confirmed):** type Hebrew with deliberate typos in a plain `<textarea>`, an `<input>`, and a `contenteditable` div → see flags → click → suggestions → replace; "Add to my words"/"Ignore" clear flags; global toggle off clears everything; a non-Hebrew field shows nothing; a canvas editor (Google Docs) is confirmed unsupported (expected). The Highlight-API/overlay/Chrome-API behavior is verified in-browser by the user, not claimed without it.

## 12. Risks / notes

- **Accuracy ceiling:** free Hebrew spell-checking inherently over- and under-flags (§4). The product stance is "fast, private, easy to dismiss," not "authoritative."
- **Rich-editor fragility:** the Highlight-API path is robust because it never mutates the DOM, but heavily-managed editors may re-render text nodes; the debounced per-field re-pass absorbs most of this. Some exotic editors may still mis-mark; acceptable for a personal load-unpacked extension.
- **Dictionary parse cost:** loading the 5.7 MB `.dic` into nspell happens once, lazily, in the Web Worker; the field engages only on Hebrew, so the cost is paid only when actually needed.
- **Bundle size:** ~1 MB gz added. Fine for load-unpacked; a Web Store listing would be a separate concern.
- **AGPLv3:** distributing the extension carries the AGPL source-availability obligation (§2). Keeping the dictionary client-side avoids adding any server-source obligation.
