// Ekran görüntüsünden yazı okuma (OCR) motorunu uygulamanın kendi sunucusundan yayınlamak için
// gereken dosyaları node_modules'tan public/ocr/ altına kopyalar. Böylece tarayıcı hiçbir dış
// adrese (CDN, API) gitmez; görüntü cihazdan çıkmaz. `npm run dev` ve `npm run build` öncesi çalışır.
import { mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "ocr");
mkdirSync(out, { recursive: true });

const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  // Yalnız LSTM çekirdekleri: cihaz SIMD destekliyorsa hızlı sürüm, değilse temel sürüm seçilir.
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  // Türkçe dil modeli (küçük, tam sayı nicemli LSTM sürümü).
  ["node_modules/@tesseract.js-data/tur/4.0.0_best_int/tur.traineddata.gz", "tur.traineddata.gz"]
];

for (const [from, to] of files) {
  const src = join(root, from);
  const dst = join(out, to);
  if (!existsSync(src)) { console.error(`OCR dosyası bulunamadı: ${from} (npm install çalıştırın)`); process.exit(1); }
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue;
  copyFileSync(src, dst);
}
