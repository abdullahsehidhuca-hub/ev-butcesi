// Android Emulator geliştirme döngüsü (ios-simulator.mjs'in karşılığı): web paketini derler, Capacitor ile android/
// projesine kopyalar, Gradle ile hata ayıklama APK'sı derler, sanal cihazı açar, uygulamayı yükleyip başlatır ve
// ekran görüntüsü alır. Her düzenlemeden sonra "npm run android:emu" ile çalıştırılır; Google hesabı gerekmez.
//
// Kullanım: node scripts/android-emulator.mjs [--avd Pixel_10_Pro_XL] [--no-build] [--shot <dosya.png>]
//   --avd      : sanal cihaz adı (varsayılan: Pixel_10_Pro_XL, yoksa ilk sanal cihaz)
//   --no-build : web derlemesini ve cap sync'i atlar (yalnız Android projesi yeniden derlenir)
//   --shot     : açılıştan sonra alınacak ekran görüntüsünün yolu (varsayılan: logs/android-emu-son.png)
// Gereksinim: Android Studio (SDK + en az bir sanal cihaz) ve Java 21 (bkz. scripts/android-env.mjs).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adb, androidEnv, checkAndroidEnv, emulator } from "./android-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const avdArg = opt("--avd", "Pixel_10_Pro_XL");
const noBuild = args.includes("--no-build");
const shot = opt("--shot", join(root, "logs", "android-emu-son.png"));
const appId = JSON.parse(readFileSync(join(root, "capacitor.config.json"), "utf8")).appId;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const run = (cmd, a, extra = {}) => {
  console.log(`\n$ ${cmd} ${a.join(" ")}`);
  const r = spawnSync(cmd, a, { cwd: root, stdio: "inherit", env: androidEnv, ...extra });
  if (r.status !== 0) { console.error(`✘ ${cmd} başarısız (çıkış ${r.status})`); process.exit(r.status || 1); }
};
const out = (cmd, a) => execFileSync(cmd, a, { cwd: root, env: androidEnv }).toString();

checkAndroidEnv();

// 1) Sanal cihazı bul: ada göre, yoksa ilk sanal cihaz.
const avds = out(emulator, ["-list-avds"]).split("\n").map(s => s.trim()).filter(Boolean);
const avd = avds.includes(avdArg) ? avdArg : avds[0];
if (!avd) { console.error("Sanal cihaz yok; Android Studio > Virtual Device Manager > + ile bir Pixel oluşturun."); process.exit(1); }
console.log(`Sanal cihaz: ${avd}`);

// 2) Web paketi ve Capacitor eşitlemesi.
if (!noBuild) {
  run("npm", ["run", "build"]);
  run("npx", ["cap", "sync", "android"]);
}

// 3) Gradle ile hata ayıklama derlemesi (imza Android'in kendi deneme anahtarıyla). Çıktı android/app/build altında (git dışı).
run("./gradlew", ["assembleDebug", "-q"], { cwd: join(root, "android") });
const apk = join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
if (!existsSync(apk)) { console.error(`Derleme çıktısı yok: ${apk}`); process.exit(1); }

// 4) Emülatör açık değilse başlat (arka planda kalır, pencere Mac'te açılır) ve açılışın bitmesini bekle.
const running = out(adb, ["devices"]).split("\n").some(l => /^emulator-\d+\s+device/.test(l));
if (!running) {
  console.log(`\n$ emulator -avd ${avd}`);
  spawn(emulator, ["-avd", avd], { detached: true, stdio: "ignore", env: androidEnv }).unref();
}
run(adb, ["wait-for-device"]);
for (let i = 0; i < 90; i++) {
  const booted = spawnSync(adb, ["shell", "getprop", "sys.boot_completed"], { env: androidEnv }).stdout?.toString().trim();
  if (booted === "1") break;
  if (i === 89) { console.error("Emülatör 3 dakikada açılmadı."); process.exit(1); }
  await sleep(2000);
}

// 5) Uygulamayı yükle ve baştan başlat.
run(adb, ["install", "-r", apk]);
spawnSync(adb, ["shell", "am", "force-stop", appId], { stdio: "ignore", env: androidEnv });
run(adb, ["shell", "am", "start", "-n", `${appId}/.MainActivity`]);

// 6) Ekran görüntüsü: ilk açılış birkaç saniye sürebilir; 8 sn beklenir.
await sleep(8000);
mkdirSync(dirname(shot), { recursive: true });
writeFileSync(shot, execFileSync(adb, ["exec-out", "screencap", "-p"], { env: androidEnv, maxBuffer: 64 * 1024 * 1024 }));
console.log(`\n✔ Uygulama ${avd} emülatöründe açık. Ekran görüntüsü: ${shot}`);
