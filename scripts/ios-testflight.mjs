// TestFlight yüklemesi: web paketini derler, Capacitor ile ios/ projesine kopyalar, Xcode ile App Store için
// arşivler ve App Store Connect'e yükler. Derleme yalnız iç test için işaretlenir (testFlightInternalTestingOnly):
// Apple incelemesine girmez, App Store'a gönderilemez; App Store Connect ekibindeki kişilerin TestFlight
// uygulamasında görünür. Her düzenlemeden sonra "npm run ios:testflight"; derleme numarası tarih-saatten üretilir.
//
// Kullanım: node scripts/ios-testflight.mjs [--no-build] [--no-upload]
//   --no-build  : web derlemesini ve cap sync'i atlar (yalnız yerel proje yeniden arşivlenir)
//   --no-upload : arşivler ve .ipa'yı ios/App/build/testflight altına çıkarır, Apple'a göndermez (imza denetimi)
// Gereksinim: Xcode > Settings > Accounts'ta Apple Developer Program üyesi hesap ve App Store Connect'te
// com.evbutcesi.app paket kimliğiyle açılmış uygulama kaydı. Xcode hesabı yerine App Store Connect API anahtarı
// kullanılacaksa ASC_KEY_PATH (.p8 dosyası), ASC_KEY_ID ve ASC_ISSUER_ID ortam değişkenleri verilir.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iosDir = join(root, "ios", "App");
const args = process.argv.slice(2);
const noBuild = args.includes("--no-build");
const noUpload = args.includes("--no-upload");
const outDir = join(iosDir, "build", "testflight");
const archive = join(outDir, "App.xcarchive");

const run = (cmd, a, { hint, ...extra } = {}) => {
  console.log(`\n$ ${cmd} ${a.join(" ")}`);
  const r = spawnSync(cmd, a, { cwd: root, stdio: "inherit", ...extra });
  if (r.status !== 0) {
    console.error(`✘ ${cmd} başarısız (çıkış ${r.status})`);
    if (hint) console.error(hint);
    process.exit(r.status || 1);
  }
};

// Takım kimliği Xcode projesindeki DEVELOPMENT_TEAM satırından okunur (ücretli program takımı).
const team = readFileSync(join(iosDir, "App.xcodeproj", "project.pbxproj"), "utf8").match(/DEVELOPMENT_TEAM = (\w+);/)?.[1];
if (!team) { console.error("ios/App/App.xcodeproj içinde DEVELOPMENT_TEAM yok; Xcode > Signing & Capabilities'ten takım seçin."); process.exit(1); }

// Derleme numarası: yyMMdd.HHmm (ör. 261112.1530). Her yüklemede artar; App Store Connect aynı numarayı iki kez kabul etmez.
const d = new Date();
const p = n => String(n).padStart(2, "0");
const build = `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}.${p(d.getHours())}${p(d.getMinutes())}`;

const ascKey = process.env.ASC_KEY_PATH;
const auth = ascKey
  ? ["-authenticationKeyPath", ascKey, "-authenticationKeyID", process.env.ASC_KEY_ID || "", "-authenticationKeyIssuerID", process.env.ASC_ISSUER_ID || ""]
  : [];
const signHint = "İmza sorunu ise: Xcode > Settings > Accounts'ta Apple Developer hesabınız ekli ve oturumu açık olmalı.";

// 1) Web paketi ve Capacitor eşitlemesi.
if (!noBuild) {
  run("npm", ["run", "build"]);
  run("npx", ["cap", "sync", "ios"]);
}

// 2) App Store arşivi. İmza otomatik: gerekirse paket kimliği, sertifika ve profil Apple hesabında oluşturulur.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
console.log(`Takım: ${team} · Sürüm numarası (build): ${build}`);
run("xcodebuild", ["-project", "App.xcodeproj", "-scheme", "App", "-configuration", "Release",
  "-destination", "generic/platform=iOS", "-archivePath", archive, "-allowProvisioningUpdates", ...auth,
  `CURRENT_PROJECT_VERSION=${build}`, "-quiet", "archive"], { cwd: iosDir, hint: signHint });
if (!existsSync(archive)) { console.error(`Arşiv oluşmadı: ${archive}`); process.exit(1); }

// 3) Dışa aktarım: "upload" doğrudan App Store Connect'e gönderir, "export" yalnız .ipa üretir.
const exportOptions = join(outDir, "ExportOptions.plist");
writeFileSync(exportOptions, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>${noUpload ? "export" : "upload"}</string>
  <key>teamID</key><string>${team}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>testFlightInternalTestingOnly</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
`);
run("xcodebuild", ["-exportArchive", "-archivePath", archive, "-exportOptionsPlist", exportOptions,
  "-exportPath", join(outDir, "export"), "-allowProvisioningUpdates", ...auth], {
  cwd: iosDir,
  hint: `${signHint}\nYükleme reddedildiyse: App Store Connect > Uygulamalar'da com.evbutcesi.app kimlikli uygulama kaydı açılmış olmalı.`
});

console.log(noUpload
  ? `\n✔ Arşiv ve .ipa hazır (yüklenmedi): ${join(outDir, "export")}`
  : `\n✔ ${build} numaralı derleme App Store Connect'e yüklendi. İşlenmesi genelde 5–15 dk sürer; sonra iPhone'daki TestFlight uygulamasında görünür.`);
