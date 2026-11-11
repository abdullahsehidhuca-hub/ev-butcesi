// AI sağlayıcıları: tek tip istek ({ system, text, file, maxTokens, thinkingBudget }) → { text, inTok, outTok }.
// Deneme betiği (scripts/ai-model-dene.mjs) aynı kodu kullanır; denemede ölçülen davranış üretimdekiyle aynıdır.

// Üretimde kullanılan model. Model değiştirmek için yalnız bu satır değişir, ardından `npm run ai:kurulum`
// (yeni sağlayıcının anahtarını sorar ve yükler). Seçenekler aşağıdaki MODELS listesindedir.
export const AI_MODEL = "claude-sonnet-4-6";

export const KEY_NAMES = { anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY", deepseek: "DEEPSEEK_API_KEY", mistral: "MISTRAL_API_KEY" };

// price: 1 milyon token başına $ (giriş, çıkış; çıkışa düşünme dahil). Kaynak ve tarih: docs/AI-MODEL-VE-MALIYET-RAPORU.md
// (12 Kasım 2026). Mistral fiyatları doğrulanamadı (null). pdf: false → PDF ekstre okuyamaz.
export const MODELS = [
  { id: "claude-sonnet-4-6", provider: "anthropic", thinking: "legacy", price: [3, 15] },
  { id: "claude-sonnet-5-5", provider: "anthropic", thinking: "adaptive", price: [2, 10] },
  { id: "claude-haiku-5-5", provider: "anthropic", thinking: "adaptive", price: [0.10, 0.50], over100k: [0.50, 2.50] },
  { id: "gemini-3.1-flash-lite", provider: "gemini", price: [0.25, 1.50] },
  { id: "gemini-3.8-flash", provider: "gemini", price: [0.75, 3.75] },
  { id: "deepseek-flash", provider: "deepseek", price: [0.30, 1.20], pdf: false },
  { id: "mistral-small-latest", provider: "mistral", price: null, pdf: false },
  { id: "mistral-medium-latest", provider: "mistral", price: null, pdf: false }
];

/** Model bilgisi ve anahtarının gizli depodaki adı; bilinmeyen modelde yükleme baştan durur. */
export function modelInfo(id = AI_MODEL) {
  const m = MODELS.find(x => x.id === id);
  if (!m) throw new Error(`Bilinmeyen AI modeli: ${id}. Seçenekler: ${MODELS.map(x => x.id).join(", ")}`);
  return { ...m, keyName: KEY_NAMES[m.provider] };
}

async function postJSON(url, headers, body, timeoutMs) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error?.message || `AI yanıt hatası (HTTP ${res.status})`);
  return data;
}

async function anthropic(m, { system, text, file, maxTokens, thinkingBudget }, key, timeoutMs) {
  const content = file
    ? [{ type: file.mediaType === "application/pdf" ? "document" : "image", source: { type: "base64", media_type: file.mediaType, data: file.base64 } }, { type: "text", text }]
    : text;
  const body = { model: m.id, max_tokens: maxTokens, messages: [{ role: "user", content }] };
  // Claude 4.7 ve sonrası "budget_tokens" düşünmesini reddeder (HTTP 400); onlarda uyarlanır (adaptive) düşünme kullanılır.
  body.thinking = m.thinking === "legacy" ? { type: "enabled", budget_tokens: thinkingBudget } : { type: "adaptive" };
  if (system) body.system = system;
  const d = await postJSON("https://api.anthropic.com/v1/messages", { "x-api-key": key, "anthropic-version": "2023-06-01" }, body, timeoutMs);
  const out = (d.content || []).filter(c => c.type === "text").map(c => c.text || "").join("");
  return { text: out, inTok: d.usage?.input_tokens || 0, outTok: d.usage?.output_tokens || 0 };
}

async function gemini(m, { system, text, file, maxTokens }, key, timeoutMs) {
  const parts = file ? [{ inline_data: { mime_type: file.mediaType, data: file.base64 } }, { text }] : [{ text }];
  const body = { contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: maxTokens } };
  if (system) body.system_instruction = { parts: [{ text: system }] };
  const d = await postJSON(`https://generativelanguage.googleapis.com/v1beta/models/${m.id}:generateContent`, { "x-goog-api-key": key }, body, timeoutMs);
  const out = (d.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || "").join("");
  const u = d.usageMetadata || {};
  return { text: out, inTok: u.promptTokenCount || 0, outTok: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) };
}

async function openAICompatible(m, { system, text, file, maxTokens }, key, timeoutMs) {
  const isMistral = m.provider === "mistral";
  const url = isMistral ? "https://api.mistral.ai/v1/chat/completions" : "https://api.deepseek.com/chat/completions";
  const dataUri = file && `data:${file.mediaType};base64,${file.base64}`;
  const image = file && (isMistral ? { type: "image_url", image_url: dataUri } : { type: "image_url", image_url: { url: dataUri } });
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: file ? [{ type: "text", text }, image] : text });
  const d = await postJSON(url, { Authorization: `Bearer ${key}` }, { model: m.id, max_tokens: maxTokens, messages }, timeoutMs);
  return { text: d.choices?.[0]?.message?.content || "", inTok: d.usage?.prompt_tokens || 0, outTok: d.usage?.completion_tokens || 0 };
}

const CALL = { anthropic, gemini, deepseek: openAICompatible, mistral: openAICompatible };

/**
 * Modeli çağırır. Anahtar, sağlayıcının gizli depodaki adıyla ortam değişkeninden okunur.
 * @param {object} m - modelInfo() sonucu
 * @param {{system?: string, text: string, file?: {base64: string, mediaType: string}, maxTokens: number, thinkingBudget: number}} req
 */
export async function callModel(m, req, { timeoutMs = 240000 } = {}) {
  const key = process.env[KEY_NAMES[m.provider]];
  if (!key) throw new Error("API anahtarı yapılandırılmamış");
  if (req.file?.mediaType === "application/pdf" && m.pdf === false) throw new Error(`${m.id} PDF okuyamıyor`);
  return CALL[m.provider](m, req, key, timeoutMs);
}

/** Gerçek token sayısından çağrı maliyeti ($); fiyat bilinmiyorsa null. */
export function costOf(m, inTok, outTok) {
  if (!m.price) return null;
  const [pin, pout] = m.over100k && inTok > 100000 ? m.over100k : m.price;
  return (inTok * pin + outTok * pout) / 1e6;
}
