// Ortak Anthropic API yapılandırması
// Model, versiyon, thinking ayarları tek yerden yönetilir.
// Değişiklik gerektiğinde sadece bu dosyayı güncelle.

const MODEL = "claude-sonnet-4-6";
const API_VERSION = "2023-06-01";
const API_URL = "https://api.anthropic.com/v1/messages";

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
 * Firebase token varlık kontrolü (basit format kontrolü)
 * @param {object} req - HTTP request
 * @returns {string|null} Token veya null
 */
export function getToken(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  return token || null;
}

/**
 * Token'dan Firebase UID çıkarır
 * @param {string} token - Firebase ID token
 * @returns {string} UID
 */
export function getUid(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    return payload.user_id || payload.sub || "unknown";
  } catch {
    return "unknown";
  }
}
