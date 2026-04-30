const DAILY_LIMIT = 3;
const usageMap = {};

// Basit günlük limit — bellekte tutar (cold start'larda sıfırlanabilir ama 20 kişi için yeterli)
function checkLimit(uid) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${uid}_${today}`;
  // Eski günlerin verisini temizle
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API anahtarı yapılandırılmamış" });

  // Token varlık kontrolü (giriş yapmış kullanıcı)
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Giriş yapmanız gerekiyor" });

  // Token'dan UID çıkar (Firebase ID token'ın payload kısmı)
  let uid = "unknown";
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    uid = payload.user_id || payload.sub || "unknown";
  } catch {}

  // Günlük limit kontrolü
  const { allowed, remaining, count } = checkLimit(uid);
  if (!allowed) {
    return res.status(429).json({
      error: `Günlük AI danışman hakkınız doldu (${DAILY_LIMIT}/${DAILY_LIMIT}). Yarın tekrar deneyin.`,
      remaining: 0
    });
  }

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt eksik" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message || "AI yanıt hatası" });

    const text = (data.content || []).map(c => c.text || "").join("");

    // Başarılı — sayacı artır
    incrementUsage(uid);

    return res.status(200).json({ text, remaining });
  } catch (err) {
    return res.status(500).json({ error: "Analiz yapılamadı: " + err.message });
  }
}
