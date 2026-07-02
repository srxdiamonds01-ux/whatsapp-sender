# WhatsApp Bulk Sender

A **Windows desktop app** (Electron) — also runnable as a web app — to send bulk WhatsApp messages from **your own** WhatsApp account. Clean multi-page UI, Google login, Google Contacts sync, message templates, smart AI auto-reply, connection history, and strict anti-ban rate limiting.

> ⚠️ **Use responsibly.** This automates a personal/business WhatsApp account and can get your number **banned** if misused. Only message people who expect to hear from you, and follow the built-in Terms & rate limits. See [`terms and conditions.txt`](./terms%20and%20conditions.txt) and the in-app `/terms` page.

**Powered by SUGGO · [srxdiamonds.com](https://srxdiamonds.com)**

---

## ✨ Features

- **Desktop app** — opens as a normal Windows app; the backend server **auto-starts** when you open it (no terminal needed). Also works as a plain web app in the browser.
- **Clean multi-page UI** — a compact top bar with a **profile menu** that opens separate pages:
  - **🏠 Home** — Excel & Message + Auto-Reply + Start (the only things you need for a send).
  - **👤 Profile & WhatsApp** — account info, WhatsApp connection (QR / logged-in / disconnect), and **sending settings** (rate limit).
  - **📊 Campaign Info** — live progress, sent/failed counters, and the profile grid of everyone you've messaged.
  - **🔌 Connections** — how many times WhatsApp connected/disconnected, with time (persisted).
  - **📜 Logs** — full real-time activity log.
- **Refresh-safe** — logs and campaign progress are buffered on the server and **restored after a refresh** (nothing disappears).
- **Multi-user** — each user logs in and connects **their own** WhatsApp (separate session per user).
- **Login / Register** — Email + Password (bcrypt) and **Continue with Google** (OAuth). Show/hide password.
- **Persistent sessions** — stays logged in across restarts (custom JSON session store, ~30 days).
- **Google Contacts** — save uploaded numbers (name + number) to your Google Contacts, or delete them.
- **Message templates + spintax** — rotate multiple templates (`---` separated) and `{A|B|C}` word variations so every message is unique (anti-ban).
- **AI (Gemini)** — optional smart features with **automatic multi-model fallback** (if one model's quota is out, it switches to the next automatically):
  - **Smart auto-reply** — reads the customer's message and writes a short, human-sounding reply.
  - **Template generator** — writes detailed, non-spammy intro templates for you.
- **Anti-ban rate limit** — max **15 messages/hour** (configurable, hard-capped at 20), evenly spread with a random gap; bursts are impossible.
- **Negative-reply filter** — replies like "not interested", "no thanks", "band karo" get **no auto-reply**; instead they're saved to a **Not-Interested list** you can download as `.xlsx` (Name + Number + Message + Time). Real phone number is resolved even for WhatsApp `@lid` senders.
- **Disconnect WhatsApp** — unlink from the app anytime (button); a fresh QR appears. Logging out from the phone also triggers a new QR automatically. Network blips auto-reconnect.
- **Result export** — download a result `.xlsx` with per-number status.
- **Themes** — LooksGood (light), Midnight (dark purple), WhatsApp (dark green). Remembered per browser.
- **Terms & Conditions** — in-app `/terms` page + agreement checkbox on register.

---

## 🧱 Tech stack

- **Electron** (desktop shell, auto-starts the server)
- **Node.js** + **Express** + **Socket.IO** (real-time)
- **whatsapp-web.js** (WhatsApp automation via headless Chrome / Puppeteer)
- **express-session** + a small custom JSON session store (`sessionStore.js`, Windows-safe)
- **passport-google-oauth20** + **googleapis** (Google login + People API / Contacts)
- **Google Gemini** (REST, multi-model fallback) — optional
- **xlsx** (Excel), **bcryptjs**, **qrcode**

---

## ✅ Prerequisites

- **Node.js 18+** (tested on Node 24)
- **Google Chrome** installed (Puppeteer uses your system Chrome)
  - Default path used: `C:\Program Files\Google\Chrome\Application\chrome.exe` (edit `CHROME_PATH` in `server.js` if different)
- A WhatsApp account on your phone (preferably an **old, trusted** number / WhatsApp Business)

---

## 🚀 Installation

```bash
# 1. Clone
git clone https://github.com/sunnysrxddiamondjwlrs-ops/whatsapp-msg-sender.git
cd whatsapp-msg-sender

# 2. Install dependencies (also downloads the Electron runtime)
npm install

# 3. Create your .env from the example
cp .env.example .env     # (Windows: copy .env.example .env)
# then edit .env with your keys
```

---

## ▶️ Running

| Command | What it does |
|---|---|
| `npm run app` | **Desktop app** — opens a window; server auto-starts inside it |
| `npm start` | Web app only → open `http://localhost:3000` in a browser |
| `npm run cli` | Simple command-line sender (no UI) |

Then **register / log in**, connect your WhatsApp (QR), and follow the on-screen steps.

---

## 📦 Building a Windows installer (.exe)

```bash
npm run release   # bumps the version, then builds the installer
# or:
npm run dist      # builds without bumping the version
```

The installer appears in **`dist/`** as `WhatsApp Bulk Sender-Setup-<version>.exe`.

**Updates:** because the app id is stable and `npm run release` bumps the version each time, running a newer installer **replaces the previously installed version in place** (no side-by-side copies). Your data (WhatsApp sessions, settings, history) lives in the user's AppData and is **preserved** across updates.

### App icon

Put a **256×256 (or larger)** Windows icon at **`build/icon.ico`**. It is used automatically for the window, taskbar, installer, and desktop shortcut. (A default SRX Diamonds icon is included; replace the file to use your own.)

---

## 🔧 Configuration (`.env`)

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Any random string (keeps login sessions secure) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials (optional — leave blank to disable Google login) |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3000/auth/google/callback` |
| `GEMINI_API_KEY` | Google Gemini key for AI features (optional — leave blank to disable) |
| `GEMINI_MODEL` | Comma-separated model list; if the first is quota-exhausted the app auto-switches to the next |

### Enabling Google login + Google Contacts (optional)

1. Go to <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → Library → enable "People API"** (needed to save contacts).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.**
4. Under **Authorized redirect URIs** add: `http://localhost:3000/auth/google/callback`
5. Copy the **Client ID** and **Client secret** into `.env`.
6. On the **OAuth consent screen**, add your Gmail under **Test users** (while the app is in Testing mode).

### Enabling AI (optional)

1. Get a free key at <https://aistudio.google.com/apikey>.
2. Put it in `GEMINI_API_KEY`. Leave blank to disable AI (fixed-template auto-reply still works).

> Email/Password login and fixed-template auto-reply work without any Google/Gemini setup.

---

## 📖 How to use

1. **Login / Register** (Email+Password or Google).
2. **Profile → Connect WhatsApp** — scan the QR with your phone (Settings → Linked Devices → Link a Device). Scanned **once**; the session is saved.
3. **Home → Upload `.xlsx`** — the app auto-detects the phone column (`Phone`, `Number`, `Mobile`, …) and an optional name column (`Name`, `Naam`, …).
4. *(Optional)* **Save to Google Contacts** — pushes name + number to your Google account.
5. **Write your message** — type it, load from `message.txt`, or **Generate with AI**. Use templates + spintax:
   ```
   Hi {there|friend}
   First template...
   ---
   Namaste
   Second template with {great|amazing} value
   ```
6. *(Optional)* **Auto-Reply** — turn it on (and AI mode if you want). Negative/not-interested replies are skipped and collected in the **Not-Interested list**.
7. **Profile → Sending Settings** — set messages/hour (default 15) and optional daily limit.
8. **Start Sending** — you're taken to **Campaign Info** to watch live progress; **download the result `.xlsx`** when done.

> Tip (desktop app): just close the window to quit — WhatsApp's background browser is closed cleanly for you.

### Excel format

| Phone | Name (optional) |
|---|---|
| 9000000001 | Example One |
| 9000000002 | Example Two |

Numbers can be with or without country code — short numbers get the **Default country code** (UI field, default `91`).

---

## 🛡️ Anti-ban rules (important)

- Max **15 messages/hour** by default, spread evenly with a random ~4-minute gap. Hard-capped at 20/hour.
- Use an **old, trusted** WhatsApp number; warm up new volume over 30–45 days.
- **Don't blast from a freshly-linked device** — link, wait, send a couple of test messages, then scale up.
- Keep **only one** WhatsApp Web session open for that number to avoid conflicts.
- Only message people who expect your message — reports and behavioral AI cause bans. Rate limiting removes the *speed* red flag, not the *report* one.

Full rules are shown in the app at **`/terms`** and in [`terms and conditions.txt`](./terms%20and%20conditions.txt).

---

## 📁 Project structure

```
├── electron-main.js       # Electron entry: auto-starts server + opens the desktop window
├── server.js              # Main server: auth, per-user WhatsApp, sending, Google, AI, negatives, history
├── sessionStore.js        # Windows-safe JSON session store (persistent login)
├── store.js               # JSON file store (users, Google tokens, settings, connection history)
├── index.js               # Simple CLI sender (no UI)
├── message.txt            # Message templates (--- separated, spintax supported)
├── views/
│   ├── index.html         # Main dashboard (multi-page SPA)
│   ├── login.html         # Login / Register page
│   └── terms.html         # Terms & Conditions page
├── build/icon.ico         # App icon (256x256)
├── .env.example           # Sample env (copy to .env)
├── package.json
│
│  # created at runtime, NOT committed:
├── data/                  # users db, sessions.json, negatives/, connection history
├── .wwebjs_auth/          # saved WhatsApp sessions (session-<userId> per user)
├── results/  uploads/     # generated result xlsx / temp uploads
└── dist/                  # built installer output
```

---

## 🔒 Not committed (see `.gitignore`)

`.env`, `node_modules/`, `data/`, `.wwebjs_auth/`, `.wwebjs_cache/`, `results/`, `uploads/`, `dist/`, `numbers.xlsx`, logs — these hold secrets, WhatsApp sessions, user data, or are large/generated.

---

## ⚖️ Disclaimer

Provided **as is**, for legitimate, consent-based business communication only. The authors are **not responsible** for any WhatsApp account restriction, suspension, or ban resulting from misuse. Comply with WhatsApp's Terms of Service and all applicable anti-spam laws in your region.

**Powered by SUGGO · [srxdiamonds.com](https://srxdiamonds.com)**
