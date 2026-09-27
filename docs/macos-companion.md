# <img src="assets/apple.svg" alt="" width="28" /> DikDuk for macOS

A menu-bar app for a Hebrew-language Mac: hold **⌥** over any menu, button, or setting in any app —
including Chrome's own menus, toolbar, and settings, which an extension cannot reach — to see its
English meaning plus a Pealim breakdown of each term.

---

## What it does

- Hold **⌥** over Hebrew text: the panel shows the phrase translation and up to 6 terms (meaning,
  root, related entries).
- **⌥+click** pins the panel; click a term to open it on Pealim. **Esc** or a click elsewhere closes it.
- Menu-bar icon: enable/disable, pick the modifier (⌥ or ⌃⌥), AI key, quit.

| Feature | Needs an AI key? |
| --- | --- |
| Labels someone already translated | No — served from the shared cache |
| New labels | **Yes** |
| Term breakdown (meaning, root, related words) | No |

---

## Install

Requires macOS 15 or later.

1. Download `DikDuk-macos-<version>.zip` from
   [Releases](https://github.com/erimeilis/dikduk/releases) — **version 0.2.0 or later** (0.1.0
   predates AI keys).
2. Unzip it and move **DikDuk.app** to Applications.
3. **Right-click › Open › Open** the first time. The app is not signed with an Apple Developer ID, so
   a plain double-click is blocked by Gatekeeper.
4. Allow **Accessibility** when asked (System Settings › Privacy & Security › Accessibility › turn on
   DikDuk). It lets DikDuk read the text of the menu or button under your pointer. Password fields
   are never read.
5. Menu-bar icon › **AI key…** › add your key (see below).
6. Hold **⌥** over Hebrew text in any app.

**Chrome's menus in Hebrew:** System Settings › General › Language & Region › Applications › **+** ›
Google Chrome › Hebrew, then restart Chrome.

---

## Add your AI key (for new translations)

Menu-bar icon › **AI key…** › choose the provider, paste the key › **Test** › **Save**. The key is
stored in your Keychain. If macOS asks whether DikDuk may use it, choose **Always Allow**.

The AI runs on **your own** account at Google or Cloudflare, so you pay for your own usage (both have
a free allowance). DikDuk never stores your key on its server: it is sent with each AI request and
used for that one request only.

### Which AI key to choose

| | Cloudflare Workers AI (recommended) | Google Gemini |
| --- | --- | --- |
| Tested with DikDuk | Yes — translations verified live | Not yet tested live |
| Free allowance | 10,000 Neurons per day — about 2,400 new UI-label translations | Free tier with per-model daily request limits (see Google AI Studio) |
| Setup | API token **and** account ID | One key |
| Beyond the free allowance | Workers Paid plan ($5/month) plus usage | Pay-as-you-go billing in Google AI Studio |

**Get a Cloudflare Workers AI key**

1. Sign up or log in at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Open **Workers AI** in the sidebar and select **Use REST API**.
3. Select **Create a Workers AI API Token** › **Create API Token** › **Copy API Token**.
   (A hand-made token needs the permissions *Workers AI – Read* and *Workers AI – Edit*.)
4. On the same page, copy the **Account ID**.
5. In DikDuk choose **Cloudflare Workers AI** and paste both.

**Get a Google Gemini key**

1. Sign in at [aistudio.google.com](https://aistudio.google.com) with a Google account.
2. Open **Get API key** and select **Create API key**, then copy it.
3. In DikDuk choose **Google Gemini** and paste the key.

---

## If something says…

| Message | Meaning |
| --- | --- |
| "No AI key — translations from cache only" (menu) | Only labels someone translated before will show a translation. |
| "AI key rejected" | The provider refused the key: check you pasted all of it (and, for Cloudflare, the right account ID). |
| "Keychain error" (menu) | macOS denied access to the saved key — re-save it in **AI key…** and choose **Always Allow**. |
| "offline" | DikDuk can't reach its server — check your connection. |

Nothing appears over some apps? Apps that expose no Accessibility text (games, canvas UIs, some
Java/Qt/Electron apps) can't be read.

---

Privacy: [PRIVACY.md](../PRIVACY.md) · Also for Chrome: [DikDuk for Chrome](chrome-extension.md)
