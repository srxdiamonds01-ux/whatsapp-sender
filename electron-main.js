// Electron main process — app khulte hi backend server chalu karta hai
// aur ek desktop window me http://localhost:3000 load karta hai.
const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

const PORT = 3000;
const APP_URL = `http://localhost:${PORT}`;
// App icon: build/icon.ico daalo to window + taskbar me wahi dikhega (na ho to default)
const ICON_PATH = path.join(__dirname, "build", "icon.ico");
const APP_ICON = fs.existsSync(ICON_PATH) ? ICON_PATH : undefined;
let win = null;
let serverShutdown = null; // server.js se aata hai (WhatsApp browsers band karne ke liye)

// Sirf ek hi instance chale (dusri baar khola to purani window focus ho)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  main();
}

function main() {
  // Writable data (uploads/results/data/.wwebjs_auth/.wwebjs_cache) userData me jaye
  // taaki installed app (read-only Program Files) me bhi kaam kare.
  const userDataDir = app.getPath("userData");
  try { process.chdir(userDataDir); } catch (_) {}
  process.env.WA_DATA_DIR = userDataDir;

  // Backend server in-process start (server.js khud listen karta hai)
  try {
    const srv = require(path.join(__dirname, "server.js"));
    if (srv && typeof srv.shutdown === "function") serverShutdown = srv.shutdown;
  } catch (e) {
    dialog.showErrorBox("Server start nahi hua", String(e && e.stack || e));
  }

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null); // default File/Edit/View menu bar hatao (clean software feel)
    waitForServer(() => createWindow());
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

// Server ready hone tak (URL respond kare) ruko, phir window kholo
function waitForServer(cb, tries = 0) {
  const req = http.get(APP_URL + "/config", (res) => { res.resume(); cb(); });
  req.on("error", () => {
    if (tries > 150) return cb(); // ~30s baad bhi try karo (warna kabhi na khule)
    setTimeout(() => waitForServer(cb, tries + 1), 200);
  });
}

function createWindow() {
  if (win) { win.focus(); return; }
  win = new BrowserWindow({
    width: 1120,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: "WhatsApp Bulk Sender",
    icon: APP_ICON, // build/icon.ico (window + taskbar icon)
    backgroundColor: "#faf5ff",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  win.once("ready-to-show", () => win.show());

  // External links (Terms, srxdiamonds.com, Google) default browser me kholo,
  // localhost hamesha app-window me hi rahe.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => { win = null; });
  win.loadURL(APP_URL);
}

// Saari windows band -> app quit (before-quit me WhatsApp browsers safai se band honge)
app.on("window-all-closed", () => app.quit());

// Quit se pehle WhatsApp/Chrome browsers cleanly band karo (orphan Chrome na bache)
let quitting = false;
app.on("before-quit", async (e) => {
  if (quitting || !serverShutdown) return;
  e.preventDefault();
  quitting = true;
  try { await serverShutdown({ exit: false }); } catch (_) {}
  app.exit(0);
});
