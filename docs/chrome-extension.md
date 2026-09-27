# <img src="assets/chrome.svg" alt="" width="28" /> DikDuk for Chrome

Read and write Hebrew on any web page: double-click a word for its translation, root and full
conjugation; get misspellings underlined as you type; receive grammar hints on Hebrew you write.

---

## What it does

- **Dictionary lookup** — double-click a Hebrew word, or right-click a selection or an image (OCR), to
  see translation, root, part of speech, and conjugation/inflection tables.
- **Spell-check** — Hebrew misspellings are underlined in inputs, textareas, and editable fields.
  Click a flag for suggestions, add-to-dictionary, or ignore. Runs entirely in your browser.
- **Grammar hints** — grammar issues in Hebrew you type are underlined; click one for an explanation
  and a suggested fix. Needs your own AI key.

| Feature | Needs an AI key? |
| --- | --- |
| Dictionary lookup (double-click, right-click, OCR) | No |
| Spell-check | No — runs entirely in your browser |
| Grammar hints | **Yes** |

---

## Install

The extension is not in the Chrome Web Store yet; you load it from a build.

1. Build it once (needs Node.js): `cd extension && npm install && npm run build`.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension/dist` folder.
4. Click the puzzle-piece icon in the toolbar and pin **DikDuk**.

### What Chrome asks you to allow, and why

- **Read and change all your data on all websites** — to find Hebrew words on the pages you read
  and to underline spelling and grammar in the fields you type in. Only two things leave your
  computer: words you look up, and — once you have saved an AI key — the text of Hebrew fields you
  type in, for grammar checks. Spell-check never sends anything.
- **Storage** — your personal dictionary, settings, and AI key, kept on this computer.
- **Context menus** — the right-click "Look up" entry.
- **Offscreen documents** — runs OCR and the spell-checker in the background.

---

## Add your AI key (for grammar hints)

Click the DikDuk icon › **AI key** › choose the provider, paste the key (and, for Cloudflare, your
account ID) › **Test** › **Save**.

The AI runs on **your own** account at Google or Cloudflare, so you pay for your own usage (both have
a free allowance). DikDuk never stores your key on its server: it is sent with each AI request and
used for that one request only.

### Which AI key to choose

| | Cloudflare Workers AI (recommended) | Google Gemini |
| --- | --- | --- |
| Tested with DikDuk | Yes — grammar verified live | Not yet tested live |
| Free allowance | 10,000 Neurons per day — about 1,000 grammar checks | Free tier with per-model daily request limits (see Google AI Studio) |
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
| "add your AI key" / "Grammar needs your AI key" | No key saved — see [Add your AI key](#add-your-ai-key-for-grammar-hints). |
| "AI key rejected" | The provider refused the key: check you pasted all of it (and, for Cloudflare, the right account ID). |
| "offline" | DikDuk can't reach its server — check your connection. |

---

Privacy: [PRIVACY.md](../PRIVACY.md) · Also for Mac: [DikDuk for macOS](macos-companion.md)
