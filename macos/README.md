# DikDuk for macOS

Menu-bar companion: hold **⌥** (or ⌃⌥) and point at Hebrew text in any app — menus,
buttons, settings — to see its English meaning and a Pealim breakdown of each term.

> **New here?** The step-by-step setup (install, permissions, which AI key to pick and where to
> get it) is in the user guide [docs/macos-companion.md](../docs/macos-companion.md).

## Download

Prebuilt app: `DikDuk-macos-<version>.zip` on the repository's
[Releases](https://github.com/erimeilis/dikduk/releases) page (tags `macos-v*`). Unzip, move
`DikDuk.app` to Applications, then **right-click › Open** the first time — it is signed with a local
self-signed identity, not an Apple Developer ID, so Gatekeeper blocks a plain double-click. Requires
macOS 15 or later.

To publish a new build: `scripts/bundle.sh`, then
`ditto -c -k --keepParent build/DikDuk.app build/DikDuk-macos-<version>.zip` and attach the zip to a
`macos-v<version>` release (`gh release create`). Bump `CFBundleShortVersionString` in
`Resources/Info.plist` first.

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
- **AI key:** menu › AI key… — pick Google Gemini, Cloudflare Workers AI or the owner token, paste
  the key, **Test**, **Save**. Keys are stored in your Keychain. Without a key only cached translations
  appear; dictionary rows always work.

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
