import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, addAccount, addObligation, putRecord, skipObligation, ValidationError,
  occurrence, computePeriod, quickAdd, payObligation,
  splitInstallments, addInstallmentPurchase, remainingAfter, installmentLoad,
  balanceOf, reconcile, recordReconciliation, adjustBalance
} from "../src/core/index.js";

const NOW = new Date("2026-11-01T09:00:00Z");
let seq = 0;
const ctx = () => ({ id: `b${++seq}`, now: NOW, userId: "u1" });
const RATES = { USD: 40 };

function fixture() {
  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay: 15, defaultAccountId: "bank" } };
  s = addAccount(s, { id: "bank", name: "Banka", type: "bank", currency: "TRY", opening: { date: "2026-10-15", balance: 10000_00 } });
  s = addAccount(s, { id: "card", name: "Kart", type: "credit", currency: "TRY", opening: { date: "2026-10-15", balance: 0 } });
  s = addAccount(s, { id: "usd", name: "Dolar hesabı", type: "bank", currency: "USD" });
  s = putRecord(s, "categories", { id: "market", name: "Market" });
  s = addObligation(s, { id: "maas", kind: "income", name: "Maaş", amount: 60000_00, currency: "TRY", accountId: "bank", startPeriod: "2026-10" });
  s = addObligation(s, { id: "kira", kind: "fixed", name: "Kira", amount: 20000_00, currency: "TRY", accountId: "bank", startPeriod: "2026-10" });
  s = addObligation(s, { id: "borc", kind: "debt", name: "Dolar borcu", amount: 100_00, currency: "USD", accountId: "bank", startPeriod: "2026-10", count: 4 });
  return s;
}

test("taksit bölme: kuruş farkı ilk taksitte, toplam birebir", () => {
  assert.deepEqual(splitInstallments(1000_00, 3), { amount: 333_33, firstAmount: 333_34 });
  assert.deepEqual(splitInstallments(1200_00, 12), { amount: 100_00, firstAmount: 100_00 });
  assert.throws(() => splitInstallments(0, 3), ValidationError);
  assert.throws(() => splitInstallments(100_00, 0), ValidationError);

  const s = addInstallmentPurchase(fixture(), { id: "tv", name: "Televizyon", total: 25000_00, count: 7, accountId: "card", date: "2026-10-20" });
  const tv = s.obligations.tv;
  assert.equal(tv.startPeriod, "2026-10");
  const periods = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"];
  const amounts = periods.map(p => occurrence(tv, p).amount);
  assert.equal(amounts.reduce((a, b) => a + b, 0), 25000_00);
  assert.equal(occurrence(tv, "2027-05"), null);
  assert.throws(() => addInstallmentPurchase(fixture(), { id: "x", name: "X", total: 100_00, count: 2, accountId: "card", date: "2026-13-01" }), ValidationError);
});

test("kalan taksit borcu ve gelecek ayların taksit yükü", () => {
  let s = addInstallmentPurchase(fixture(), { id: "tv", name: "Televizyon", total: 3000_00, count: 3, accountId: "card", date: "2026-10-20" });
  assert.deepEqual(remainingAfter(s.obligations.tv, "2026-10"), { count: 2, amount: 2000_00, lastPeriod: "2026-12" });
  assert.deepEqual(remainingAfter(s.obligations.tv, "2026-09"), { count: 3, amount: 3000_00, lastPeriod: "2026-12" });
  assert.equal(remainingAfter(s.obligations.kira, "2026-10"), null, "süresiz kalemde kalan yok");

  const load = installmentLoad(s, "2026-11", 4, { rates: RATES });
  assert.deepEqual(load.months.map(m => m.total), [1000_00 + 4000_00, 1000_00 + 4000_00, 4000_00, 0]);
  assert.deepEqual(load.months[1].ending, ["Televizyon"]);
  assert.deepEqual(load.months[2].ending, ["Dolar borcu"]);
  assert.deepEqual(load.months[0].byAccount, { card: 1000_00, bank: 4000_00 });
  assert.equal(load.total, 14000_00);

  // Erteleme yükü bir ay ileri kaydırır, toplam değişmez.
  s = skipObligation(s, "tv", "2026-11");
  const shifted = installmentLoad(s, "2026-11", 4, { rates: RATES });
  assert.deepEqual(shifted.months.map(m => m.total), [4000_00, 1000_00 + 4000_00, 1000_00 + 4000_00, 0]);
  assert.equal(shifted.total, load.total);
  assert.deepEqual(installmentLoad(s, "2026-11", 1).months[0].missingRates, ["USD"]);
});

test("banka bakiyesi: yalnız gerçekleşen hareketler, kuruşu kuruşuna", () => {
  let s = fixture();
  s = payObligation(s, "maas", "2026-10", { date: "2026-10-15" }, ctx()).state;
  s = payObligation(s, "kira", "2026-10", { date: "2026-10-16" }, ctx()).state;
  s = quickAdd(s, { amount: 1234_56, categoryId: "market", accountId: "bank", date: "2026-10-17" }, ctx()).state;
  s = quickAdd(s, { amount: 500_00, categoryId: "market", accountId: "card", date: "2026-10-18" }, ctx()).state;
  s = quickAdd(s, { type: "transfer", amount: 500_00, accountId: "bank", toAccountId: "card", date: "2026-10-25" }, ctx()).state;

  // 10.000 + 60.000 − 20.000 − 1.234,56 − 500 = 48.265,44 ; ödenmemiş dolar borcu bakiyeyi etkilemez
  assert.equal(balanceOf(s, "bank", "2026-10-31"), 48265_44);
  assert.equal(balanceOf(s, "bank", "2026-10-16"), 50000_00);
  assert.equal(balanceOf(s, "bank", "2026-10-14"), 10000_00, "açılıştan önceki hareket yok");
  assert.equal(balanceOf(s, "card", "2026-10-31"), 0, "karttaki 500 harcama 500 ödemeyle kapandı");

  const ok = reconcile(s, "bank", "2026-10-31", 48265_44);
  assert.equal(ok.matched, true);
  assert.equal(ok.diff, 0);
  s = recordReconciliation(s, ok, NOW.toISOString());

  s = quickAdd(s, { amount: 100_00, categoryId: "market", accountId: "bank", date: "2026-11-02" }, ctx()).state;
  const off = reconcile(s, "bank", "2026-11-05", 48065_44);
  assert.equal(off.matched, false);
  assert.equal(off.diff, -100_00, "bankada 100 TL daha az: girilmemiş bir gider var");
  assert.equal(off.since, "2026-10-31");
  assert.equal(off.movements.length, 1, "yalnız son tutan mutabakattan sonraki hareketler listelenir");

  const { state: fixed, transaction } = adjustBalance(s, off, ctx());
  assert.equal(transaction.type, "expense");
  assert.equal(transaction.adjustment, true);
  assert.equal(balanceOf(fixed, "bank", "2026-11-05"), 48065_44);
  assert.equal(reconcile(fixed, "bank", "2026-11-05", 48065_44).matched, true);
  assert.equal(computePeriod(fixed, "2026-10").spending.byCategory._adjustment, 100_00);
});

test("para birimi kuralları: dövizli borç TL hesaptan gerçek TL tutarıyla ödenir", () => {
  let s = fixture();
  assert.throws(() => payObligation(s, "borc", "2026-10", {}, ctx()), ValidationError);
  s = payObligation(s, "borc", "2026-10", { amount: 4012_50, date: "2026-10-20" }, ctx()).state;
  const borc = computePeriod(s, "2026-10", { rates: RATES }).obligations.items.find(i => i.obligationId === "borc");
  assert.equal(borc.cost, 4012_50, "gerçek maliyet hesaptan çıkan TL");
  assert.equal(balanceOf(s, "bank", "2026-10-31"), 10000_00 - 4012_50);
  assert.throws(() => quickAdd(s, { amount: 10_00, accountId: "bank", currency: "USD", categoryId: "market" }, ctx()), ValidationError);
  assert.throws(() => quickAdd(s, { type: "transfer", amount: 10_00, accountId: "bank", toAccountId: "usd" }, ctx()), ValidationError);
});
