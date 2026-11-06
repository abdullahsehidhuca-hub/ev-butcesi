import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, addAccount, addObligation, putRecord, ValidationError,
  updateTransaction, deleteTransaction, archiveCategory, deleteCategory, deleteAccount,
  deleteObligation, endObligation, setPayDay, learnCategory,
  computePeriod, closePeriod, quickAdd, payObligation, favorites, balanceOf, occurrence
} from "../src/core/index.js";

const NOW = new Date("2026-11-01T09:00:00Z");
let seq = 0;
const ctx = () => ({ id: `i${++seq}`, now: NOW, userId: "u1" });

function fixture() {
  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay: 15, defaultAccountId: "bank" } };
  s = addAccount(s, { id: "bank", name: "Banka", type: "bank", currency: "TRY", opening: { date: "2026-10-15", balance: 0 } });
  s = addAccount(s, { id: "card", name: "Kart", type: "credit", currency: "TRY", opening: { date: "2026-10-15", balance: 0 } });
  s = putRecord(s, "categories", { id: "market", name: "Market" });
  s = putRecord(s, "categories", { id: "bos", name: "Boş" });
  s = addObligation(s, { id: "kira", kind: "fixed", name: "Kira", amount: 20000_00, currency: "TRY", accountId: "bank", startPeriod: "2026-10" });
  return s;
}

test("kısmi ödeme kalemi kapatmaz, kalan açık kalır", () => {
  let s = payObligation(fixture(), "kira", "2026-10", { amount: 5000_00, partial: true, date: "2026-10-20" }, ctx()).state;
  let kira = computePeriod(s, "2026-10").obligations.items[0];
  assert.equal(kira.settled, false);
  assert.equal(kira.open, 15000_00);
  assert.equal(kira.cost, 20000_00);
  s = payObligation(s, "kira", "2026-10", { amount: 15000_00, date: "2026-10-25" }, ctx()).state;
  kira = computePeriod(s, "2026-10").obligations.items[0];
  assert.equal(kira.settled, true);
  assert.equal(kira.open, 0);
  assert.equal(kira.cost, 20000_00);
});

test("iade kategoriden, kart borcundan ve kart bakiyesinden düşer", () => {
  let s = quickAdd(fixture(), { amount: 1000_00, categoryId: "market", accountId: "card", date: "2026-10-20" }, ctx()).state;
  s = quickAdd(s, { type: "refund", amount: 300_00, categoryId: "market", accountId: "card", date: "2026-10-22" }, ctx()).state;
  assert.equal(computePeriod(s, "2026-10").spending.byCategory.market, 700_00);
  assert.equal(computePeriod(s, "2026-11").cards[0].charges, 700_00);
  assert.equal(balanceOf(s, "card", "2026-10-31"), -700_00);
});

test("düzenleme her ekrana yansır; kapalı döneme dokunulamaz", () => {
  let s = fixture();
  const oct = quickAdd(s, { amount: 100_00, categoryId: "market", date: "2026-10-20" }, ctx());
  s = oct.state;
  const nov = quickAdd(s, { amount: 200_00, categoryId: "market", date: "2026-11-20" }, ctx());
  s = nov.state;
  s = updateTransaction(s, nov.transaction.id, { amount: 250_00 });
  assert.equal(computePeriod(s, "2026-11").spending.byCategory.market, 250_00, "aylık özet");
  assert.equal(balanceOf(s, "bank", "2026-11-30"), -350_00, "hesap bakiyesi");
  assert.equal(favorites(s, { now: new Date("2026-11-25T00:00:00Z") })[0].lastAmount, 250_00, "kısayollar");

  s = closePeriod(s, "2026-10", {});
  assert.throws(() => updateTransaction(s, oct.transaction.id, { amount: 1_00 }), ValidationError);
  assert.throws(() => deleteTransaction(s, oct.transaction.id), ValidationError);
  assert.throws(() => updateTransaction(s, nov.transaction.id, { date: "2026-10-25" }), ValidationError, "açık dönemdeki kayıt kapalı döneme taşınamaz");
  s = deleteTransaction(s, nov.transaction.id);
  assert.equal(computePeriod(s, "2026-11").spending.total, 0);
  assert.throws(() => updateTransaction(s, "yok", {}), ValidationError);
});

test("kullanımdaki kategori/hesap/yükümlülük silinmez; arşivlenir ya da sonlandırılır", () => {
  let s = quickAdd(fixture(), { amount: 100_00, categoryId: "market", date: "2026-10-20" }, ctx()).state;
  assert.throws(() => deleteCategory(s, "market"), ValidationError);
  s = archiveCategory(s, "market");
  assert.deepEqual(favorites(s, { now: NOW }), [], "arşivlenen kategori kısayolda görünmez");
  assert.equal(computePeriod(s, "2026-10").spending.byCategory.market, 100_00, "geçmiş raporda kalır");

  s = learnCategory(s, "BOS MAGAZA", "bos");
  s = deleteCategory(s, "bos");
  assert.equal(s.categories.bos, undefined);
  assert.deepEqual(s.merchantLabels, {}, "silinen kategoriye ait öğrenilmiş etiket de silinir");

  assert.throws(() => deleteAccount(s, "bank"), ValidationError);
  s = payObligation(s, "kira", "2026-10", {}, ctx()).state;
  assert.throws(() => deleteObligation(s, "kira"), ValidationError);
  s = endObligation(s, "kira", "2026-11");
  assert.ok(occurrence(s.obligations.kira, "2026-11"));
  assert.equal(occurrence(s.obligations.kira, "2026-12"), null);
});

test("maaş günü değişince eski işlemler ay değiştirmez", () => {
  let s = quickAdd(fixture(), { amount: 100_00, categoryId: "market", date: "2026-10-20" }, ctx()).state;
  s = setPayDay(s, 25);
  assert.equal(s.settings.payDay, 25);
  assert.equal(computePeriod(s, "2026-10").spending.total, 100_00, "eski kayıt Ekim'de kalır");
  s = quickAdd(s, { amount: 50_00, categoryId: "market", date: "2026-10-20" }, ctx()).state;
  assert.equal(computePeriod(s, "2026-09").spending.total, 50_00, "yeni kayıt yeni kurala göre Eylül'e düşer");
  assert.throws(() => setPayDay(s, 0), ValidationError);
  assert.throws(() => setPayDay(s, 32), ValidationError);
});

test("yükümlülük doğrulaması: kategori ve son ödeme günü", () => {
  const s = fixture();
  assert.throws(() => addObligation(s, { id: "x", kind: "fixed", name: "X", amount: 1_00, currency: "TRY", accountId: "bank", startPeriod: "2026-10", categoryId: "yok" }), ValidationError);
  assert.throws(() => addObligation(s, { id: "y", kind: "fixed", name: "Y", amount: 1_00, currency: "TRY", accountId: "bank", startPeriod: "2026-10", dueDay: 32 }), ValidationError);
});
