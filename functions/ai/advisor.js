import { verifyUser } from "./common.js";
import { callModel, modelInfo } from "./providers.js";
import { reserveUsage, releaseUsage, DAILY_LIMITS, TOTAL_FULL_MESSAGE } from "./usage.js";

const DAILY_LIMIT = DAILY_LIMITS.advisor;
const MAX_PROMPT_CHARS = 200000;

// Model denemesi (scripts/ai-model-dene.mjs) aynı metni kullanır.
export const SYSTEM_PROMPT = `Sen deneyimli bir kişisel finans danışmanısın. Türk aile bütçesi yönetimi konusunda uzmansın.

ROLÜN:
- Muhasebeci değil, finansal STRATEJİST gibi düşün.
- Sayıları tekrarlama — arkasındaki hikayeyi, nedeni ve sonucu anlat.
- Her veriyi birbiriyle İLİŞKİLENDİR: harcama hızı + kalan gün + bekleyen ödemeler = gerçek risk.
- Sadece "ne olmuş" değil, "neden olmuş" ve "bu gidişle ne olacak" sorusuna cevap ver.

ANALİZ DERİNLİĞİ:
- Yüzeysel gözlem yapma. Verilerin altındaki örüntüyü bul.
- Dönemler arası karşılaştırmada sadece fark değil, trendin yönünü ve ivmesini yorumla.
- Kategori bazlı anomali tespiti yap — bir kategoride ani sıçrama varsa olası nedeni tahmin et.
- Nakit akışını gün bazlı düşün: hangi gün hangi ödeme çıkacak, kritik gün var mı?
- Davranışsal finans perspektifinden harcama alışkanlıklarını yorumla (impulse harcama, anchor etkisi, mental muhasebe hataları).

İLETİŞİM:
- Rakamlarla konuş — "azaltın" değil "günlük X TL ile sınırlayın" de.
- Kısa, net maddeler yaz. Paragraf değil, bullet point.
- Teşvik edici veya motive edici olmaya ÇALIŞMA — gerçekçi ve dürüst ol.
- Türkçe yaz, sade ve anlaşılır bir dille.
- Emoji kullanabilirsin ama abartma.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const uid = await verifyUser(req);
  if (!uid) return res.status(401).json({ error: "Giriş yapmanız gerekiyor" });

  const { prompt } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ error: "Prompt eksik" });
  if (prompt.length > MAX_PROMPT_CHARS) return res.status(400).json({ error: "Analiz verisi çok uzun" });

  try {
    // Hak model çağrısından önce atomik ayrılır; aynı anda gelen istekler sınırı aşamaz.
    const { count, full } = await reserveUsage(uid, "advisor");
    if (full === "total") return res.status(429).json({ error: TOTAL_FULL_MESSAGE, remaining: 0 });
    if (full) {
      return res.status(429).json({
        error: `Günlük AI danışman hakkınız doldu (${DAILY_LIMIT}/${DAILY_LIMIT}). Yarın tekrar deneyin.`,
        remaining: 0
      });
    }

    let text;
    try {
      ({ text } = await callModel(modelInfo(), {
        system: SYSTEM_PROMPT,
        text: prompt,
        maxTokens: 16000,
        thinkingBudget: 10000
      }));
    } catch (err) {
      // Model yanıt vermedi: maliyet yok, hak geri verilir.
      await releaseUsage(uid, "advisor").catch(() => {});
      throw err;
    }

    return res.status(200).json({ text, remaining: Math.max(0, DAILY_LIMIT - count) });
  } catch (err) {
    return res.status(500).json({ error: "Analiz yapılamadı: " + err.message });
  }
}
