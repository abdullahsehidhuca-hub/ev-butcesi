// iPhone'da canlı yenileme: uygulama ekranları derlenmiş paketten değil, bu Mac'teki geliştirme sunucusundan yüklenir.
// Kod değişince telefondaki ekran saniyeler içinde yenilenir; TestFlight ya da yeniden kurulum beklenmez.
// "npm run ios:canli". Sunucu arka planda açık kalır; kapatmak için "npm run ios:canli -- --durdur".
//
// Kullanım: node scripts/ios-canli.mjs [--device <ad|udid>] [--durdur]
// Gereksinimler ios-cihaz.mjs ile aynıdır: eşleşmiş iPhone, Geliştirici Modu açık, Mac'le aynı Wi-Fi. Ayrıca Mac açık
// kalmalıdır. Telefondaki uygulama bu geliştirme sürümüyle değişir (TestFlight sürümünün yerine geçer; TestFlight'tan
// yeniden kurulabilir). Sunucu adresi ayrı bir site sayıldığı için ilk açılışta bir kez giriş yapmak gerekir.
// İlk açılışta iOS "yerel ağdaki aygıtları bulma" izni sorarsa İzin Ver denir; reddedilirse ekran boş kalır
// (Ayarlar > Gizlilik ve Güvenlik > Yerel Ağ > Ev Bütçesi).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const port = 5180;
const pidFile = join(root, "logs", "canli-sunucu.pid");
const logFile = join(root, "logs", "canli-sunucu.log");
const nativeConfig = join(root, "ios", "App", "App", "capacitor.config.json");

const run = (cmd, a) => {
  console.log(`\n$ ${cmd} ${a.join(" ")}`);
  const r = spawnSync(cmd, a, { cwd: root, stdio: "inherit" });
  if (r.status !== 0) { console.error(`✘ ${cmd} başarısız (çıkış ${r.status})`); process.exit(r.status || 1); }
};
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const runningPid = () => {
  const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8")) : 0;
  return pid && alive(pid) ? pid : 0;
};

if (args.includes("--durdur")) {
  const pid = runningPid();
  if (pid) process.kill(-pid);
  rmSync(pidFile, { force: true });
  console.log(pid ? "✔ Geliştirme sunucusu kapatıldı." : "Açık geliştirme sunucusu yok.");
  console.log("Telefondaki uygulama artık boş ekran açar; TestFlight'tan yeniden kurun ya da \"npm run ios:cihaz\" çalıştırın.");
  process.exit(0);
}

// 1) Mac'in yerel ağ adresi (Wi-Fi). Telefon sunucuya bu adresten ulaşır.
const ip = ["en0", "en1"].map(i => spawnSync("ipconfig", ["getifaddr", i], { encoding: "utf8" }).stdout.trim()).find(Boolean);
if (!ip) { console.error("Mac'in yerel ağ adresi bulunamadı; Mac Wi-Fi'ye bağlı olmalı."); process.exit(1); }
const url = `http://${ip}:${port}`;

// 2) Geliştirme sunucusu: açık değilse arka planda başlatılır, bu betik bitince de açık kalır.
if (!runningPid()) {
  mkdirSync(join(root, "logs"), { recursive: true });
  run("node", ["scripts/copy-ocr.mjs"]);
  const out = openSync(logFile, "a");
  const child = spawn("npx", ["vite", "--host", "0.0.0.0", "--port", String(port), "--strictPort"],
    { cwd: root, detached: true, stdio: ["ignore", out, out] });
  child.unref();
  writeFileSync(pidFile, String(child.pid));
  console.log(`Geliştirme sunucusu başlatıldı (günlük: logs/canli-sunucu.log).`);
}
let status = 0;
for (let i = 0; i < 40 && status !== 200; i++) {
  try { status = (await fetch(url)).status; } catch { status = 0; }
  if (status !== 200) await new Promise(r => setTimeout(r, 500));
}
if (status !== 200) { console.error(`Sunucu ${url} adresinde yanıt vermiyor (durum: ${status || "bağlantı yok"}); logs/canli-sunucu.log'a bakın.`);
  console.error(`Sık neden Mac güvenlik duvarı: Sistem Ayarları > Ağ > Güvenlik Duvarı > Seçenekler'de ${process.execPath} için "Gelen bağlantılara izin ver" seçilmeli (node her güncellendiğinde yeniden sorulur).`);
  process.exit(1);
}
console.log(`Sunucu hazır: ${url}`);

// 3) Uygulamayı sunucuya bağla: Capacitor'ın iOS projesindeki üretilmiş ayar dosyasına sunucu adresi yazılır. Dosya git
// dışıdır; sonraki her "cap sync" (ios:cihaz, ios:testflight) onu normal haline döndürür.
run("npx", ["cap", "sync", "ios"]);
const cfg = JSON.parse(readFileSync(nativeConfig, "utf8"));
writeFileSync(nativeConfig, JSON.stringify({ ...cfg, server: { ...(cfg.server || {}), url, cleartext: true } }, null, "\t"));

// 4) Cihaz derlemesi, kurulum ve açılış (web derlemesi ve cap sync atlanır; ayar dosyası korunur).
const device = args.includes("--device") ? ["--device", args[args.indexOf("--device") + 1]] : [];
run("node", ["scripts/ios-cihaz.mjs", "--no-build", ...device]);
console.log(`\n✔ Canlı yenileme açık. Telefon ekranları ${url} adresinden yüklüyor.`);
console.log(`Ekran seçici: Ayarlar › Test ekranları. Aynı Wi-Fi'deki Safari'den de açılır: ${url}/?test`);
