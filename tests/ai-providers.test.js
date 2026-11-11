import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_MODEL, MODELS, callModel, costOf, modelInfo } from "../functions/ai/providers.js";

// Ağa çıkmadan: fetch sahte, gönderilen istek yakalanır.
async function capture(m, req, reply) {
  const realFetch = globalThis.fetch;
  const key = m.keyName;
  const saved = process.env[key];
  process.env[key] = "deneme";
  let sent;
  globalThis.fetch = async (url, init) => { sent = { url, headers: init.headers, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => reply }; };
  try { return { result: await callModel(m, req), sent }; }
  finally { globalThis.fetch = realFetch; if (saved === undefined) delete process.env[key]; else process.env[key] = saved; }
}

test("seçili model listede ve anahtar adı sağlayıcıdan gelir", () => {
  assert.ok(MODELS.some(m => m.id === AI_MODEL));
  assert.equal(modelInfo("claude-haiku-5-5").keyName, "ANTHROPIC_API_KEY");
  assert.equal(modelInfo("gemini-3.1-flash-lite").keyName, "GEMINI_API_KEY");
  assert.throws(() => modelInfo("yok-boyle-model"), /Bilinmeyen AI modeli/);
});

test("Claude: eski modelde düşünme bütçesi, 5.x'te uyarlanır düşünme; PDF belge olarak gider", async () => {
  const reply = { content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "tamam" }], usage: { input_tokens: 10, output_tokens: 5 } };
  const file = { base64: "aGVsbG8=", mediaType: "application/pdf" };
  const old = await capture(modelInfo("claude-sonnet-4-6"), { text: "t", file, maxTokens: 16000, thinkingBudget: 8000 }, reply);
  assert.deepEqual(old.sent.body.thinking, { type: "enabled", budget_tokens: 8000 });
  assert.equal(old.sent.body.messages[0].content[0].type, "document");
  assert.deepEqual(old.result, { text: "tamam", inTok: 10, outTok: 5 });
  const neu = await capture(modelInfo("claude-haiku-5-5"), { system: "s", text: "t", maxTokens: 4000, thinkingBudget: 2000 }, reply);
  assert.deepEqual(neu.sent.body.thinking, { type: "adaptive" });
  assert.equal(neu.sent.body.system, "s");
  assert.equal(neu.sent.headers["x-api-key"], "deneme");
});

test("Gemini: düşünce parçaları yanıta karışmaz, düşünme tokenları çıkışa sayılır", async () => {
  const reply = { candidates: [{ content: { parts: [{ text: "iç", thought: true }, { text: "yanıt" }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30 } };
  const { result, sent } = await capture(modelInfo("gemini-3.1-flash-lite"), { text: "t", file: { base64: "aGVsbG8=", mediaType: "image/png" }, maxTokens: 4000 }, reply);
  assert.deepEqual(result, { text: "yanıt", inTok: 100, outTok: 50 });
  assert.equal(sent.body.contents[0].parts[0].inline_data.mime_type, "image/png");
});

test("PDF okuyamayan model ve anahtarı olmayan sağlayıcı açık hata verir", async () => {
  await assert.rejects(capture(modelInfo("deepseek-flash"), { text: "t", file: { base64: "eA==", mediaType: "application/pdf" }, maxTokens: 10 }, {}), /PDF okuyamıyor/);
  const saved = process.env.MISTRAL_API_KEY; delete process.env.MISTRAL_API_KEY;
  await assert.rejects(callModel(modelInfo("mistral-small-latest"), { text: "t", maxTokens: 10 }), /API anahtarı yapılandırılmamış/);
  if (saved !== undefined) process.env.MISTRAL_API_KEY = saved;
});

test("maliyet: gerçek token × fiyat; Haiku 100 bin üstü fiyat; fiyatı bilinmeyende null", () => {
  assert.equal(costOf(modelInfo("claude-haiku-5-5"), 2000, 1000), 0.0007);
  assert.equal(costOf(modelInfo("claude-haiku-5-5"), 200000, 0), 0.1);
  assert.equal(costOf(modelInfo("mistral-small-latest"), 1, 1), null);
});
