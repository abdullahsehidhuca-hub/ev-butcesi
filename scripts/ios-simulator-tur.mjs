// iOS Simülatöründeki Safari'de (gerçek iOS WebKit) verilen adresleri sırayla açar, her birinin ekran
// görüntüsünü alır ve görüntüdeki yazıyı OCR ile okuyup beklenen metinleri denetler. Masaüstünde Safari
// uzaktan otomasyona kapalı olduğu için elle tıklama yerine adres (hash) ile sekme açılır.
//
// Kullanım: node scripts/ios-simulator-tur.mjs <udid> <çıktı klasörü> <adım dosyası>
// Adım dosyası: export default [{ name, url, expect: ["metin", ...] }, ...]
// Önkoşul: simülatör açık (xcrun simctl boot <udid>) ve adresler Mac'teki bir sunucudan erişilebilir.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const [udid, outDir, stepsFile] = process.argv.slice(2);
if (!udid || !outDir || !stepsFile) { console.error("kullanım: node scripts/ios-simulator-tur.mjs <udid> <çıktı klasörü> <adım dosyası>"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const simctl = (...a) => execFileSync("xcrun", ["simctl", ...a], { stdio: ["ignore", "pipe", "pipe"] }).toString();
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Türkçe harfleri ve boşlukları OCR hatalarına karşı gevşek karşılaştırır.
const loose = s => s.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9çğıöşü]/g, "");

const { createWorker } = await import("tesseract.js");
const worker = await createWorker("tur", 1, { langPath: "public/ocr", gzip: true, cachePath: join(tmpdir(), "evb-ocr-cache") });
const steps = (await import(pathToFileURL(stepsFile).href)).default;
const failures = [];
// Simülatör kapalıysa açılır ve hazır olana dek beklenir.
execFileSync("xcrun", ["simctl", "bootstatus", udid, "-b"], { stdio: "ignore" });

// Safari ilk açılışta yavaştır: ilk adres ısınma olarak açılır, açılmazsa birkaç kez denenir.
const openUrl = async url => { for (let i = 0; i < 4; i++) { try { simctl("openurl", udid, url); return; } catch (e) { if (i === 3) throw e; await sleep(4000); } } };
await openUrl(steps[0].url); await sleep(8000);

// Safari aynı adresin yalnız # kısmı değişince bazen geç tepki verir: beklenen metin yoksa bir kez daha açılır.
const shootAndRead = async (step, file) => { simctl("io", udid, "screenshot", file); const { data } = await worker.recognize(file); return data; };
for (const step of steps) {
  const file = join(outDir, `${step.name}.png`);
  let data;
  for (let attempt = 0; attempt < 2; attempt++) {
    await openUrl(step.url);
    await sleep(step.wait ?? 4000);
    data = await shootAndRead(step, file);
    const ok = (step.expect || []).every(e => loose(data.text).includes(loose(e)));
    if (ok) break;
  }
  const text = loose(data.text);
  console.log(`\n▶ ${step.name}  (${step.url})`);
  for (const line of data.text.split("\n").filter(l => l.trim())) console.log("   ", line.trim().slice(0, 80));
  for (const e of step.expect || []) {
    const ok = text.includes(loose(e));
    console.log(`  ${ok ? "✔" : "✘"} ${e}`);
    if (!ok) failures.push(`${step.name}: ${e}`);
  }
}
await worker.terminate();
console.log("\nBaşarısız kontrol:", failures.length ? failures.join(" | ") : "yok");
process.exit(failures.length ? 1 : 0);
