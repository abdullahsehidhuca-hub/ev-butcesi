// iOS Simülatörü geliştirme döngüsü: web paketini derler, Capacitor ile ios/ projesine kopyalar, Xcode ile
// simülatör için derler, uygulamayı simülatöre yükleyip açar ve ekran görüntüsü alır. Her düzenlemeden sonra
// "npm run ios:sim" ile çalıştırılır; Apple hesabı ya da imza gerekmez (yalnız simülatör).
//
// Kullanım: node scripts/ios-simulator.mjs [--device "iPhone 17 Pro"|<udid>] [--no-build] [--shot <dosya.png>]
//   --device   : simülatör adı ya da UDID (varsayılan: iPhone 17 Pro, yoksa ilk uygun iPhone)
//   --no-build : web derlemesini ve cap sync'i atlar (yalnız yerel proje yeniden derlenir)
//   --shot     : açılıştan sonra alınacak ekran görüntüsünün yolu (varsayılan: logs/ios-sim-son.png)
// Gereksinim: Xcode ve iOS simülatörü kurulu (xcode-select -p bir Xcode göstermeli).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const deviceArg = opt("--device", "iPhone 17 Pro");
const noBuild = args.includes("--no-build");
const shot = opt("--shot", join(root, "logs", "ios-sim-son.png"));
const appId = JSON.parse(readFileSync(join(root, "capacitor.config.json"), "utf8")).appId;

const run = (cmd, a, extra = {}) => {
  console.log(`\n$ ${cmd} ${a.join(" ")}`);
  const r = spawnSync(cmd, a, { cwd: root, stdio: "inherit", ...extra });
  if (r.status !== 0) { console.error(`✘ ${cmd} başarısız (çıkış ${r.status})`); process.exit(r.status || 1); }
};
const out = (cmd, a) => execFileSync(cmd, a, { cwd: root }).toString();

// 1) Simülatörü bul: UDID verilmişse onu, yoksa ada göre, o da yoksa ilk uygun iPhone.
const devices = JSON.parse(out("xcrun", ["simctl", "list", "devices", "available", "-j"])).devices;
const all = Object.entries(devices).flatMap(([rt, list]) => list.map(d => ({ ...d, runtime: rt })));
const device = all.find(d => d.udid === deviceArg) || all.find(d => d.name === deviceArg) || all.find(d => /iPhone/.test(d.name));
if (!device) { console.error("Uygun iOS simülatörü bulunamadı; Xcode > Settings > Components'tan bir iOS simülatörü kurun."); process.exit(1); }
console.log(`Simülatör: ${device.name} (${device.udid}) · ${device.runtime.split(".").slice(-2).join(" ")}`);

// 2) Web paketi ve Capacitor eşitlemesi.
if (!noBuild) {
  run("npm", ["run", "build"]);
  run("npx", ["cap", "sync", "ios"]);
}

// 3) Xcode ile simülatör derlemesi (imza yok). Çıktı ios/App/build altına gider (git dışı).
const products = join(root, "ios", "App", "build", "Build", "Products", "Debug-iphonesimulator");
run("xcodebuild", ["-project", "App.xcodeproj", "-scheme", "App", "-configuration", "Debug",
  "-destination", `platform=iOS Simulator,id=${device.udid}`, "-derivedDataPath", "build", "CODE_SIGNING_ALLOWED=NO", "-quiet", "build"],
  { cwd: join(root, "ios", "App") });
const appPath = join(products, "App.app");
if (!existsSync(appPath)) { console.error(`Derleme çıktısı yok: ${appPath}`); process.exit(1); }

// 4) Simülatörü aç, uygulamayı yükle ve başlat.
run("xcrun", ["simctl", "bootstatus", device.udid, "-b"]);
run("open", ["-a", "Simulator", "--args", "-CurrentDeviceUDID", device.udid]);
run("xcrun", ["simctl", "install", device.udid, appPath]);
spawnSync("xcrun", ["simctl", "terminate", device.udid, appId], { stdio: "ignore" });
run("xcrun", ["simctl", "launch", device.udid, appId]);

// 5) Ekran görüntüsü: yeni yüklemeden sonraki ilk açılış 3–6 sn sürebilir; 8 sn beklenir.
await new Promise(r => setTimeout(r, 8000));
mkdirSync(dirname(shot), { recursive: true });
run("xcrun", ["simctl", "io", device.udid, "screenshot", shot]);
console.log(`\n✔ Uygulama ${device.name} simülatöründe açık. Ekran görüntüsü: ${shot}`);
