import { test } from "node:test";
import assert from "node:assert/strict";
import { clopperPearsonLower, runsNeeded, checkReceipt, checkStatement, checkAdvisor, ADVISOR_HEADINGS } from "../scripts/ai-model/olcut.mjs";

const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("Clopper-Pearson alt sınırı bilinen değerleri verir", () => {
  near(clopperPearsonLower(20, 20), Math.pow(0.05, 1 / 20)); // hatasız 20/20 → en az %86,09
  near(clopperPearsonLower(59, 59), Math.pow(0.05, 1 / 59)); // hatasız 59/59 → en az %95,05
  near(clopperPearsonLower(9, 10), 0.6058, 1e-3);
  assert.equal(clopperPearsonLower(0, 10), 0);
  assert.equal(clopperPearsonLower(0, 0), 0);
});

test("hedef oran için gereken hatasız deneme sayısı", () => {
  assert.equal(runsNeeded(0.95), 59);
  assert.equal(runsNeeded(0.90), 29);
});

const fis = { store: "Market", totalAmount: 105.5, items: [{ name: "Süt", qty: 2, price: 30, brand: "", category: "süt ürünleri" }, { name: "Ekmek", qty: 1, price: 45.5, brand: "", category: "temel gıda" }] };

test("fiş: toplam kuruşu kuruşuna tutmalı, kalemler tutarlı, kategori listeden", () => {
  assert.deepEqual(checkReceipt(fis, { toplam: 105.5 }), { ok: true, notes: [] });
  assert.equal(checkReceipt(fis, { toplam: 105.51 }).ok, false);
  assert.equal(checkReceipt({ ...fis, items: [{ ...fis.items[0], category: "süt" }, fis.items[1]] }, { toplam: 105.5 }).ok, false);
  assert.equal(checkReceipt({ ...fis, totalAmount: 200 }, { toplam: 200 }).ok, false);
  assert.equal(checkReceipt({ error: "Fiş okunamadı" }, { toplam: 1 }).ok, false);
});

test("ekstre: işlem sayısı ve toplam beklenene eşit olmalı", () => {
  const r = { transactions: [{ date: "01.10.2026", desc: "A", amount: 10.1 }, { date: "02.10.2026", desc: "B", amount: 20.2 }] };
  assert.equal(checkStatement(r, { adet: 2, toplam: 30.3 }).ok, true);
  assert.equal(checkStatement(r, { adet: 3, toplam: 30.3 }).ok, false);
  assert.equal(checkStatement(r, { adet: 2, toplam: 30.31 }).ok, false);
  assert.equal(checkStatement({ transactions: [{ date: "2026-10-01", desc: "A", amount: 1 }] }, { adet: 1, toplam: 1 }).ok, false);
});

test("danışman: tüm başlıklar ve Türkçe metin", () => {
  const full = ADVISOR_HEADINGS.map(h => `## ${h}\n- ${"Günlük harcamayı sınırlayın. ".repeat(12)}`).join("\n");
  assert.equal(checkAdvisor(full).ok, true);
  assert.equal(checkAdvisor(full.replace("5 Somut Adım", "Adımlar")).ok, false);
  assert.equal(checkAdvisor("kısa").ok, false);
});
