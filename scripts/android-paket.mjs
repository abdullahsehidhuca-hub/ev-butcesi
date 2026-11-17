// Google Play yayın paketi (ios-testflight.mjs'in karşılığı): web paketini derler, Capacitor ile android/ projesine
// kopyalar ve Play Console'a yüklenecek imzalı .aab dosyasını üretir. Derleme numarası iOS'takiyle aynı tarih-saat
// etiketidir (ör. 261116.2015); Play'in istediği tam sayı (versionCode) 1 Ocak 2026'dan beri geçen dakikadır, her
// yüklemede artar.
//
// İmza: Play'e ilk yüklenen paketin anahtarı "yükleme anahtarı" olur; sonraki paketler aynı anahtarla imzalanmalıdır.
// Anahtar ilk çalıştırmada ~/.ev-butcesi/android-yukleme.jks olarak, parolası rastgele üretilip
// ~/.ev-butcesi/android-imza.json içinde (yalnız bu kullanıcı okuyabilir) oluşturulur. İkisi de depoya girmez;
// yedeklenmeli. Play App Signing açık olduğu için asıl uygulama anahtarını Google tutar; bu anahtar kaybolursa
// Play Console'dan yükleme anahtarı sıfırlatılabilir.
//
// Kullanım: node scripts/android-paket.mjs [--no-build]
//   --no-build : web derlemesini ve cap sync'i atlar
// Çıktı: android/app/build/outputs/bundle/release/app-release.aab (git dışı)
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { androidEnv, checkAndroidEnv, javaHome } from "./android-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const noBuild = process.argv.slice(2).includes("--no-build");
const keyDir = join(homedir(), ".ev-butcesi");
const keystore = join(keyDir, "android-yukleme.jks");
const keyInfo = join(keyDir, "android-imza.json");

const run = (cmd, a, extra = {}) => {
  console.log(`\n$ ${cmd} ${a.join(" ")}`);
  const r = spawnSync(cmd, a, { cwd: root, stdio: "inherit", env: androidEnv, ...extra });
  if (r.status !== 0) { console.error(`✘ ${cmd} başarısız (çıkış ${r.status})`); process.exit(r.status || 1); }
};

checkAndroidEnv();

// 1) Yükleme anahtarı: yoksa oluştur. Parola ekrana ve komut satırına yazılmaz (keytool'a ortam değişkeniyle gider).
if (!existsSync(keystore)) {
  if (existsSync(keyInfo)) { console.error(`${keyInfo} var ama ${keystore} yok; anahtarı yedekten geri koyun.`); process.exit(1); }
  mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  const info = { alias: "evbutcesi", password: randomBytes(24).toString("base64url") };
  run(join(javaHome, "bin", "keytool"), ["-genkeypair", "-keystore", keystore, "-alias", info.alias,
    "-keyalg", "RSA", "-keysize", "4096", "-validity", "10000", "-dname", "CN=Ev Butcesi, O=Ev Butcesi, C=TR",
    "-storepass:env", "EV_IMZA_PAROLA", "-keypass:env", "EV_IMZA_PAROLA"],
    { env: { ...androidEnv, EV_IMZA_PAROLA: info.password } });
  writeFileSync(keyInfo, JSON.stringify(info, null, 2), { mode: 0o600 });
  chmodSync(keystore, 0o600);
  console.log(`Yeni yükleme anahtarı oluşturuldu: ${keystore} (parolası ${keyInfo} içinde). İkisini de yedekleyin.`);
}
const { alias, password } = JSON.parse(readFileSync(keyInfo, "utf8"));

// 2) Derleme numarası.
const d = new Date();
const p = n => String(n).padStart(2, "0");
const build = `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}.${p(d.getHours())}${p(d.getMinutes())}`;
const versionCode = Math.floor((d.getTime() - Date.UTC(2026, 0, 1)) / 60000);
console.log(`Sürüm: ${build} · versionCode ${versionCode}`);

// 3) Web paketi ve Capacitor eşitlemesi.
if (!noBuild) {
  run("npm", ["run", "build"]);
  run("npx", ["cap", "sync", "android"]);
}

// 4) İmzalı yayın paketi. İmza bilgileri Gradle'a ORG_GRADLE_PROJECT_ ortam değişkenleriyle gider (komut satırında görünmez).
run("./gradlew", ["bundleRelease", "-q"], {
  cwd: join(root, "android"),
  env: { ...androidEnv, ORG_GRADLE_PROJECT_evImzaDosyasi: keystore, ORG_GRADLE_PROJECT_evImzaAdi: alias,
    ORG_GRADLE_PROJECT_evImzaParola: password, ORG_GRADLE_PROJECT_evVersionCode: String(versionCode),
    ORG_GRADLE_PROJECT_evVersionName: build },
});
const aab = join(root, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab");
if (!existsSync(aab)) { console.error(`Paket çıktısı yok: ${aab}`); process.exit(1); }
console.log(`\n✔ Google Play paketi hazır (${build}): ${aab}`);
