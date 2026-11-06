import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, addAccount, addObligation, putRecord,
  computePeriod, closePeriod, quickAdd, payObligation, addInstallmentPurchase,
  balanceOf, reconcile,
  normalizeText, matchesKeyword, merchantKey, suggestCategory, learnCategory
} from "../src/core/index.js";

const NOW = new Date("2026-11-01T09:00:00Z");
let seq = 0;
const ctx = () => ({ id: `a${++seq}`, now: NOW, userId: "u1" });

function fixture() {
  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay: 15, defaultAccountId: "bank" } };
  s = addAccount(s, { id: "bank", name: "Banka", type: "bank", currency: "TRY", opening: { date: "2026-10-15", balance: 10000_00 } });
  s = addAccount(s, { id: "card", name: "Kart", type: "credit", currency: "TRY", opening: { date: "2026-10-15", balance: 0 } });
  s = putRecord(s, "categories", { id: "market", name: "Market", keywords: ["migros", "a101", "bim"] });
  s = putRecord(s, "categories", { id: "telefon", name: "Telefon", keywords: ["turk"] });
  s = putRecord(s, "categories", { id: "internet", name: "İnternet", keywords: ["turk telekom"] });
  s = putRecord(s, "categories", { id: "fatura", name: "Doğalgaz", keywords: ["igdas", "axa"] });
  s = putRecord(s, "categories", { id: "eski", name: "Eski", keywords: ["sok"], archived: true });
  s = addObligation(s, { id: "maas", kind: "income", name: "Maaş", amount: 60000_00, currency: "TRY", accountId: "bank", startPeriod: "2026-10" });
  return s;
}

test("etiketleme: Türkçe büyük harf ve ş/ğ/ı/İ farkları eşleşmeyi bozmaz", () => {
  assert.equal(normalizeText("MİGROS ŞİŞLİ"), "migros sisli");
  assert.equal(normalizeText("İGDAŞ-FATURA*2026"), "igdas fatura 2026");
  assert.equal(normalizeText("ÇAĞRI ÖĞÜT IŞIK"), "cagri ogut isik");
  const s = fixture();
  assert.equal(suggestCategory(s, "MİGROS 4471 KONYA").categoryId, "market");
  assert.equal(suggestCategory(s, "İGDAŞ FATURA ÖDEME").categoryId, "fatura");
});

test("etiketleme: yalnız kelime başında eşleşir, en uzun anahtar kazanır, arşiv yok sayılır", () => {
  const s = fixture();
  assert.equal(matchesKeyword(normalizeText("MAXAMAX OTOMOTIV"), "axa"), false);
  assert.equal(matchesKeyword(normalizeText("KOMBIMARKET"), "bim"), false);
  assert.equal(suggestCategory(s, "MAXAMAX OTOMOTIV"), null);
  assert.deepEqual(suggestCategory(s, "TURK TELEKOM INTERNET"), { categoryId: "internet", source: "keyword", keyword: "turk telekom" });
  assert.equal(suggestCategory(s, "TURKCELL FATURA").categoryId, "telefon");
  assert.equal(suggestCategory(s, "ŞOK MARKET"), null, "arşivlenmiş kategori önerilmez");
  assert.equal(suggestCategory(s, ""), null);
});

test("etiketleme: kullanıcı düzeltmesi öğrenilir ve önce o kullanılır", () => {
  assert.equal(merchantKey("MIGROS 4471 KONYA"), "migros konya");
  assert.equal(merchantKey("MİGROS 9999 KONYA"), "migros konya", "şube no farklı, satıcı aynı");
  let s = fixture();
  s = learnCategory(s, "TURK TELEKOM INTERNET", "telefon");
  assert.deepEqual(suggestCategory(s, "TÜRK TELEKOM İNTERNET 123"), { categoryId: "telefon", source: "learned" });
  assert.equal(learnCategory(s, "X", "yok"), s, "olmayan kategori öğrenilmez");
});

test("kart: otomatik taksit kart bakiyesine dönem başında yansır, ödenince sıfırlanır", () => {
  let s = addInstallmentPurchase(fixture(), { id: "tv", name: "Televizyon", total: 3000_00, count: 3, accountId: "card", date: "2026-10-20" });
  s = quickAdd(s, { amount: 200_00, categoryId: "market", accountId: "card", date: "2026-10-21" }, ctx()).state;
  assert.equal(balanceOf(s, "card", "2026-10-31"), -1200_00, "1. taksit + 200 harcama");
  assert.equal(balanceOf(s, "card", "2026-11-20"), -2200_00, "2. taksit 15 Kasım'da eklendi");
  s = quickAdd(s, { type: "transfer", amount: 1200_00, accountId: "bank", toAccountId: "card", date: "2026-11-18" }, ctx()).state;
  assert.equal(balanceOf(s, "card", "2026-11-20"), -1000_00);
  const r = reconcile(s, "card", "2026-11-20", -1000_00);
  assert.equal(r.matched, true);
  assert.equal(r.movements.filter(m => m.type === "auto").length, 2);
  assert.equal(computePeriod(s, "2026-11").cards[0].due, 0, "ekim ekstresi (1.200) ödendi");
});

test("kart: taksit ayrıca 'ödendi' girilirse çift sayılmaz", () => {
  let s = addInstallmentPurchase(fixture(), { id: "tv", name: "Televizyon", total: 3000_00, count: 3, accountId: "card", date: "2026-10-20" });
  s = payObligation(s, "tv", "2026-10", { date: "2026-10-20" }, ctx()).state;
  assert.equal(balanceOf(s, "card", "2026-10-31"), -1000_00);
  assert.equal(computePeriod(s, "2026-11").cards[0].charges, 1000_00);
  assert.equal(computePeriod(s, "2026-10").obligations.total, 1000_00);
});

test("ay kapatma: karttaki taksit devredilmez (eskiden ertesi aya çift düşebilirdi)", () => {
  let s = addInstallmentPurchase(fixture(), { id: "tv", name: "Televizyon", total: 3000_00, count: 3, accountId: "card", date: "2026-10-20" });
  s = addObligation(s, { id: "kira", kind: "fixed", name: "Kira", amount: 20000_00, currency: "TRY", accountId: "bank", startPeriod: "2026-10" });
  s = closePeriod(s, "2026-10", {});
  assert.deepEqual(s.closedPeriods["2026-10"].decisions, [{ obligationId: "kira", decision: "carry" }]);
  const nov = computePeriod(s, "2026-11");
  assert.equal(nov.obligations.items.filter(i => i.obligationId.startsWith("tv")).length, 1, "yalnız 2. taksit");
});

test("gelir: maaş 'alındı' yerine ayrı gelir girilse de çift sayılmaz", () => {
  let s = fixture();
  s = quickAdd(s, { type: "income", amount: 60000_00, accountId: "bank", date: "2026-10-15" }, ctx()).state;
  let r = computePeriod(s, "2026-10");
  assert.equal(r.income.total, 60000_00);
  assert.equal(r.income.expectedOpen, 0);
  s = quickAdd(s, { type: "income", amount: 5000_00, accountId: "bank", date: "2026-10-20" }, ctx()).state;
  r = computePeriod(s, "2026-10");
  assert.equal(r.income.total, 65000_00, "beklenenden fazlası ek gelir sayılır");
  const half = quickAdd(fixture(), { type: "income", amount: 20000_00, accountId: "bank", date: "2026-10-15" }, ctx()).state;
  assert.equal(computePeriod(half, "2026-10").income.expectedOpen, 40000_00);
  assert.equal(computePeriod(half, "2026-10").income.total, 60000_00);
});
