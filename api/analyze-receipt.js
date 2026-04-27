module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API anahtari yapilandirilmamis" });
  }
  const { base64, mediaType } = req.body;
  if (!base64 || !mediaType) {
    return res.status(400).json({ error: "Gorsel verisi eksik" });
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
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "Bu bir market/magaza fisi. Fisi analiz et ve SADECE asagidaki JSON formatinda yanit ver, baska hicbir sey yazma:\n{\"store\":\"magaza adi\",\"totalAmount\":toplam_tutar_sayi,\"items\":[{\"name\":\"urun adi\",\"qty\":adet_sayi,\"price\":birim_fiyat_sayi,\"brand\":\"marka veya bos string\",\"category\":\"kategori\"}]}\ncategory degerleri SADECE sunlardan biri olmali: sut urunleri, et/tavuk, meyve/sebze, temel gida, atistirmalik, icecek, temizlik, kisisel bakim, bebek/cocuk, diger.\nFiyatlar Turk Lirasi cinsindendir. Eger fis okunamiyor sa {\"error\":\"Fis okunamadi\"} dondur." }
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
    return res.status(500).json({ error: "Fis analiz edilemedi" });
  }
};
