// Simple, Windows-safe session store for express-session.
// Sessions in-memory + ek single JSON file me persist (no per-file rename -> no EPERM flood).
const session = require("express-session");
const fs = require("fs");
const path = require("path");

class JsonSessionStore extends session.Store {
  constructor(file) {
    super();
    this.file = file;
    this.sessions = {};
    this._timer = null;
    try {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(file)) this.sessions = JSON.parse(fs.readFileSync(file, "utf8")) || {};
    } catch {
      this.sessions = {};
    }
  }

  _expired(s) {
    const exp = s && s.cookie && s.cookie.expires;
    return exp ? Date.now() > new Date(exp).getTime() : false;
  }

  // debounced single-file write (crash-safe enough for local single-process use)
  _save() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      try {
        fs.writeFileSync(this.file, JSON.stringify(this.sessions));
      } catch (e) {
        /* ignore transient write errors */
      }
    }, 400);
  }

  get(sid, cb) {
    const s = this.sessions[sid];
    if (!s) return cb(null, null);
    if (this._expired(s)) {
      delete this.sessions[sid];
      this._save();
      return cb(null, null);
    }
    cb(null, JSON.parse(JSON.stringify(s)));
  }

  set(sid, sess, cb) {
    this.sessions[sid] = sess;
    this._save();
    if (cb) cb(null);
  }

  destroy(sid, cb) {
    delete this.sessions[sid];
    this._save();
    if (cb) cb(null);
  }

  touch(sid, sess, cb) {
    if (this.sessions[sid]) {
      this.sessions[sid].cookie = sess.cookie;
      this._save();
    }
    if (cb) cb(null);
  }
}

module.exports = JsonSessionStore;
