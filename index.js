const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// ================== CONFIGURATION ==================
const EXCEL_INPUT = "numbers.xlsx";
const EXCEL_OUTPUT = "numbers_result.xlsx";

// Message ab is text file se aata hai (xlsx ke Message column se NAHI).
// Yahi message sabhi numbers ko jayega. Message badalna ho to sirf message.txt edit karo.
const MESSAGE_FILE = "message.txt";

const PHONE_COLUMN = "Phone";

// Default country code SIRF un numbers ke liye jinme code nahi hai.
// Agar Excel me number pehle se poora (country code ke sath) hai to yeh IGNORE ho jata hai.
// Koi country limit nahi -> koi bhi desh ka number chalega.
const DEFAULT_COUNTRY_CODE = "91";

// Fast sending ke liye har message ke beech delay (ms). Ban se bachne ke liye rakha hai.
const DELAY_MS = 1500;
// ===================================================

// ---- Number ko WhatsApp format me lao (bina country limit ke) ----
function normalizePhone(raw) {
  let n = String(raw).replace(/\D/g, ""); // sirf digits
  if (!n) return null;

  // Agar number chhota hai (national format, e.g. 10 digit) -> default country code lagao.
  // Agar pehle se lamba hai (already country code hai) -> as-is use karo. Koi country lock nahi.
  if (n.length <= 10) {
    n = DEFAULT_COUNTRY_CODE + n;
  }
  return n;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Message text file se padho ----
if (!fs.existsSync(path.resolve(MESSAGE_FILE))) {
  console.error(`❌ "${MESSAGE_FILE}" nahi mila. Ek message.txt banao aur usme apna message likho.`);
  process.exit(1);
}
const MESSAGE_TEXT = fs.readFileSync(path.resolve(MESSAGE_FILE), "utf8").trim();
if (!MESSAGE_TEXT) {
  console.error(`❌ "${MESSAGE_FILE}" khali hai. Usme message likho.`);
  process.exit(1);
}

// ---- Excel padho (sirf phone numbers ke liye) ----
const wbIn = XLSX.readFile(path.resolve(EXCEL_INPUT));
const sheetName = wbIn.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wbIn.Sheets[sheetName], { defval: "" });

if (rows.length === 0) {
  console.error("❌ Excel khali hai.");
  process.exit(1);
}
if (!(PHONE_COLUMN in rows[0])) {
  console.error(`❌ "${PHONE_COLUMN}" column nahi mila. Columns: ${Object.keys(rows[0]).join(", ")}`);
  process.exit(1);
}

// ---- WhatsApp Client (LocalAuth = ek baar login, dobara QR nahi) ----
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
  puppeteer: {
    headless: false, // pehli baar QR dekhne ke liye. Baad me true kar sakte ho.
    // System ka installed Chrome use karo (puppeteer ka apna Chrome download nahi karna padta).
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("\n📱 QR Code scan karo (sirf pehli baar):\n");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("🔐 Login session save ho gaya. Agli baar QR nahi maangega.");
});

client.on("ready", async () => {
  console.log("\n✅ WhatsApp ready! Sending shuru...\n");

  let sent = 0,
    failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const phone = normalizePhone(row[PHONE_COLUMN]);
    const msg = MESSAGE_TEXT; // message.txt se, sabhi numbers ko same

    process.stdout.write(`${i + 1}/${rows.length} → ${phone} ... `);

    if (!phone) {
      row.Status = "Invalid number ❌";
      failed++;
      console.log(row.Status);
      continue;
    }

    try {
      // Verify karo ki number WhatsApp par hai (real status)
      const numberId = await client.getNumberId(phone);
      if (!numberId) {
        row.Status = "Not on WhatsApp ❌";
        failed++;
        console.log(row.Status);
        continue;
      }

      await client.sendMessage(numberId._serialized, msg);
      row.Status = "Sent ✅";
      sent++;
      console.log(row.Status);
    } catch (err) {
      row.Status = "Failed ❌";
      failed++;
      console.log(`Failed ❌ (${String(err.message).slice(0, 60)})`);
    }

    await sleep(DELAY_MS);
  }

  // ---- Result Excel save karo ----
  const wbOut = XLSX.utils.book_new();
  const wsOut = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wbOut, wsOut, "Result");
  XLSX.writeFile(wbOut, path.resolve(EXCEL_OUTPUT));

  console.log(`\n🎉 Done!  Sent: ${sent}  |  Failed: ${failed}`);
  console.log(`📄 Result saved: ${EXCEL_OUTPUT}`);

  await client.destroy();
  process.exit(0);
});

client.on("auth_failure", (m) => console.error("❌ Auth failure:", m));
client.on("disconnected", (r) => console.error("⚠️  Disconnected:", r));

console.log("⏳ WhatsApp connect ho raha hai...");
client.initialize();
