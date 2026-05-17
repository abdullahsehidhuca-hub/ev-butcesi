export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API anahtarı yapılandırılmamış" });

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Giriş yapmanız gerekiyor" });

  const { base64, mediaType } = req.body;
  if (!base64 || !mediaType) return res.status(400).json({ error: "PDF verisi eksik" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2025-04-15"
      },
      body: JSON.stringify({
        model: "claude-opus-4-7",
        max_tokens: 16000,
        thinking: {
          type: "enabled",
          budget_tokens: 8000
        },
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: mediaType, data: base64 }
            },
            {
              type: "text",
              text: `Bu bir banka/kredi kartı ekstresi (hesap özeti). Ekstredeki TÜM harcama işlemlerini analiz et.

KURALLAR:
- Sadece HARCAMA işlemlerini al (borç/alacak sütunundaki harcamalar)
- Ödeme, iade, puan gibi alacak kayıtlarını ALMA
- Taksit satırlarını da dahil et
- Tutarları pozitif sayı olarak yaz
- Tarihleri DD.MM.YYYY formatında yaz
- Açıklamayı olduğu gibi kopyala, kısaltma

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{"transactions":[{"date":"tarih","desc":"işlem açıklaması","amount":tutar_sayı}]}

Eğer ekstre okunamıyorsa {"error":"Ekstre okunamadı"} döndür.`
            }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message || "AI yanıt hatası" });

    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text || "").join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    if (parsed.error) return res.status(400).json({ error: parsed.error });

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "Ekstre analiz edilemedi: " + err.message });
  }
}
