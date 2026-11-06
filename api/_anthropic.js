// Ortak Anthropic API yapılandırması
// Model, versiyon, thinking ayarları tek yerden yönetilir.
// Değişiklik gerektiğinde sadece bu dosyayı güncelle.

import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const MODEL = "claude-sonnet-4-6";
const API_VERSION = "2023-06-01";
const API_URL = "https://api.anthropic.com/v1/messages";

// Token doğrulaması yalnızca proje kimliği ister (Google'ın açık anahtarlarıyla imza denetlenir);
// servis hesabı gerekmez. Proje kimliği gizli değildir.
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "ev-butcesi-96167";

/**
 * Anthropic API'ye mesaj gönderir ve text yanıtı döndürür.
 * @param {object} options
 * @param {Array} options.messages - API mesajları
 * @param {string} [options.system] - System prompt (opsiyonel)
 * @param {number} [options.maxTokens=4000] - Maksimum token
 * @param {number} [options.thinkingBudget=2000] - Thinking token bütçesi
 * @returns {Promise<{text: string, parsed?: object}>}
 */
export async function callAnthropic({ messages, system, maxTokens = 4000, thinkingBudget = 2000 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("API anahtarı yapılandırılmamış");

  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "enabled", budget_tokens: thinkingBudget },
    messages
  };
  if (system) body.system = system;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "AI yanıt hatası");

  const text = (data.content || [])
    .filter(c => c.type === "text")
    .map(c => c.text || "")
    .join("");

  return { text };
}

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

function adminAuth() {
  const app = getApps()[0] || initializeApp({ projectId: FIREBASE_PROJECT_ID });
  return getAuth(app);
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
    const decoded = await adminAuth().verifyIdToken(token);
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
