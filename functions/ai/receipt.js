import { parseJSON, verifyUser, checkFile } from "./common.js";
import { callModel, modelInfo } from "./providers.js";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 4 * 1024 * 1024;

// Model denemesi (scripts/ai-model-dene.mjs) aynı metni kullanır.
export const RECEIPT_PROMPT = `Bu bir market/mağaza fişi. Fişi analiz et ve SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{"store":"mağaza adı","totalAmount":toplam_tutar_sayı,"items":[{"name":"ürün adı","qty":adet_sayı,"price":birim_fiyat_sayı,"brand":"marka veya boş string","category":"kategori"}]}
category değerleri SADECE şunlardan biri olmalı: süt ürünleri, et/tavuk, meyve/sebze, temel gıda, atıştırmalık, içecek, temizlik, kişisel bakım, bebek/çocuk, diğer.
Fiyatlar Türk Lirası cinsindendir. Eğer fiş okunamıyorsa {"error":"Fiş okunamadı"} döndür.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const uid = await verifyUser(req);
  if (!uid) return res.status(401).json({ error: "Giriş yapmanız gerekiyor" });

  const fileError = checkFile(req.body, IMAGE_TYPES, MAX_BYTES);
  if (fileError) return res.status(400).json({ error: fileError });
  const { base64, mediaType } = req.body;

  try {
    const { text } = await callModel(modelInfo(), {
      text: RECEIPT_PROMPT,
      file: { base64, mediaType },
      maxTokens: 4000,
      thinkingBudget: 2000
    });

    const parsed = parseJSON(text);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "Fiş analiz edilemedi: " + err.message });
  }
}
