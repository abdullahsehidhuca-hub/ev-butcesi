// AI uç noktalarının ortak yardımcıları: oturum doğrulama, dosya denetimi, JSON ayrıştırma.
// Model ve sağlayıcı çağrısı: providers.js. Hem Firebase Functions (functions/index.js) hem de Vercel kapanana kadar
// api/ bu dosyayı kullanır.

import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Token doğrulaması yalnızca proje kimliği ister (Google'ın açık anahtarlarıyla imza denetlenir);
// servis hesabı gerekmez. Proje kimliği ve veritabanı adresi gizli değildir.
// Firebase Functions (ve emülatör) FIREBASE_CONFIG'i kendisi verir; Vercel'de varsayılanlar kullanılır.
const FIREBASE_CONFIG = JSON.parse(process.env.FIREBASE_CONFIG || "{}");
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || FIREBASE_CONFIG.projectId || "ev-butcesi-96167";
const DATABASE_URL = FIREBASE_CONFIG.databaseURL || "https://ev-butcesi-96167-default-rtdb.europe-west1.firebasedatabase.app";

/**
 * AI yanıtından JSON parse eder (```json bloklarını temizler)
 * @param {string} text - AI'dan gelen ham text
 * @returns {object} Parse edilmiş JSON
 */
export function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

/**
 * Authorization başlığındaki Bearer token'ı alır
 * @param {object} req - HTTP request
 * @returns {string|null} Token veya null
 */
export function getToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token || null;
}

/** Firebase yönetici uygulaması (tek örnek). */
export function adminApp() {
  return getApps()[0] || initializeApp({ projectId: FIREBASE_PROJECT_ID, databaseURL: DATABASE_URL });
}

/**
 * Firebase ID token'ını imza, süre ve proje açısından doğrular.
 * @param {object} req - HTTP request
 * @returns {Promise<string|null>} Doğrulanmış kullanıcı UID'si veya null
 */
export async function verifyUser(req) {
  const token = getToken(req);
  if (!token) return null;
  try {
    const decoded = await getAuth(adminApp()).verifyIdToken(token);
    return decoded.uid || null;
  } catch {
    return null;
  }
}

/**
 * base64 veri ve medya türü doğrulaması (boyut sınırı dahil)
 * @param {object} body - req.body
 * @param {string[]} allowedTypes - izin verilen medya türleri
 * @param {number} maxBytes - çözülmüş verinin azami boyutu
 * @returns {string|null} Hata mesajı veya null
 */
export function checkFile(body, allowedTypes, maxBytes) {
  const { base64, mediaType } = body || {};
  if (typeof base64 !== "string" || !base64 || typeof mediaType !== "string") return "Dosya verisi eksik";
  if (!allowedTypes.includes(mediaType)) return "Desteklenmeyen dosya türü";
  if (Math.floor(base64.length * 3 / 4) > maxBytes) return "Dosya çok büyük";
  return null;
}
