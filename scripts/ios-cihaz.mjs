// Kendi iPhone'una doğrudan kurma: web paketini derler, Capacitor ile ios/ projesine kopyalar, Xcode ile cihaz için
// derler (geliştirici imzası, ücretli takım), uygulamayı eşleşmiş iPhone'a yükleyip açar. TestFlight'ı beklemeden
// 1–2 dakikada telefonda görmek içindir; "npm run ios:cihaz".
//
// Kullanım: node scripts/ios-cihaz.mjs [--device <ad|udid>] [--no-build]
//   --device   : iPhone adı ya da UDID (varsayılan: eşleşmiş ilk gerçek iPhone)
//   --no-build : web derlemesini ve cap sync'i atlar
// Gereksinim: iPhone bu Mac'le bir kez eşleşmiş, Geliştirici Modu açık (Ayarlar > Gizlilik ve Güvenlik), kilidi açık ve
// Mac'le aynı Wi-Fi'de (ya da kabloyla bağlı). Tailscale bu bağlantıyı taşımaz; Xcode telefonu yerel ağda arar.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iosDir = join(root, "ios", "App");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const deviceArg = opt("--device", null);
const noBuild = args.includes("--no-build");
const appId = JSON.parse(readFileSync(join(root, "capacitor.config.json"), "utf8")).appId;

const run = (cmd, a, extra = {}) => {
  console.log(`\n$ ${cmd} ${a.join(" ")}`);
  const r = spawnSync(cmd, a, { cwd: root, stdio: "inherit", ...extra });
  if (r.status !== 0) { console.error(`✘ ${cmd} başarısız (çıkış ${r.status})`); process.exit(r.status || 1); }
};

// 1) Cihazı bul. Ulaşılamıyorsa derlemeye hiç girmeden nedeni yazılır.
const tmp = mkdtempSync(join(tmpdir(), "evb-cihaz-"));
const listFile = join(tmp, "devices.json");
spawnSync("xcrun", ["devicectl", "list", "devices", "-j", listFile], { stdio: "ignore" });
const devices = existsSync(listFile) ? JSON.parse(readFileSync(listFile, "utf8")).result.devices : [];
rmSync(tmp, { recursive: true, force: true });
const phones = devices.filter(d => d.hardwareProperties?.reality === "physical" && d.hardwareProperties?.deviceType === "iPhone");
const device = deviceArg
  ? phones.find(d => d.hardwareProperties.udid === deviceArg || d.deviceProperties?.name === deviceArg)
  : phones.find(d => d.connectionProperties?.pairingState === "paired");
if (!device) { console.error("Eşleşmiş iPhone bulunamadı. İlk eşleşme için telefonu bir kez kabloyla Mac'e bağlayıp 'Bu bilgisayara güven' deyin."); process.exit(1); }
const name = device.deviceProperties?.name;
const udid = device.hardwareProperties.udid;
console.log(`iPhone: ${name} (${udid}) · iOS ${device.deviceProperties?.osVersionNumber}`);
if (device.deviceProperties?.developerModeStatus !== "enabled") {
  console.error("Geliştirici Modu kapalı. iPhone: Ayarlar > Gizlilik ve Güvenlik > Geliştirici Modu > aç; telefon yeniden başlar, açılışta 'Aç' deyin.");
  process.exit(1);
}
if (device.connectionProperties?.tunnelState === "unavailable") {
  console.error("iPhone'a şu an ulaşılamıyor. Telefonun kilidi açık ve Mac'le aynı Wi-Fi'de olmalı (Tailscale yetmez) ya da kabloyla bağlayın.");
  process.exit(1);
}

// 2) Web paketi ve Capacitor eşitlemesi.
if (!noBuild) {
  run("npm", ["run", "build"]);
  run("npx", ["cap", "sync", "ios"]);
}

// 3) Cihaz derlemesi. İlk seferde telefon geliştirici cihazı olarak kaydedilir ve geliştirme profili oluşturulur.
run("xcodebuild", ["-project", "App.xcodeproj", "-scheme", "App", "-configuration", "Debug",
  "-destination", `id=${udid}`, "-derivedDataPath", "build", "-allowProvisioningUpdates",
  "-allowProvisioningDeviceRegistration", "-quiet", "build"], { cwd: iosDir });
const appPath = join(iosDir, "build", "Build", "Products", "Debug-iphoneos", "App.app");
if (!existsSync(appPath)) { console.error(`Derleme çıktısı yok: ${appPath}`); process.exit(1); }

// 4) Yükle ve aç.
run("xcrun", ["devicectl", "device", "install", "app", "--device", udid, appPath]);
run("xcrun", ["devicectl", "device", "process", "launch", "--terminate-existing", "--device", udid, appId]);
console.log(`\n✔ Uygulama ${name} cihazında açıldı.`);
