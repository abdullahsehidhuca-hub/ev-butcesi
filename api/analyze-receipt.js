export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API anahtarı yapılandırılmamış" });
  }

  const { base64, mediaType } = req.body;
  if (!base64 || !mediaType) {
    return res.status(400).json({ error: "Görsel verisi eksik" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 }
            },
            {
              type: "text",
              text: `Bu bir market/mağaza fişi. Fişi analiz et ve SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:\n{"store":"mağaza adı","totalAmount":toplam_tutar_sayı,"items":[{"name":"ürün adı","qty":adet_sayı,"price":birim_fiyat_sayı,"brand":"marka veya boş string","category":"kategori"}]}\ncategory değerleri SADECE şunlardan biri olmalı: süt ürünleri, et/tavuk, meyve/sebze, temel gıda, atıştırmalık, içecek, temizlik, kişisel bakım, bebek/çocuk, diğer.\nFiyatlar Türk Lirası cinsindendir. Eğer fiş okunamıyorsa {"error":"Fiş okunamadı"} döndür.`
            }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = (data.content || []).map(c => c.text || "").join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Fiş analizi hatası:", err);
    return res.status(500).json({ error: "Fiş analiz edilemedi" });
  }
}
