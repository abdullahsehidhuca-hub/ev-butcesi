import { callAnthropic, parseJSON, verifyUser, checkFile } from "./_anthropic.js";

const DOC_TYPES = ["application/pdf"];
const MAX_BYTES = 4 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const uid = await verifyUser(req);
  if (!uid) return res.status(401).json({ error: "Giriş yapmanız gerekiyor" });

  const fileError = checkFile(req.body, DOC_TYPES, MAX_BYTES);
  if (fileError) return res.status(400).json({ error: fileError });
  const { base64, mediaType } = req.body;

  try {
    const { text } = await callAnthropic({
      maxTokens: 16000,
      thinkingBudget: 8000,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: `Bu bir banka/kredi kartı ekstresi (hesap özeti). Ekstredeki TÜM harcama işlemlerini analiz et.

KURALLAR:
- Sadece HARCAMA işlemlerini al (borç/alacak sütunundaki harcamalar)
- Ödeme, iade, puan gibi alacak kayıtlarını ALMA
- Taksit satırlarını da dahil et
- Tutarları pozitif sayı olarak yaz
- Tarihleri DD.MM.YYYY formatında yaz
- Açıklamayı olduğu gibi kopyala, kısaltma

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{"transactions":[{"date":"tarih","desc":"işlem açıklaması","amount":tutar_sayı}]}

Eğer ekstre okunamıyorsa {"error":"Ekstre okunamadı"} döndür.` }
        ]
      }]
    });

    const parsed = parseJSON(text);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "Ekstre analiz edilemedi: " + err.message });
  }
}
