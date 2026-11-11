// Eski uygulama yedeğini (yedek/ev-butcesi-*.json, depo dışı) v3 verisine çevirir ve simülatördeki Capacitor
// uygulamasının yerel depolamasına (WKWebView localStorage) yazar; uygulamayı yeniden açıp ekran görüntüsü alır.
// Böylece tüm ekranlar gerçek yedek verisiyle dolu görülür. Yalnız simülatör içindir; buluta ve gerçek cihaza dokunmaz.
//
// Kullanım: node scripts/yedek-simulator.mjs [--udid <udid>] [--kaydir <ay>] [--dosya yedek/x.json] [--shot logs/x.png]
//   --kaydir N : yedekteki tüm tarihleri N ay ileri alır (varsayılan 0). Yedek eski bir aya aitse ekranların
//                "bu dönem" ile dolu görünmesi için kullanılır; demo amaçlıdır, tutarlar değişmez.
// Önkoşul: uygulama simülatöre en az bir kez yüklenmiş olmalı (npm run ios:sim).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convertLegacy, isLegacyData } from "../src/v3/legacyImport.js";
import { daysInMonth } from "../src/core/period.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const appId = JSON.parse(readFileSync(join(root, "capacitor.config.json"), "utf8")).appId;
const shift = Number(opt("--kaydir", 0)) || 0;
const shot = opt("--shot", join(root, "logs", "ios-sim-yedek.png"));
const out = (cmd, a) => execFileSync(cmd, a, { cwd: root }).toString();

// Yedek dosyası: verilen ya da yedek/ altındaki en yeni.
let file = opt("--dosya", null);
if (!file) {
  const dir = join(root, "yedek");
  const names = existsSync(dir) ? readdirSync(dir).filter(n => n.endsWith(".json")).sort() : [];
  if (!names.length) { console.error("yedek/ klasöründe yedek dosyası yok (ev-butcesi-*.json)."); process.exit(1); }
  file = join(dir, names.at(-1));
}
const data = JSON.parse(readFileSync(file, "utf8"));
if (!isLegacyData(data)) { console.error("Dosya eski uygulama yedeği değil: " + file); process.exit(1); }

// Tarih kaydırma: "YYYY-MM" ve "YYYY-MM-DD" metinleri N ay ileri alınır (gün ay sonuna kırpılır).
const pad = n => String(n).padStart(2, "0");
const shiftDate = s => {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (!m || !shift) return s;
  const t = Number(m[1]) * 12 + (Number(m[2]) - 1) + shift;
  const y = Math.floor(t / 12), mo = (t % 12) + 1;
  return m[3] ? `${y}-${pad(mo)}-${pad(Math.min(Number(m[3]), daysInMonth(y, mo)))}` : `${y}-${pad(mo)}`;
};
const walk = v => Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [shiftDate(k), walk(x)])) : typeof v === "string" ? shiftDate(v) : v;
const shifted = walk(data);

const today = new Date().toISOString().slice(0, 10);
const { state, counts, warnings } = convertLegacy(shifted, { today });
console.log(`Dönüştürüldü: ${counts.accounts} hesap, ${counts.obligations} düzenli ödeme / taksit, ${counts.transactions} işlem${shift ? ` · tarihler ${shift} ay kaydırıldı` : ""}`);
for (const w of warnings) console.log("  uyarı:", w);

// Simülatör ve uygulama kapsayıcısı.
const udid = opt("--udid", null) || (() => {
  const devs = JSON.parse(out("xcrun", ["simctl", "list", "devices", "booted", "-j"])).devices;
  const d = Object.values(devs).flat()[0];
  if (!d) { console.error("Açık simülatör yok; önce npm run ios:sim çalıştırın."); process.exit(1); }
  return d.udid;
})();
spawnSync("xcrun", ["simctl", "terminate", udid, appId], { stdio: "ignore" });
const container = out("xcrun", ["simctl", "get_app_container", udid, appId, "data"]).trim();
const findDb = () => {
  const base = join(container, "Library", "WebKit", appId, "WebsiteData", "Default");
  if (!existsSync(base)) return null;
  for (const a of readdirSync(base)) for (const b of (existsSync(join(base, a)) && readdirSync(join(base, a)).filter(x => existsSync(join(base, a, x, "LocalStorage"))))) {
    const p = join(base, a, b, "LocalStorage", "localstorage.sqlite3");
    if (existsSync(p)) return p;
  }
  return null;
};
let db = findDb();
if (!db) {
  // Uygulama hiç açılmadıysa depolama dosyası yoktur: bir kez açıp kapatılır.
  execFileSync("xcrun", ["simctl", "launch", udid, appId]);
  await new Promise(r => setTimeout(r, 6000));
  spawnSync("xcrun", ["simctl", "terminate", udid, appId], { stdio: "ignore" });
  db = findDb();
  if (!db) { console.error("Yerel depolama dosyası bulunamadı."); process.exit(1); }
}

// WebKit localStorage değerleri UTF-16LE saklanır.
const hex = Buffer.from(JSON.stringify(state), "utf16le").toString("hex");
const sql = [
  "CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB NOT NULL ON CONFLICT FAIL);",
  `INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('evButcesi.v3.state', X'${hex}');`,
  "DELETE FROM ItemTable WHERE key IN ('evButcesi.v3.plan', 'evButcesi.v3.bulut', 'evButcesi.v3.yerelKopya');",
  "PRAGMA wal_checkpoint(TRUNCATE);"
].join("\n");
execFileSync("sqlite3", [db], { input: sql });
console.log("Yerel depolamaya yazıldı:", db.replace(container, "<uygulama>"));

execFileSync("xcrun", ["simctl", "launch", udid, appId]);
await new Promise(r => setTimeout(r, 8000));
mkdirSync(dirname(shot), { recursive: true });
execFileSync("xcrun", ["simctl", "io", udid, "screenshot", shot], { stdio: "ignore" });
console.log(`✔ Uygulama yedek verisiyle açıldı. Ekran görüntüsü: ${shot}`);
