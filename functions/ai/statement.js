import { parseJSON, verifyUser, checkFile } from "./common.js";
import { callModel, modelInfo } from "./providers.js";
import { usageToday, addUsage, DAILY_LIMITS } from "./usage.js";

const DOC_TYPES = ["application/pdf"];
const MAX_BYTES = 4 * 1024 * 1024;

// Model denemesi (scripts/ai-model-dene.mjs) aynı metni kullanır.
export const STATEMENT_PROMPT = `Bu bir banka/kredi kartı ekstresi (hesap özeti). Ekstredeki TÜM harcama işlemlerini analiz et.

KURALLAR:
- Sadece HARCAMA işlemlerini al (borç/alacak sütunundaki harcamalar)
- Ödeme, iade, puan gibi alacak kayıtlarını ALMA
- Taksit satırlarını da dahil et
- Tutarları pozitif sayı olarak yaz
- Tarihleri DD.MM.YYYY formatında yaz
- Açıklamayı olduğu gibi kopyala, kısaltma

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{"transactions":[{"date":"tarih","desc":"işlem açıklaması","amount":tutar_sayı}]}

Eğer ekstre okunamıyorsa {"error":"Ekstre okunamadı"} döndür.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const uid = await verifyUser(req);
  if (!uid) return res.status(401).json({ error: "Giriş yapmanız gerekiyor" });

  const fileError = checkFile(req.body, DOC_TYPES, MAX_BYTES);
  if (fileError) return res.status(400).json({ error: fileError });
  const { base64, mediaType } = req.body;

  try {
    // Kayıt herkese açık: her kullanıcının günlük hakkı sınırlı (maliyet koruması).
    if (await usageToday(uid, "statement") >= DAILY_LIMITS.statement) {
      return res.status(429).json({ error: `Bugünkü ekstre okuma hakkınız doldu (${DAILY_LIMITS.statement}). Yarın yeniden deneyin.` });
    }
    const { text } = await callModel(modelInfo(), {
      text: STATEMENT_PROMPT,
      file: { base64, mediaType },
      maxTokens: 16000,
      thinkingBudget: 8000
    });

    // Model yanıt verdiyse maliyet oluşmuştur; yanıt okunamasa da hak düşer.
    await addUsage(uid, "statement");
    const parsed = parseJSON(text);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "Ekstre analiz edilemedi: " + err.message });
  }
}
