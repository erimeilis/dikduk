# DikDuk for macOS

Menu-bar companion: hold **⌥** (or ⌃⌥) and point at Hebrew text in any app — menus,
buttons, settings — to see its English meaning and a Pealim breakdown of each term.

## Build and run

```bash
cd macos
swift test              # core logic tests
scripts/bundle.sh       # builds and signs build/DikDuk.app
open build/DikDuk.app
```

The first `bundle.sh` creates a local code-signing identity ("DikDuk Local Signing")
and asks for your login password once, so the Accessibility permission survives
rebuilds. On first launch, grant DikDuk access in System Settings › Privacy &
Security › Accessibility.

## Using it

- Hold the modifier over Hebrew UI text: the panel shows the phrase translation
  and up to 6 terms (meaning, root, related entries).
- ⌥+click pins the panel; click a term to open it on Pealim. Esc or a click
  elsewhere closes it.
- Menu-bar icon: enable/disable, pick the modifier, quit.

Test against a local worker before `/translate` is deployed:

```bash
defaults write dev.dikduk.companion workerURL http://localhost:8787
defaults delete dev.dikduk.companion workerURL   # back to production
DIKDUK_WORKER_URL=http://localhost:8787 swift run DikDuk   # unbundled runs
```

Logs: `log stream --predicate 'subsystem == "dev.dikduk.companion"' --level debug`

## Limits

Apps that expose no Accessibility text (games, canvas UIs, some Java/Qt/Electron
apps) show nothing. Password fields are never read.
