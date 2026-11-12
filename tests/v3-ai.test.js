// v3 yapay zekâ bağlantısı: PDF ekstre sonucunun satır biçimi, fiş taslağı, danışman istemi ve yanıtı,
// istemci çağrısının hata iletileri (sahte fetch; ağa çıkılmaz). Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAiStatement, reconcileStatement } from "../src/core/index.js";
import { buildSampleState, SAMPLE_TODAY, SAMPLE_MEMBERS } from "../src/v3/sampleData.js";
import { advisorPrompt, adviceBlocks, receiptDraft } from "../src/v3/aiData.js";
import { callAi, AiError } from "../src/v3/ai.js";

const state = buildSampleState();

test("PDF ekstre sonucu metinden okunan satırlarla aynı biçime çevrilir", () => {
  const { rows, skipped } = parseAiStatement([
    { date: "05.11.2026", desc: "MIGROS  KADIKOY", amount: 1234.56 },
    { date: "01.11.2026", desc: "TEKNOSA 3/6", amount: "1.500,00" },
    { date: "2026-11-07", desc: "ECZANE", amount: "89.90" },
    { date: "bilinmiyor", desc: "X", amount: 10 },
    { date: "08.11.2026", desc: "Y", amount: 0 }
  ]);
  assert.equal(skipped, 2);
  assert.deepEqual(rows.map(r => [r.date, r.description, r.amount, r.credit, r.line]), [
    ["2026-11-05", "MIGROS KADIKOY", 123456, false, 1],
    ["2026-11-01", "TEKNOSA 3/6", 150000, false, 2],
    ["2026-11-07", "ECZANE", 8990, false, 3]
  ]);
  assert.deepEqual(rows[1].installment, { index: 3, total: 6 });
  assert.equal(rows[0].installment, null);
});

test("PDF ekstre satırları kart eşitlemesinden geçer", () => {
  const { rows } = parseAiStatement([{ date: "10.11.2026", desc: "YENI MAGAZA", amount: 777.77 }]);
  const r = reconcileStatement(state, "bonus", rows);
  assert.equal(r.onlyStatement.length, 1);
  assert.equal(r.totals.statement, 77777);
});

test("Boş ya da bozuk ekstre sonucu hata vermez", () => {
  assert.deepEqual(parseAiStatement(undefined), { rows: [], skipped: 0 });
  assert.deepEqual(parseAiStatement([null]), { rows: [], skipped: 1 });
});

test("Fiş taslağı toplamı kuruşa çevirir, toplam yoksa kalemlerden hesaplar", () => {
  assert.deepEqual(receiptDraft({ store: "  BİM  Kadıköy ", totalAmount: 245.9, items: [{ price: 1 }] }),
    { amount: 24590, store: "BİM Kadıköy", items: 1, fromItems: false });
  assert.deepEqual(receiptDraft({ store: "A101", items: [{ price: 12.5, qty: 2 }, { price: "3,25" }] }),
    { amount: 2825, store: "A101", items: 2, fromItems: true });
  assert.equal(receiptDraft({ store: "X", items: [] }).amount, null);
  assert.equal(receiptDraft(null).amount, null);
});

test("Danışman istemi dönem özetini içerir; işlem açıklaması ve üye adı içermez", () => {
  const p = advisorPrompt(state, SAMPLE_TODAY);
  for (const head of ["## Bu dönem", "## Önümüzdeki 6 dönemin planı", "## Birikim", "## İstenen"]) assert.ok(p.includes(head), head);
  assert.ok(p.length < 200000, "sunucu sınırı");
  for (const m of Object.values(SAMPLE_MEMBERS)) assert.ok(!p.includes(m.name), m.name);
  const named = new Set([state.categories, state.obligations, state.accounts, state.goals || {}].flatMap(o => Object.values(o).map(x => x.name)));
  const notes = Object.values(state.transactions).map(t => t.note).filter(n => n && n.length > 3 && ![...named].some(x => x && (x.includes(n) || n.includes(x))));
  assert.ok(notes.length > 0, "denetlenecek açıklama yok");
  for (const n of notes) assert.ok(!p.includes(n), n);
});

test("Danışman yanıtı başlık, madde ve paragrafa ayrılır; vurgu işaretleri atılır", () => {
  const b = adviceBlocks("## Durum\n\n- **Market** harcaması arttı\n1. Günlük 300 ₺ sınır\n---\nDüz metin");
  assert.deepEqual(b, [
    { type: "h", text: "Durum" },
    { type: "li", text: "Market harcaması arttı" },
    { type: "li", text: "1. Günlük 300 ₺ sınır" },
    { type: "p", text: "Düz metin" }
  ]);
});

test("İstemci çağrısı: oturum, jeton, hata ve başarı durumları", async () => {
  const original = globalThis.fetch;
  const user = { getIdToken: async () => "jeton" };
  const reply = (status, body) => async () => ({ status, ok: status < 300, json: async () => body });
  try {
    await assert.rejects(callAi(null, "aiAdvisor", {}), AiError);

    let seen;
    globalThis.fetch = async (url, init) => { seen = { url, init }; return { status: 200, ok: true, json: async () => ({ text: "tamam", remaining: 2 }) }; };
    assert.deepEqual(await callAi(user, "aiAdvisor", { prompt: "x" }), { text: "tamam", remaining: 2 });
    assert.ok(seen.url.endsWith("/aiAdvisor"));
    assert.equal(seen.init.headers.Authorization, "Bearer jeton");

    globalThis.fetch = reply(429, { error: "Günlük AI danışman hakkınız doldu (3/3). Yarın tekrar deneyin." });
    await assert.rejects(callAi(user, "aiAdvisor", {}), /hakkınız doldu/);
    globalThis.fetch = reply(401, { error: "Giriş yapmanız gerekiyor" });
    await assert.rejects(callAi(user, "aiAdvisor", {}), /yeniden giriş/);
    globalThis.fetch = reply(200, { error: "Fiş okunamadı" });
    await assert.rejects(callAi(user, "analyzeReceipt", {}), /Fiş okunamadı/);
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await assert.rejects(callAi(user, "aiAdvisor", {}), /Sunucuya ulaşılamadı/);
  } finally {
    globalThis.fetch = original;
  }
});
