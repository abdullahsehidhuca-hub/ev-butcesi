import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}")),
    databaseURL: "https://ev-butcesi-96167-default-rtdb.europe-west1.firebasedatabase.app"
  });
}

const DAILY_LIMIT = 3;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API anahtarı yapılandırılmamış" });

  // Firebase token doğrulama
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Giriş yapmanız gerekiyor" });

  let uid;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: "Geçersiz oturum. Çıkış yapıp tekrar giriş yapın." });
  }

  // Günlük limit kontrolü
  const today = new Date().toISOString().slice(0, 10);
  const db = getDatabase();
  const usageRef = db.ref(`usage/advisor/${uid}/${today}`);
  const snap = await usageRef.get();
  const count = snap.val() || 0;

  if (count >= DAILY_LIMIT) {
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
    await usageRef.set(count + 1);

    return res.status(200).json({ text, remaining: DAILY_LIMIT - count - 1 });
  } catch {
    return res.status(500).json({ error: "Analiz yapılamadı" });
  }
}
