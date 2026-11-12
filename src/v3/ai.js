// Yapay zekâ uç noktalarına (Firebase Functions, functions/index.js) v3'ten yapılan çağrılar.
// Her istek oturum jetonuyla gider, sunucu jetonu doğrular; oturum yokken (örnek veri modu dahil) çağrı yapılmaz.
// Dosyalar sunucu sınırına (4 MB) göre hazırlanır: fotoğraf küçültülüp JPEG'e çevrilir, PDF olduğu gibi gider.
import { aiUrl } from "../aiApi.js";

// Sunucudaki zaman aşımı (saniye, functions/index.js) + ağ payı.
const TIMEOUT = { analyzeReceipt: 130, analyzeStatement: 310, aiAdvisor: 310 };
const MAX_BYTES = 4 * 1024 * 1024;

export class AiError extends Error {}

export const AI_SIGNED_OUT = "Yapay zekâ özellikleri için Ayarlar’dan aile hesabına giriş yapın.";

// user: Firebase oturum kullanıcısı (cloud.user). Dönüş: sunucunun JSON yanıtı; hata AiError olarak fırlatılır.
export async function callAi(user, name, body) {
  if (!user) throw new AiError(AI_SIGNED_OUT);
  let token;
  try { token = await user.getIdToken(); } catch { throw new AiError("Oturum doğrulanamadı. Çıkış yapıp yeniden giriş yapın."); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (TIMEOUT[name] || 130) * 1000);
  try {
    let res;
    try {
      res = await fetch(aiUrl(name), {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new AiError(e?.name === "AbortError" ? "Yanıt çok uzun sürdü. Biraz sonra yeniden deneyin." : "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
    }
    let data = null;
    try { data = await res.json(); } catch { /* boş ya da JSON olmayan yanıt */ }
    if (res.status === 401) throw new AiError("Oturumunuz doğrulanamadı. Çıkış yapıp yeniden giriş yapın.");
    if (!res.ok) throw new AiError(data?.error || `Sunucu yanıt veremedi (HTTP ${res.status}). Biraz sonra yeniden deneyin.`);
    if (!data) throw new AiError("Sunucudan okunamayan bir yanıt geldi. Yeniden deneyin.");
    if (data.error) throw new AiError(data.error);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const readDataUrl = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new AiError("Dosya okunamadı."));
  r.readAsDataURL(blob);
});
const base64Of = dataUrl => dataUrl.slice(dataUrl.indexOf(",") + 1);

export async function pdfPayload(file) {
  if (file.size > MAX_BYTES) throw new AiError("PDF 4 MB'tan büyük. Bankadan yalnız ilgili dönemin ekstresini indirip yeniden deneyin.");
  return { base64: base64Of(await readDataUrl(file)), mediaType: "application/pdf" };
}

// Fotoğraf (iPhone'un HEIC biçimi dahil) uzun kenarı en çok maxSide piksel olacak şekilde küçültülür ve JPEG'e çevrilir.
export async function imagePayload(file, maxSide = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new AiError("Fotoğraf açılamadı. Başka bir fotoğraf seçin."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const base64 = base64Of(canvas.toDataURL("image/jpeg", 0.85));
    if (Math.floor(base64.length * 3 / 4) > MAX_BYTES) throw new AiError("Fotoğraf çok büyük. Fişe daha yakından çekip yeniden deneyin.");
    return { base64, mediaType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}
