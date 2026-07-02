require("dotenv").config();

// Safety net: ek stray error (jaise socket abort race) se poora server na gire
process.on("uncaughtException", (e) => console.error("⚠️ uncaughtException:", e && e.message));
process.on("unhandledRejection", (e) => console.error("⚠️ unhandledRejection:", e && e.message));

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const JsonSessionStore = require("./sessionStore");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const bcrypt = require("bcryptjs");
const { google } = require("googleapis");
const multer = require("multer");
const XLSX = require("xlsx");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");
const store = require("./store");

// ================== CONFIGURATION ==================
const PORT = 3000;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const UPLOAD_DIR = path.resolve("uploads");
const RESULTS_DIR = path.resolve("results");
const VIEWS = path.join(__dirname, "views");

const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_CB = process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback";
const googleEnabled = !!(GOOGLE_ID && GOOGLE_SECRET);
const GOOGLE_SCOPES = ["profile", "email", "https://www.googleapis.com/auth/contacts"];

const DEFAULT_AUTO_REPLY =
  "Thank you for your reply ! 😊\n\n" +
  "Our diamond jewelry expert will be available shortly and will get back to you as soon as possible.\n\n" +
  "In the meantime, if you have any specific requirements (design, carat, certification, or budget), please feel free to share them.\n\n" +
  "Thank you for choosing SRX Diamonds.";
// ===================================================

for (const d of [UPLOAD_DIR, RESULTS_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

function googleOAuthClient() {
  return new google.auth.OAuth2(GOOGLE_ID, GOOGLE_SECRET, GOOGLE_CB);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Session (file-store se persist -> server restart ke baad bhi login yaad rahe) ----
const sessionMiddleware = session({
  store: new JsonSessionStore(path.join("data", "sessions.json")),
  secret: process.env.SESSION_SECRET || "wa-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }, // 30 din (login itne din yaad)
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

// ---- Passport / Google OAuth ----
app.use(passport.initialize());
if (googleEnabled) {
  passport.use(
    new GoogleStrategy(
      { clientID: GOOGLE_ID, clientSecret: GOOGLE_SECRET, callbackURL: GOOGLE_CB },
      (accessToken, refreshToken, profile, done) => done(null, { profile, accessToken, refreshToken })
    )
  );
  console.log("🔵 Google login ENABLED");
} else {
  console.log("⚪ Google login OFF (credentials .env me daalo)");
}

// ---- Auth helpers ----
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: "Login required." });
}
function requireAuthPage(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect("/login");
}

// ================== AUTH ROUTES ==================
app.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.sendFile(path.join(VIEWS, "login.html"));
});
app.get("/config", (req, res) => res.json({ googleEnabled }));
app.get("/terms", (req, res) => res.sendFile(path.join(VIEWS, "terms.html")));

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email aur password zaroori hai." });
  if (String(password).length < 4) return res.status(400).json({ error: "Password kam se kam 4 characters." });
  if (store.findUserByEmail(email)) return res.status(409).json({ error: "Yeh email pehle se registered hai." });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = store.createUser({ email, name: name || email.split("@")[0], passwordHash });
  req.session.userId = user.id;
  res.json({ ok: true, user: store.publicUser(user) });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = store.findUserByEmail(email);
  if (!user || !user.passwordHash) return res.status(401).json({ error: "Galat email ya password." });
  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Galat email ya password." });
  req.session.userId = user.id;
  res.json({ ok: true, user: store.publicUser(user) });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

if (googleEnabled) {
  app.get(
    "/auth/google",
    // prompt: "consent" NAHI -> Google yaad rakhta hai, agli baar seedha login (baar-baar allow nahi).
    // accessType offline -> pehli baar refresh_token milta hai (callback usko save + preserve karta hai).
    passport.authenticate("google", { scope: GOOGLE_SCOPES, accessType: "offline", session: false })
  );
  app.get(
    "/auth/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: "/login" }),
    (req, res) => {
      const { profile: p, accessToken, refreshToken } = req.user;
      const googleId = p.id;
      const email = p.emails && p.emails[0] && p.emails[0].value;
      const name = p.displayName || (email ? email.split("@")[0] : "User");
      const avatar = p.photos && p.photos[0] && p.photos[0].value;

      let user =
        (req.session.userId && store.getUser(req.session.userId)) ||
        store.findUserByGoogleId(googleId) ||
        (email ? store.findUserByEmail(email) : null);

      const prevTokens = (user && user.googleTokens) || {};
      const googleTokens = {
        access_token: accessToken || prevTokens.access_token,
        refresh_token: refreshToken || prevTokens.refresh_token,
      };

      if (user) {
        user = store.updateUser(user.id, { googleId, avatar: avatar || user.avatar, name: user.name || name, googleTokens });
      } else {
        user = store.createUser({ email, name, googleId, avatar, googleTokens });
      }
      req.session.userId = user.id;
      res.redirect("/");
    }
  );
}

app.get("/me/user", requireAuth, (req, res) => res.json(store.publicUser(store.getUser(req.session.userId))));

// ================== PROTECTED APP ==================
app.get("/", requireAuthPage, (req, res) => res.sendFile(path.join(VIEWS, "index.html")));

// =================================================================
// ============= PER-USER WHATSAPP SESSIONS (multi-user) ===========
// =================================================================
const sessions = new Map(); // userId -> session object

function getSession(userId) {
  userId = String(userId);
  if (!sessions.has(userId)) {
    // Auto-reply setting user account se load karo (restart ke baad bhi yaad rahe)
    const saved = store.getUser(userId) || {};
    sessions.set(userId, {
      userId,
      client: null,
      waReady: false,
      lastQr: null,
      lastMe: null,
      isSending: false,
      currentRows: [],
      lastResultPath: null,
      // auto-reply (persisted)
      autoReply: saved.autoReply === true,
      autoReplyText: (typeof saved.autoReplyText === "string" && saved.autoReplyText.trim()) ? saved.autoReplyText : DEFAULT_AUTO_REPLY,
      messagedSet: new Set(), // jinko campaign me message bheja (chatId)
      autoRepliedSet: new Set(), // jinhe ek baar auto-reply de diya
      sendTimes: [], // pichle sends ke timestamps (per-hour cap ke liye)
    });
  }
  return sessions.get(userId);
}

function emitTo(userId, event, data) {
  io.to(String(userId)).emit(event, data);
}

// Stale Chrome lock files hatao (force-kill ke baad "browser already running" / EBUSY se bachne ke liye)
function clearStaleLocks(safeId) {
  const base = path.join(".wwebjs_auth", "session-" + safeId);
  for (const f of ["lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket", "first_party_sets.db-journal"]) {
    try { fs.rmSync(path.join(base, f), { force: true }); } catch (_) {}
  }
}

// Har user ka apna WhatsApp client (alag session folder: session-<userId>)
function initWhatsApp(userId) {
  const s = getSession(userId);
  if (s.client || s.initializing) return; // pehle se chal raha / ho raha hai (double-init guard)
  s.initializing = true;
  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
  clearStaleLocks(safeId); // purane orphan browser ke lock hatao

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: safeId, dataPath: ".wwebjs_auth" }),
    puppeteer: {
      headless: true,
      executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });
  s.client = client;

  client.on("qr", async (qr) => {
    s.waReady = false;
    s.lastQr = await QRCode.toDataURL(qr);
    emitTo(userId, "qr", s.lastQr);
    emitTo(userId, "status", { state: "qr", text: "QR scan karo (phone se)" });
  });
  client.on("authenticated", () => {
    s.lastQr = null;
    emitTo(userId, "status", { state: "auth", text: "Login ho gaya, session save..." });
  });
  client.on("ready", async () => {
    s.waReady = true;
    s.lastQr = null;
    s.initializing = false;
    emitTo(userId, "status", { state: "ready", text: "WhatsApp connected ✅" });
    emitTo(userId, "ready");
    try {
      const info = client.info;
      const wid = info.wid._serialized;
      let avatar = null;
      try {
        avatar = await client.getProfilePicUrl(wid);
      } catch (_) {}
      s.lastMe = { name: info.pushname || "WhatsApp User", number: "+" + info.wid.user, avatar: avatar || null };
      console.log(`👤 [${userId}] WhatsApp: ${s.lastMe.name} (${s.lastMe.number})`);
      emitTo(userId, "me", s.lastMe);
    } catch (e) {
      console.log("Account info nahi mili:", e.message);
    }
  });
  // Auto-reply: jab koi message kare to reply (ek baar per person)
  client.on("message", async (msg) => {
    try {
      const from = msg.from || "";
      console.log(`[${userId}] 📩 incoming from ${from}: "${String(msg.body || "").slice(0, 40)}" | autoReply=${s.autoReply}`);
      if (!s.autoReply) return; // toggle OFF
      if (msg.isStatus || msg.fromMe) return;
      // Groups / status / channels ko chhod do; 1-to-1 (@c.us aur naya @lid) allow
      if (from.endsWith("@g.us") || from.endsWith("@newsletter") || from === "status@broadcast") return;
      if (s.autoRepliedSet.has(from)) return; // ek hi baar per person
      if (!s.waReady) { console.log(`[${userId}] auto-reply skip: client not ready`); return; }

      console.log(`[${userId}] ↪ auto-reply try -> ${from}`);
      // msg.reply @lid aur @c.us dono ke liye sahi chat me bhejta hai (getChat se zyada reliable)
      await msg.reply(s.autoReplyText);
      s.autoRepliedSet.add(from); // sirf SUCCESS ke baad mark (fail par next msg retry ho sake)
      console.log(`[${userId}] 🤖 auto-reply sent to ${from}`);
      emitTo(userId, "log", { type: "info", text: `🤖 Auto-reply sent to ${from.replace(/@.*/, "")}` });
    } catch (e) {
      console.log(`[${userId}] auto-reply error:`, e && e.message);
    }
  });

  client.on("auth_failure", (m) => emitTo(userId, "status", { state: "error", text: "Auth failure: " + m }));
  client.on("disconnected", async (reason) => {
    console.log(`[${userId}] WhatsApp disconnected: ${reason}`);
    s.waReady = false;
    s.isSending = false; // agar sending chal rahi thi to turant roko (dead client par calls na jaye)
    // Manual disconnect (button) -> wo handler khud reinit karega, yahan double-handle mat karo
    if (s.manualLogout) return;
    s.lastMe = null;
    s.lastQr = null;
    s.initializing = false;

    // Phone se logout/unpair hua? (network blip nahi)
    const loggedOut = /LOGOUT|UNPAIRED|CONFLICT|TOS/i.test(String(reason));
    emitTo(userId, "status", {
      state: loggedOut ? "qr" : "error",
      text: loggedOut ? "WhatsApp logout ho gaya — naya QR aa raha hai..." : "WhatsApp disconnected (" + reason + ") — reconnecting...",
    });

    // Browser cleanly band karo -> lock release (EBUSY / "already running" se bachne ke liye)
    try { await client.destroy(); } catch (_) {}
    s.client = null;

    const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
    // Thoda ruk ke (browser poori tarah band ho jaye) -> phir naya QR / reconnect
    setTimeout(() => {
      if (loggedOut) {
        // logout par session clear -> whatsapp-web.js naya QR generate karega
        try { fs.rmSync(path.join(".wwebjs_auth", "session-" + safeId), { recursive: true, force: true }); } catch (_) {}
      }
      clearStaleLocks(safeId);
      initWhatsApp(userId);
    }, 3000);
  });

  console.log(`⏳ [${userId}] WhatsApp initialize ho raha hai...`);
  client.initialize().catch((e) => {
    s.initializing = false;
    s.client = null; // fail -> agli baar dobara try ho sake
    console.log(`[${userId}] init error:`, e.message);
  });
}

// ================== FILE UPLOAD / MESSAGE ==================
const upload = multer({ dest: UPLOAD_DIR });

function normalizePhone(raw, defaultCode) {
  let n = String(raw).replace(/\D/g, "");
  if (!n) return null;
  if (n.length <= 10) n = String(defaultCode || "") + n;
  return n;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ---- Message variation (anti-ban) ----
// "---" line par templates alag hote hain -> har number ko random ek milta hai
function splitTemplates(text) {
  return String(text)
    .split(/^\s*-{3,}\s*$/m)
    .map((t) => t.trim())
    .filter(Boolean);
}
// Spintax: {a|b|c} me se random ek chunta hai (nested bhi chalta hai)
function spin(text) {
  let out = String(text);
  const re = /\{([^{}]*)\}/;
  let m, guard = 0;
  while ((m = re.exec(out)) && guard++ < 2000) {
    const opts = m[1].split("|");
    const pick = opts[Math.floor(Math.random() * opts.length)];
    out = out.slice(0, m.index) + pick + out.slice(m.index + m[0].length);
  }
  return out;
}
// Ek recipient ke liye final message banao (random template + spintax)
function buildMessage(templates) {
  const t = templates.length === 1 ? templates[0] : templates[Math.floor(Math.random() * templates.length)];
  return spin(t);
}

app.post("/upload", requireAuth, upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Koi file nahi mili." });
    const wb = XLSX.readFile(req.file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    fs.unlink(req.file.path, () => {});
    if (!rows.length) return res.status(400).json({ error: "Excel khali hai." });

    const cols = Object.keys(rows[0]);
    const phoneCol = cols.find((c) => /^(phone|number|mobile|contact|whatsapp|no)$/i.test(c.trim())) || cols[0];
    // Name column auto-detect (phone column ko chhod ke)
    const nameCol = cols.find(
      (c) => c !== phoneCol && /^(name|full ?name|contact ?name|first ?name|customer|person|naam)$/i.test(c.trim())
    );

    const s = getSession(req.session.userId);
    s.currentRows = rows.map((r) => ({ ...r, __phone: r[phoneCol], __name: nameCol ? r[nameCol] : "" }));
    const preview = s.currentRows.slice(0, 5).map((r) => (r.__name ? `${r.__name} (${r.__phone})` : String(r.__phone)));
    res.json({ count: s.currentRows.length, phoneCol, nameCol: nameCol || null, columns: cols, preview });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/message-file", requireAuth, (req, res) => {
  const p = path.resolve("message.txt");
  if (!fs.existsSync(p)) return res.status(404).json({ error: "message.txt nahi mila." });
  try {
    res.json({ text: fs.readFileSync(p, "utf8") });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/download", requireAuth, (req, res) => {
  const s = getSession(req.session.userId);
  if (s.lastResultPath && fs.existsSync(s.lastResultPath)) res.download(s.lastResultPath, "numbers_result.xlsx");
  else res.status(404).send("Abhi koi result file nahi bani.");
});

// ================== GOOGLE CONTACTS ==================
app.get("/google/status", requireAuth, (req, res) => {
  const u = store.getUser(req.session.userId);
  const connected = !!(u && u.googleTokens && (u.googleTokens.refresh_token || u.googleTokens.access_token));
  res.json({ googleEnabled, connected });
});

app.post("/contacts/google", requireAuth, async (req, res) => {
  if (!googleEnabled) return res.status(400).json({ error: "Google login .env me configure nahi hai." });
  const s = getSession(req.session.userId);
  if (!s.currentRows.length) return res.status(400).json({ error: "Pehle xlsx upload karo." });

  const u = store.getUser(req.session.userId);
  if (!u || !u.googleTokens || !(u.googleTokens.refresh_token || u.googleTokens.access_token))
    return res.status(400).json({ error: "Google account connected nahi hai.", needConnect: true });

  try {
    const oauth = googleOAuthClient();
    oauth.setCredentials(u.googleTokens);
    const people = google.people({ version: "v1", auth: oauth });

    const seen = new Set();
    const contacts = [];
    for (const r of s.currentRows) {
      const phone = String(r.__phone || "").replace(/\D/g, "");
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      const name = String((r.__name && String(r.__name).trim()) || r.Name || r.name || phone);
      contacts.push({ contactPerson: { names: [{ givenName: name }], phoneNumbers: [{ value: "+" + phone }] } });
    }
    if (!contacts.length) return res.status(400).json({ error: "Koi valid number nahi mila." });

    let created = 0;
    for (let i = 0; i < contacts.length; i += 200) {
      const chunk = contacts.slice(i, i + 200);
      const resp = await people.people.batchCreateContacts({ requestBody: { contacts: chunk, readMask: "names,phoneNumbers" } });
      created += (resp.data.createdPeople || chunk).length;
    }

    const c = oauth.credentials || {};
    store.updateUser(u.id, {
      googleTokens: {
        access_token: c.access_token || u.googleTokens.access_token,
        refresh_token: c.refresh_token || u.googleTokens.refresh_token,
      },
    });

    res.json({ created, total: contacts.length });
  } catch (e) {
    const msg = (e.errors && e.errors[0] && e.errors[0].message) || e.message;
    res.status(500).json({ error: "Google save fail: " + msg });
  }
});

// Uploaded numbers ko Google Contacts se DELETE karo
app.post("/contacts/google/delete", requireAuth, async (req, res) => {
  if (!googleEnabled) return res.status(400).json({ error: "Google login .env me configure nahi hai." });
  const s = getSession(req.session.userId);
  if (!s.currentRows.length) return res.status(400).json({ error: "Pehle xlsx upload karo (jo numbers delete karne hain)." });

  const u = store.getUser(req.session.userId);
  if (!u || !u.googleTokens || !(u.googleTokens.refresh_token || u.googleTokens.access_token))
    return res.status(400).json({ error: "Google account connected nahi hai.", needConnect: true });

  try {
    const oauth = googleOAuthClient();
    oauth.setCredentials(u.googleTokens);
    const people = google.people({ version: "v1", auth: oauth });

    // Target numbers (last 10 digits se match, taaki country code ka farak na pade)
    const targets = new Set();
    for (const r of s.currentRows) {
      const d = String(r.__phone || "").replace(/\D/g, "");
      if (d) targets.add(d.slice(-10));
    }
    if (!targets.size) return res.status(400).json({ error: "Koi valid number nahi mila." });

    // Saare contacts list karo (pagination) aur matching dhundo
    const toDelete = [];
    let pageToken;
    do {
      const resp = await people.people.connections.list({
        resourceName: "people/me",
        pageSize: 1000,
        personFields: "phoneNumbers",
        pageToken,
      });
      for (const c of resp.data.connections || []) {
        for (const n of c.phoneNumbers || []) {
          const d = String(n.value || "").replace(/\D/g, "");
          if (d && targets.has(d.slice(-10))) {
            toDelete.push(c.resourceName);
            break;
          }
        }
      }
      pageToken = resp.data.nextPageToken;
    } while (pageToken);

    if (!toDelete.length) return res.json({ deleted: 0, matched: 0 });

    // batchDelete: max 500 per request
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += 500) {
      const chunk = toDelete.slice(i, i + 500);
      await people.people.batchDeleteContacts({ requestBody: { resourceNames: chunk } });
      deleted += chunk.length;
    }

    const c = oauth.credentials || {};
    store.updateUser(u.id, {
      googleTokens: {
        access_token: c.access_token || u.googleTokens.access_token,
        refresh_token: c.refresh_token || u.googleTokens.refresh_token,
      },
    });

    res.json({ deleted, matched: toDelete.length });
  } catch (e) {
    const msg = (e.errors && e.errors[0] && e.errors[0].message) || e.message;
    res.status(500).json({ error: "Delete fail: " + msg });
  }
});

// ================== Sending flow (per user) ==================
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_PER_HOUR = 15; // default: 1 ghante me 15 messages
const MAX_PER_HOUR = 20; // safety ceiling (isse upar allow nahi, ban se bachne ke liye)

// Interruptible wait: lambe wait ke dauraan Stop kaam kare (chhote chunks me sota hai)
async function waitInterruptible(s, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!s.isSending) return false; // Stop dab gaya
    await sleep(Math.min(3000, end - Date.now()));
  }
  return true;
}
function fmtDur(ms) {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), r = sec % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

async function startSending(userId, opts) {
  const s = getSession(userId);
  const { message, countryCode, perHour, dailyLimit } = opts;

  if (s.isSending) return emitTo(userId, "log", { type: "warn", text: "Pehle se sending chal rahi hai." });
  if (!s.waReady || !s.client) return emitTo(userId, "log", { type: "error", text: "WhatsApp connect nahi hua." });
  if (!s.currentRows.length) return emitTo(userId, "log", { type: "error", text: "Pehle xlsx upload karo." });
  if (!message || !message.trim()) return emitTo(userId, "log", { type: "error", text: "Message khali hai." });

  s.isSending = true;
  let sent = 0, failed = 0;
  const cap = dailyLimit && dailyLimit > 0 ? dailyLimit : s.currentRows.length;
  const total = Math.min(s.currentRows.length, cap);

  // Rate: messages per hour -> evenly spread + random. Hard ceiling MAX_PER_HOUR.
  let rate = Math.round(Number(perHour));
  if (!Number.isFinite(rate) || rate < 1) rate = DEFAULT_PER_HOUR;
  if (rate > MAX_PER_HOUR) rate = MAX_PER_HOUR;
  const gapMs = HOUR_MS / rate; // even spacing (e.g. 15/hr -> 4 min)
  const dMin = Math.round(gapMs * 0.75); // random ±25% taaki natural lage
  const dMax = Math.round(gapMs * 1.25);

  // Message templates (--- se alag) + spintax
  const templates = splitTemplates(message);

  emitTo(userId, "send-start", { total });
  emitTo(userId, "log", { type: "info", text: `Rate: ${rate} messages/hour — har message ke beech ~${fmtDur(gapMs)} (random ${fmtDur(dMin)}–${fmtDur(dMax)})` });
  emitTo(userId, "log", {
    type: "info",
    text: `Message templates: ${templates.length}${templates.length > 1 ? " (har number ko random ek jayega)" : ""}`,
  });

  for (let i = 0; i < s.currentRows.length; i++) {
    if (!s.isSending) { emitTo(userId, "log", { type: "warn", text: "Sending stop kar di gayi." }); break; }
    if (!s.client || !s.waReady) { emitTo(userId, "log", { type: "error", text: "WhatsApp disconnect ho gaya — sending ruk gayi." }); break; }
    if (i >= cap) { emitTo(userId, "log", { type: "warn", text: `Daily limit (${cap}) reach ho gaya.` }); break; }

    const row = s.currentRows[i];
    const phone = normalizePhone(row.__phone, countryCode);
    if (!phone) {
      row.Status = "Invalid ❌"; failed++;
      emitTo(userId, "progress", { index: i + 1, total, phone: String(row.__phone), status: row.Status });
      continue;
    }

    // HARD CAP: pichle 1 ghante me `rate` se zyada nahi. Limit hit -> slot free hone tak ruko.
    const now = Date.now();
    s.sendTimes = s.sendTimes.filter((t) => now - t < HOUR_MS);
    if (s.sendTimes.length >= rate) {
      const waitMs = s.sendTimes[0] + HOUR_MS - now;
      emitTo(userId, "log", { type: "warn", text: `⏸ Hourly limit ${rate} reached — waiting ${fmtDur(waitMs)}...` });
      if (!(await waitInterruptible(s, waitMs))) { emitTo(userId, "log", { type: "warn", text: "Sending stop kar di gayi." }); break; }
      s.sendTimes = s.sendTimes.filter((t) => Date.now() - t < HOUR_MS);
    }

    try {
      const numberId = await s.client.getNumberId(phone);
      if (!numberId) { row.Status = "Not on WhatsApp ❌"; failed++; }
      else {
        const finalMsg = buildMessage(templates); // random template + spintax
        await s.client.sendMessage(numberId._serialized, finalMsg);
        row.Status = "Sent ✅"; sent++;
        s.sendTimes.push(Date.now()); // hourly cap tracking
        s.messagedSet.add(numberId._serialized); // auto-reply ke liye track

        // Recipient ki profile (photo + naam) UI par dikhane ke liye
        let avatar = null;
        let cname = String(row.__name || "").trim();
        try { avatar = await s.client.getProfilePicUrl(numberId._serialized); } catch (_) {}
        if (!cname) {
          try {
            const c = await s.client.getContactById(numberId._serialized);
            cname = c.pushname || c.name || c.shortName || "";
          } catch (_) {}
        }
        emitTo(userId, "sent-profile", { number: "+" + phone, name: cname || "+" + phone, avatar: avatar || null });
      }
    } catch (e) { row.Status = "Failed ❌"; failed++; }

    emitTo(userId, "progress", { index: i + 1, total, phone, status: row.Status });

    // Next message tak evenly-spread random wait (Stop se turant ruk jayega)
    if (i < total - 1) {
      const w = rand(dMin, dMax);
      emitTo(userId, "log", { type: "info", text: `⏳ Next message in ~${fmtDur(w)}` });
      if (!(await waitInterruptible(s, w))) { emitTo(userId, "log", { type: "warn", text: "Sending stop kar di gayi." }); break; }
    }
  }

  const wbOut = XLSX.utils.book_new();
  const wsOut = XLSX.utils.json_to_sheet(s.currentRows.map(({ __phone, ...rest }) => rest));
  XLSX.utils.book_append_sheet(wbOut, wsOut, "Result");
  s.lastResultPath = path.join(RESULTS_DIR, String(userId).replace(/[^a-zA-Z0-9_-]/g, "") + ".xlsx");
  XLSX.writeFile(wbOut, s.lastResultPath);

  s.isSending = false;
  emitTo(userId, "done", { sent, failed });
}

// ---------- Socket wiring (per user) ----------
io.on("connection", (socket) => {
  const userId = socket.request.session && socket.request.session.userId;
  if (!userId) {
    socket.emit("status", { state: "error", text: "Login required." });
    return socket.disconnect(true);
  }
  socket.join(String(userId)); // user-specific room
  const s = getSession(userId);

  // is user ka current state bhejo
  socket.emit("status", {
    state: s.waReady ? "ready" : s.lastQr ? "qr" : "connecting",
    text: s.waReady ? "WhatsApp connected ✅" : s.lastQr ? "QR scan karo (phone se)" : "WhatsApp connect ho raha hai...",
  });
  if (s.waReady) socket.emit("ready");
  else if (s.lastQr) socket.emit("qr", s.lastQr);
  if (s.lastMe) socket.emit("me", s.lastMe);
  socket.emit("autoreply-state", { enabled: s.autoReply, text: s.autoReplyText });

  // pehli baar connect -> is user ka WhatsApp client shuru karo
  if (!s.client) initWhatsApp(userId);

  socket.on("start", (opts) => startSending(userId, opts));
  socket.on("stop", () => { s.isSending = false; });

  // Khud se WhatsApp disconnect -> unlink + naya QR
  socket.on("wa-logout", async () => {
    if (s.manualLogout) return; // pehle se ho raha hai
    s.manualLogout = true;
    s.isSending = false;
    emitTo(userId, "status", { state: "error", text: "WhatsApp disconnect kiya jaa raha hai..." });
    console.log(`[${userId}] manual WhatsApp logout`);
    try {
      if (s.client) {
        try { await s.client.logout(); } catch (_) {} // device unlink (phone ki linked-devices list se hatega)
        try { await s.client.destroy(); } catch (_) {} // browser band -> lock release
      }
    } catch (_) {}
    s.client = null;
    s.waReady = false;
    s.lastMe = null;
    s.lastQr = null;
    s.initializing = false;
    const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
    // Browser poori tarah band hone do, phir session clear + naya QR
    setTimeout(() => {
      try { fs.rmSync(path.join(".wwebjs_auth", "session-" + safeId), { recursive: true, force: true }); } catch (_) {}
      clearStaleLocks(safeId);
      s.manualLogout = false;
      initWhatsApp(userId); // naya QR
    }, 3000);
  });
  socket.on("autoreply-set", ({ enabled, text }) => {
    s.autoReply = !!enabled;
    if (typeof text === "string" && text.trim()) s.autoReplyText = text;
    // Account me save karo -> server restart ke baad bhi setting yaad rahe
    store.updateUser(userId, { autoReply: s.autoReply, autoReplyText: s.autoReplyText });
    emitTo(userId, "log", { type: "info", text: `Auto-reply ${s.autoReply ? "ON ✅" : "OFF"}` });
    emitTo(userId, "autoreply-state", { enabled: s.autoReply, text: s.autoReplyText });
  });
});

server.listen(PORT, () => {
  console.log(`\n🌐 Web app: http://localhost:${PORT}`);
  console.log("👥 Good To Go\n");
});

// Graceful shutdown: Ctrl+C par saare WhatsApp browsers band karo (orphan Chrome na bane)
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n🛑 Band ho raha hai — WhatsApp browsers close kar raha hun...");
  await Promise.all(
    [...sessions.values()].map(async (s) => {
      try { if (s.client) await s.client.destroy(); } catch (_) {}
    })
  );
  console.log("✅ Saaf band. Bye!");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
