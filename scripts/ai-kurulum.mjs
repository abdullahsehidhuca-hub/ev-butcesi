// AI işlevlerini Firebase'e kurar ya da model değişikliğini yükler. Tek komut: npm run ai:kurulum
// Sırayla denetler ve yapar: Firebase oturumu → proje erişimi → functions bağımlılıkları → seçili modelin anahtarı
// (gizli depoda yoksa sorar; yazılan anahtar ekranda görünmez) → yükleme → eski kod paketlerini silme ayarı →
// canlı adreslerin denetimi. Bir adım başarısız olursa ne yapılacağını yazar ve durur; düzeltip yeniden çalıştırılır.
// Anahtarı yenilemek için: npm run ai:kurulum -- --anahtar-yenile
// Hiçbir şeyi değiştirmeden durumu görmek için: npm run ai:kurulum -- --kontrol

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { modelInfo } from "../functions/ai/providers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = "ev-butcesi-96167";
const REGION = "europe-west1";
const BASE = `https://${REGION}-${PROJECT}.cloudfunctions.net`;
const PLAN_URL = `https://console.firebase.google.com/project/${PROJECT}/usage/details`;
const renewKey = process.argv.includes("--anahtar-yenile");
const checkOnly = process.argv.includes("--kontrol");

const model = modelInfo();

// stdio "inherit": komut soru sorarsa kullanıcı doğrudan yanıtlar. "pipe": çıktı denetlenir, ekrana basılmaz.
const run = (cmd, args, interactive = false) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: interactive ? "inherit" : "pipe", encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}`, missing: r.error?.code === "ENOENT" };
};

function fail(title, ...help) {
  console.log(`\n✘ ${title}\n`);
  for (const line of help) console.log(`  ${line}`);
  console.log("\n  Düzelttikten sonra aynı komutu yeniden çalıştırın: npm run ai:kurulum\n");
  process.exit(1);
}
const ok = text => console.log(`✔ ${text}`);

console.log(`AI kurulumu — model: ${model.id}, anahtar adı: ${model.keyName}, proje: ${PROJECT}\n`);

// 1. Firebase komut aracı ve oturum
const login = run("firebase", ["login:list"]);
if (login.missing) fail("Firebase komut aracı bulunamadı.", "Terminalde şunu çalıştırın: npm install -g firebase-tools");
const who = /Logged in as (\S+)/.exec(login.out);
if (!who) fail("Firebase'e giriş yapılmamış.", "Terminalde şunu çalıştırın: firebase login", "Açılan tarayıcıda projenin sahibi olan Google hesabıyla giriş yapın.");
ok(`Firebase oturumu: ${who[1]}`);

// 2. Proje erişimi
const projects = run("firebase", ["projects:list"]);
if (!projects.out.includes(PROJECT)) fail(`Bu hesap ${PROJECT} projesini görmüyor.`, "firebase logout ve ardından firebase login ile projenin sahibi olan hesapla giriş yapın.");
ok(`Proje erişimi: ${PROJECT}`);

// 3. functions bağımlılıkları (kilit dosyasındaki sürümlerle)
if (!checkOnly) {
  console.log("… functions bağımlılıkları kuruluyor");
  const deps = run("npm", ["ci", "--prefix", "functions", "--no-audit", "--no-fund"]);
  if (!deps.ok) fail("functions bağımlılıkları kurulamadı.", deps.out.trim().split("\n").slice(-5).join("\n  "));
  ok("functions bağımlılıkları");
}

// 4. Seçili modelin anahtarı gizli depoda var mı (değeri okunmaz, yalnız sürüm bilgisi)
const hasKey = run("firebase", ["functions:secrets:get", model.keyName, "--project", PROJECT]).ok;
if (checkOnly) {
  console.log(`${hasKey ? "✔" : "✘"} Anahtar gizli depoda: ${model.keyName} ${hasKey ? "var" : "yok"}`);
  const live = await fetch(`${BASE}/aiAdvisor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
  const deployed = live?.status === 401;
  console.log(`${deployed ? "✔" : "✘"} Canlı uç nokta: ${deployed ? "yüklü" : "yüklü değil"}${live ? ` (HTTP ${live.status})` : ""}`);
  console.log("\nKontrol kipi: hiçbir şey değiştirilmedi. Kurulum için: npm run ai:kurulum");
  process.exit(0);
}
if (!hasKey || renewKey) {
  console.log(`\n${model.keyName} ${hasKey ? "yenileniyor" : "gizli depoda yok"}. Şimdi anahtarı yapıştırıp Enter'a basın.`);
  console.log("(Yazdığınız anahtar ekranda görünmez; bu normaldir.)\n");
  const set = run("firebase", ["functions:secrets:set", model.keyName, "--project", PROJECT], true);
  if (!set.ok) fail("Anahtar gizli depoya kaydedilemedi.",
    `En sık neden: proje henüz Blaze planında değil. Planı buradan yükseltin: ${PLAN_URL}`,
    "(Sayfada \"Spark\" yazan planın yanındaki yükseltme düğmesi → Blaze → ödeme hesabı seçin.)");
}
ok(`Anahtar gizli depoda: ${model.keyName}`);

// 5. Yükleme (Google bir hizmeti açmak için onay sorarsa "Y" ile onaylayın)
console.log("\n… yükleniyor (ilk yükleme 3–5 dakika sürebilir)\n");
const deploy = run("firebase", ["deploy", "--only", "functions", "--project", PROJECT], true);
if (!deploy.ok) fail("Yükleme başarısız.",
  `Yukarıdaki hata Blaze planından söz ediyorsa planı buradan yükseltin: ${PLAN_URL}`,
  "Başka bir hata varsa son 20 satırı kopyalayıp bana iletin.");
ok("Yükleme");

// 6. Eski kod paketlerini 1 gün sonra silme ayarı (paket depolama ücreti sıfırda kalır)
const policy = run("firebase", ["functions:artifacts:setpolicy", "--location", REGION, "--days", "1", "--force", "--project", PROJECT]);
if (policy.ok) ok("Eski kod paketlerini silme ayarı");
else console.log("! Eski kod paketlerini silme ayarı kurulamadı (yükleme etkilenmez; bana iletin).");

// 7. Canlı denetim: oturumsuz istek reddedilmeli, iPhone uygulamasının kaynağına izin verilmeli. Veri yazılmaz.
let bad = 0;
for (const fn of ["aiAdvisor", "analyzeReceipt", "analyzeStatement"]) {
  const res = await fetch(`${BASE}/${fn}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
  const pre = await fetch(`${BASE}/${fn}`, { method: "OPTIONS", headers: { Origin: "capacitor://localhost", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } }).catch(() => null);
  const fine = res?.status === 401 && pre?.headers.get("access-control-allow-origin") === "capacitor://localhost";
  if (!fine) bad++;
  console.log(`${fine ? "✔" : "✘"} ${fn}: oturumsuz istek ${res ? `HTTP ${res.status}` : "ulaşılamadı"}, iPhone izni ${pre?.headers.get("access-control-allow-origin") ? "var" : "yok"}`);
}
if (bad) fail("Canlı denetim tam geçmedi.", "Yükleme yeni bittiyse 1–2 dakika bekleyip yeniden çalıştırın; sürerse çıktıyı bana iletin.");
console.log(`\nKurulum tamam. Model: ${model.id}. Adresler: ${BASE}/aiAdvisor, /analyzeReceipt, /analyzeStatement`);
