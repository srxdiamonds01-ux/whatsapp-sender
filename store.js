// Simple JSON-file based store for users + saved contacts
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve("data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], contacts: {} }, null, 2));
  }
}
function read() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { users: [], contacts: {} };
  }
}
function write(db) {
  ensure();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------- Users ----------
function findUserByEmail(email) {
  if (!email) return null;
  const db = read();
  return db.users.find((u) => u.email && u.email.toLowerCase() === email.toLowerCase()) || null;
}
function findUserByGoogleId(googleId) {
  const db = read();
  return db.users.find((u) => u.googleId === googleId) || null;
}
function getUser(id) {
  const db = read();
  return db.users.find((u) => u.id === id) || null;
}
function createUser({ email, name, passwordHash = null, googleId = null, avatar = null, googleTokens = null }) {
  const db = read();
  const id = "u_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  const user = { id, email: email || null, name: name || "User", passwordHash, googleId, avatar, googleTokens };
  db.users.push(user);
  write(db);
  return user;
}
function updateUser(id, patch) {
  const db = read();
  const u = db.users.find((x) => x.id === id);
  if (!u) return null;
  Object.assign(u, patch);
  write(db);
  return u;
}

// public-safe view (no passwordHash)
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatar: u.avatar,
    google: !!u.googleId,
    googleContacts: !!(u.googleTokens && (u.googleTokens.refresh_token || u.googleTokens.access_token)),
  };
}

// ---------- Contacts (saved numbers per user) ----------
function getContacts(userId) {
  const db = read();
  return db.contacts[userId] || [];
}
function saveContacts(userId, list) {
  // list: [{ name, phone }]  -> merge, de-duplicate by phone
  const db = read();
  const existing = db.contacts[userId] || [];
  const seen = new Set(existing.map((c) => c.phone));
  let added = 0;
  for (const item of list) {
    const phone = String(item.phone || "").replace(/\D/g, "");
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    existing.push({ name: item.name || "", phone, savedAt: Date.now() });
    added++;
  }
  db.contacts[userId] = existing;
  write(db);
  return { added, total: existing.length };
}
function clearContacts(userId) {
  const db = read();
  db.contacts[userId] = [];
  write(db);
}

module.exports = {
  findUserByEmail,
  findUserByGoogleId,
  getUser,
  createUser,
  updateUser,
  publicUser,
  getContacts,
  saveContacts,
  clearContacts,
};
