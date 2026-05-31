import { callAnthropic, getToken, getUid } from "./_anthropic.js";

const DAILY_LIMIT = 3;
const usageMap = {};

const SYSTEM_PROMPT = `Sen deneyimli bir kişisel finans danışmanısın. Türk aile bütçesi yönetimi konusunda uzmansın.

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

function checkLimit(uid) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${uid}_${today}`;
  for (const k of Object.keys(usageMap)) {
    if (!k.endsWith(today)) delete usageMap[k];
  }
  const count = usageMap[key] || 0;
  return { count, allowed: count < DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - count - 1) };
}

function incrementUsage(uid) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${uid}_${today}`;
  usageMap[key] = (usageMap[key] || 0) + 1;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Giriş yapmanız gerekiyor" });

  const uid = getUid(token);

  const { allowed, remaining } = checkLimit(uid);
  if (!allowed) {
    return res.status(429).json({
      error: `Günlük AI danışman hakkınız doldu (${DAILY_LIMIT}/${DAILY_LIMIT}). Yarın tekrar deneyin.`,
      remaining: 0
    });
  }

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt eksik" });

  try {
    const { text } = await callAnthropic({
      maxTokens: 16000,
      thinkingBudget: 10000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }]
    });

    incrementUsage(uid);
    return res.status(200).json({ text, remaining });
  } catch (err) {
    return res.status(500).json({ error: "Analiz yapılamadı: " + err.message });
  }
}
