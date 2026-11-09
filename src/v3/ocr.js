// Ekran görüntüsünden yazı okuma (OCR). Motor (tesseract, WebAssembly) ve Türkçe dil modeli uygulamanın
// kendi sunucusundan (/ocr/) yüklenir; görüntü hiçbir dış servise gönderilmez, cihazda işlenir.
// Motor yalnız ilk kullanımda indirilir (~6 MB) ve tarayıcı önbelleğinde tutulur.

const BASE = `${import.meta.env.BASE_URL || "/"}ocr`;
let workerPromise = null;

const STAGES = {
  "loading tesseract core": "Okuma motoru yükleniyor",
  "initializing tesseract": "Okuma motoru hazırlanıyor",
  "loading language traineddata": "Türkçe dil modeli yükleniyor",
  "initializing api": "Okuma motoru hazırlanıyor",
  "recognizing text": "Görüntüdeki yazı okunuyor"
};

let listener = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("tur", 1, {
        workerPath: `${BASE}/worker.min.js`,
        corePath: BASE,
        langPath: BASE,
        gzip: true,
        workerBlobURL: false,
        logger: m => listener?.({ stage: STAGES[m.status] || "Hazırlanıyor", progress: m.progress || 0 })
      });
    })().catch(e => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

// Telefon ekran görüntüleri küçük yazılı ve koyu temalı olabilir: görüntü büyütülüp gri tonlanır,
// koyu zeminliyse ters çevrilir (motor koyu yazı / açık zemini daha iyi okur).
async function prepare(file) {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width < 1400 ? Math.min(2, 1400 / bitmap.width) : 1;
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
    sum += g;
  }
  if (sum / (d.length / 4) < 110) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Görüntüdeki metni satır satır döndürür. onProgress({ stage, progress 0-1 }).
export async function recognizeImage(file, onProgress) {
  listener = onProgress;
  try {
    const worker = await getWorker();
    const canvas = await prepare(file);
    const { data } = await worker.recognize(canvas);
    return data.text || "";
  } finally {
    listener = null;
  }
}
