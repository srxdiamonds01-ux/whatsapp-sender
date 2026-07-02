# WhatsApp Bulk Sender

A multi-user web app to send bulk WhatsApp messages from **your own** WhatsApp account, with a clean themed UI, Google login, Google Contacts sync, message templates, auto-reply, and strict anti-ban rate limiting.

> ⚠️ **Use responsibly.** This automates a personal/business WhatsApp account and can get your number **banned** if misused. Only message people who expect to hear from you, and follow the built-in Terms & rate limits. See [`terms and conditions.txt`](./terms%20and%20conditions.txt) and the in-app `/terms` page.

**Powered by SUGGO · [srxdiamonds.com](https://srxdiamonds.com)**

---

## ✨ Features

- **Web dashboard** — upload an `.xlsx`, scan a QR, and send. Numbers are read automatically.
- **Multi-user** — each user logs in and connects **their own** WhatsApp (separate session per user).
- **Login / Register** — Email + Password (bcrypt) and **Continue with Google** (OAuth). Show/hide password.
- **Persistent sessions** — stays logged in across server restarts (custom JSON session store, ~30 days).
- **Google Contacts** — save uploaded numbers (name + number) to your Google Contacts, or delete them.
- **Message templates + spintax** — rotate multiple templates (`---` separated) and `{A|B|C}` word variations so every message is unique (anti-ban).
- **Message source** — type in the UI or load from `message.txt`.
- **Anti-ban rate limit** — max **15 messages/hour** (configurable, hard-capped at 20), evenly spread with a random gap; bursts are impossible.
- **Smart Auto-reply** — auto-reply once to anyone who messages you (toggle on/off, editable text, **setting is saved**). Works concurrently while a bulk send is running.
- **Negative-reply filter** — replies like "not interested", "no thanks", "band karo" get **no auto-reply**; instead they're saved to a **Not-Interested list** you can download as `.xlsx` (Name + Number + Message + Time). Real phone number is resolved even for WhatsApp `@lid` senders.
- **Messaged Contacts** — live grid of the profile photo + name of everyone you've messaged this run.
- **Disconnect WhatsApp** — unlink from the app anytime (button); a fresh QR appears. Logging out from the phone also triggers a new QR automatically. Network blips auto-reconnect.
- **Live progress** — real-time log, sent/failed counters, next-message countdown.
- **Result export** — download a result `.xlsx` with per-number status.
- **Themes** — LooksGood (light), Midnight (dark purple), WhatsApp (dark green). Remembered per browser.
- **Terms & Conditions** — in-app `/terms` page + agreement checkbox on register.

---

## 🧱 Tech stack

- **Node.js** + **Express** + **Socket.IO** (real-time)
- **whatsapp-web.js** (WhatsApp automation via headless Chrome / Puppeteer)
- **express-session** + a small custom JSON session store (`sessionStore.js`, Windows-safe, no EPERM file-lock issues)
- **passport-google-oauth20** + **googleapis** (Google login + People API / Contacts)
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

# 2. Install dependencies
npm install

# 3. Create your .env from the example
cp .env.example .env     # (Windows: copy .env.example .env)
# then edit .env
```

---

## 🔧 Configuration (`.env`)

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Any random string (keeps login sessions secure) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (optional — leave blank to disable Google login) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3000/auth/google/callback` |

### Enabling Google login + Google Contacts (optional)

1. Go to <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → Library → enable "People API"** (needed to save contacts).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.**
4. Under **Authorized redirect URIs** add: `http://localhost:3000/auth/google/callback`
5. Copy the **Client ID** and **Client secret** into `.env`.
6. On the **OAuth consent screen**, add your Gmail under **Test users** (while the app is in Testing mode).
7. Restart the server.

> Email/Password login works without any Google setup.

---

## ▶️ Running

```bash
npm start          # web app  ->  http://localhost:3000
# or the simple CLI version (no UI):
npm run cli
```

Then open **http://localhost:3000**, register / log in, and follow the on-screen steps.

---

## 📖 How to use

1. **Login / Register** (Email+Password or Google).
2. **Connect WhatsApp** — scan the QR with your phone (Settings → Linked Devices → Link a Device). Scanned **once**; the session is saved.
3. **Upload `.xlsx`** — the app auto-detects the phone column (`Phone`, `Number`, `Mobile`, …) and an optional name column (`Name`, `Naam`, …).
4. *(Optional)* **Save to Google Contacts** — pushes name + number to your Google account (syncs to your phone).
5. **Write your message** — type it, or load from `message.txt`. Use templates + spintax for variation:
   ```
   Hi {there|friend} 👋
   First template...
   ---
   Namaste 🙏
   Second template...
   ```
6. **Set "Messages per hour"** (default 15) and optional daily limit, then **Start Sending**.
7. Watch **live progress** (sent/failed + messaged-contact photos); **download the result `.xlsx`** when done.
8. *(Optional)* **Auto-Reply** — turn it on and edit the text; it's saved to your account. Negative/not-interested replies are skipped and collected in the **Not-Interested list** (downloadable `.xlsx`).
9. *(Optional)* **Disconnect WhatsApp** (button) to switch to a different number — a new QR appears.

> Tip: stop the server with **Ctrl+C** (not by force-closing the window) so the WhatsApp browser closes cleanly.

### Excel format

| Phone | Name (optional) |
|---|---|
| 9631348904 | Sunny Kumar |
| 6200430971 | Ravi |

Numbers can be with or without country code — short numbers get the **Default country code** (UI field, default `91`).

---

## 🛡️ Anti-ban rules (important)

- Max **15 messages/hour** by default, spread evenly with a random ~4-minute gap. Hard-capped at 20/hour.
- Use an **old, trusted** WhatsApp number; warm up new volume over 30–45 days.
- **Don't blast from a freshly-linked device** — link, wait, send a couple of test messages, then scale up. Fresh-device automation can trigger an instant `LOGOUT`.
- Keep **only one** WhatsApp Web session open for that number (close `web.whatsapp.com` elsewhere) to avoid conflicts.
- Only message people who expect your message — reports and behavioral AI cause bans. Rate limiting removes the *speed* red flag, not the *report* one.

Full rules are shown in the app at **`/terms`** and in [`terms and conditions.txt`](./terms%20and%20conditions.txt).

---

## 📁 Project structure

```
├── server.js              # Main server: auth, per-user WhatsApp, sending, Google, auto-reply, negatives
├── sessionStore.js        # Windows-safe JSON session store (persistent login)
├── store.js               # JSON file store (users + Google tokens + auto-reply setting)
├── index.js               # Simple CLI sender (no UI)
├── message.txt            # Message templates (--- separated, spintax supported)
├── views/
│   ├── index.html         # Main dashboard UI
│   ├── login.html         # Login / Register page
│   └── terms.html         # Terms & Conditions page
├── start-server.bat       # Windows helper to launch the server
├── .env.example           # Sample env (copy to .env)
├── package.json
│
│  # created at runtime, NOT committed:
├── data/                  # users db, sessions.json, negatives/  (tokens, settings)
├── .wwebjs_auth/          # saved WhatsApp sessions (session-<userId> per user)
├── results/  uploads/     # generated result xlsx / temp uploads
```

---

## 🔒 Not committed (see `.gitignore`)

`.env`, `node_modules/`, `data/`, `.wwebjs_auth/`, `.wwebjs_cache/`, `results/`, `uploads/`, `numbers.xlsx`, logs — these hold secrets, WhatsApp sessions, user data, or are large/generated.

---

## ⚖️ Disclaimer

Provided **as is**, for legitimate, consent-based business communication only. The authors are **not responsible** for any WhatsApp account restriction, suspension, or ban resulting from misuse. Comply with WhatsApp's Terms of Service and all applicable anti-spam laws in your region.

**Powered by SUGGO · [srxdiamonds.com](https://srxdiamonds.com)**
