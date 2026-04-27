module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API anahtari yapilandirilmamis" });
  }
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt eksik" });
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
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json();
    const text = (data.content || []).map(c => c.text || "").join("");
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: "Analiz yapilamadi" });
  }
};
