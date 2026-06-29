# Phase 4 Hebrew Grammar Analysis

## Decision

Do not build a Hebrew grammar engine from hardcoded word lists.

Use the current local Hspell spell checker for word existence, then add a separate analyzer pipeline:

1. Primary: DictaBERT joint or tiny joint behind a small HTTP service.
2. Rule layer: deterministic checks over morphology and dependency output.
3. Optional fallback: Workers AI or Gemini for paragraph-level suggestions when a user explicitly enables it.

The extension should only consume normalized analyzer output after the provider is benchmarked for quality, latency, and privacy.

## Provider Options

### DictaBERT Joint / Tiny Joint

Source: https://huggingface.co/dicta-il/dictabert-joint and https://huggingface.co/dicta-il/dictabert-tiny-joint

This is the best foundation for deterministic Hebrew grammar work. It exposes prefix segmentation, lemmatization, morphological disambiguation, dependency parsing, and named entity recognition. The normalized Worker contract is based on this output:

```json
{
  "tokens": [
    {
      "surface": "הספר",
      "lemma": "ספר",
      "pos": "NOUN",
      "feats": { "Gender": "Masc", "Number": "Sing" },
      "dependency": { "head": 1, "relation": "nsubj" }
    }
  ],
  "issues": []
}
```

The model license is CC BY 4.0 on Hugging Face. Before product release, confirm attribution requirements and whether the tiny model is accurate enough.

### Cloudflare Workers AI

Source: https://developers.cloudflare.com/workers-ai/platform/pricing/ and https://developers.cloudflare.com/workers-ai/configuration/bindings/

Workers AI is useful as a cheap optional LLM fallback. Current Worker typings include Gemma and Kimi models, and `wrangler.toml` can expose an `AI` binding. It is not the primary grammar engine because LLM output is nondeterministic and offset accuracy needs validation.

Use only for explicit `provider: "workers-ai"` calls.

### Gemini

Source: https://ai.google.dev/gemini-api/docs/pricing

Gemini is useful for a paid or user-key fallback provider. The free tier is acceptable for experiments, but product privacy requires care because free-tier processing terms can differ from paid API usage. Keep the key server-side in the Worker, never in the extension.

Use only for explicit `provider: "gemini"` calls.

### LanguageTool

Source: https://dev.languagetool.org/public-http-api

Not a good product dependency for this extension. The public API is rate-limited, not intended for automated high-volume use, and Hebrew grammar coverage is not the strong path.

### Stanza / UD Hebrew HTB

Sources: https://stanfordnlp.github.io/stanza/available_models.html and https://github.com/UniversalDependencies/UD_Hebrew-HTB

Good for evaluation and test corpora. The UD Hebrew HTB license is CC BY-NC-SA 4.0, so avoid bundling it into product logic unless the licensing story is resolved.

### AlephBERT / DictaLM

Sources: https://arxiv.org/abs/2104.04052 and https://huggingface.co/dicta-il/dictalm2.0

Useful research and fallback model families, but less direct than DictaBERT joint for structured morphology and dependency output.

## Implemented Spike

Worker endpoint:

```http
POST /analyze
content-type: application/json

{ "text": "הספר טובה" }
```

Provider selection:

- Default: `DICTABERT_ANALYZER_URL` if configured.
- Explicit: `{ "provider": "workers-ai" }` uses the `AI` binding.
- Explicit: `{ "provider": "gemini" }` uses `GEMINI_API_KEY`.

Current deterministic rule layer:

- Repeated adjacent words.
- Adjective-noun gender/number agreement via `amod`.
- Subject-verb person/gender/number agreement via `nsubj`.

All grammar rules consume analyzer features. There is no hardcoded Hebrew lexicon.

Test drive:

```sh
cd worker
npm run analyzer:dictabert
```

In another shell:

```sh
cd worker
npm run dev:analyze
curl -s http://127.0.0.1:8787/analyze \
  -H 'content-type: application/json' \
  --data '{"text":"הספר טובה"}'
```

Or open `worker/testdrive/analyze.html` in a browser while both services are running.

Local smoke test:

- Ran `dicta-il/dictabert-tiny-joint` through Transformers with `trust_remote_code=True`.
- Input: `הספר טובה`.
- Output included token offsets, `NOUN`/`ADJ` POS tags, `Gender` and `Number` features, `DET` prefix segmentation, lemma values, and `amod` dependency from `טובה` to `הספר`.
- The current adapter accepts that shape and flags the gender mismatch through the generic adjective-agreement rule.

## Next Benchmark

Run DictaBERT tiny joint locally or on a small service with 20-30 Hebrew sentences:

- correct simple sentences,
- noun/adjective mismatches,
- subject/verb mismatches,
- construct/definiteness examples,
- colloquial text,
- texts with spelling errors mixed in.

Record:

- JSON shape differences from our adapter assumptions,
- latency on CPU,
- memory use,
- false positives,
- useful morphological features missing from tiny vs full model.
