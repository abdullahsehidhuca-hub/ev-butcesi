import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, putRecord, addObligation, changeObligationAmount, ValidationError,
  periodOf, periodRange, dateInPeriod, addPeriods,
  occurrence, lastPeriod,
  computePeriod, closePeriod, projection,
  quickAdd, payObligation, favorites, defaultAccountFor
} from "../src/core/index.js";

const NOW = new Date("2026-10-20T10:00:00Z");
const RATES = { USD: 40 };
let seq = 0;
const ctx = (extra = {}) => ({ id: `t${++seq}`, now: NOW, userId: "u1", ...extra });
const byId = (a, b) => a.obligationId.localeCompare(b.obligationId);

function fixture() {
  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay: 15, defaultAccountId: "bank" } };
  s = putRecord(s, "accounts", { id: "bank", name: "Banka", type: "bank", currency: "TRY" });
  s = putRecord(s, "accounts", { id: "card", name: "Kart", type: "credit", currency: "TRY" });
  s = putRecord(s, "categories", { id: "market", name: "Market", budget: 5000_00 });
  s = putRecord(s, "categories", { id: "yakit", name: "Yakıt" });
  s = addObligation(s, { id: "maas", kind: "income", name: "Maaş", amount: 60000_00, currency: "TRY", accountId: "bank", startPeriod: "2026-09" });
  s = addObligation(s, { id: "kira", kind: "fixed", name: "Kira", amount: 20000_00, currency: "TRY", accountId: "bank", startPeriod: "2026-01", dueDay: 5 });
  s = addObligation(s, { id: "tel", kind: "installment", name: "Telefon", amount: 1500_00, currency: "TRY", accountId: "card", startPeriod: "2026-09", count: 6 });
  s = addObligation(s, { id: "borc", kind: "debt", name: "Dolar borcu", amount: 100_00, currency: "USD", accountId: "bank", startPeriod: "2026-09", count: 10 });
  return s;
}

test("dönem: maaş gününe göre ay ve kısa ay sınırı", () => {
  assert.equal(periodOf("2026-05-14", 15), "2026-04");
  assert.equal(periodOf("2026-05-15", 15), "2026-05");
  assert.equal(periodOf("2026-02-28", 31), "2026-02");
  assert.equal(periodOf("2026-03-30", 31), "2026-02");
  assert.deepEqual(periodRange("2026-04", 15), { start: "2026-04-15", end: "2026-05-14" });
  assert.deepEqual(periodRange("2026-01", 31), { start: "2026-01-31", end: "2026-02-27" });
  assert.deepEqual(periodRange("2026-12", 1), { start: "2026-12-01", end: "2026-12-31" });
  assert.equal(dateInPeriod("2026-04", 5, 15), "2026-05-05");
  assert.equal(dateInPeriod("2026-04", 20, 15), "2026-04-20");
  assert.equal(addPeriods("2026-11", 3), "2027-02");
  assert.equal(addPeriods("2026-01", -1), "2025-12");
});

test("takvim: taksit sırası, erteleme kuyruğu uzatır", () => {
  const s = fixture();
  const tel = s.obligations.tel;
  assert.equal(occurrence(tel, "2026-11").index, 3);
  assert.equal(lastPeriod(tel), "2027-02");
  assert.equal(occurrence(tel, "2027-03"), null);
  const ertelendi = { ...tel, skips: ["2026-10"] };
  assert.equal(occurrence(ertelendi, "2026-10"), null);
  assert.equal(occurrence(ertelendi, "2026-11").index, 2);
  assert.equal(lastPeriod(ertelendi), "2027-03");
  assert.equal(occurrence(ertelendi, "2027-03").index, 6);
  assert.equal(occurrence(tel, "2026-08"), null);
});

test("tutar değişikliği yalnızca ileriye etki eder", () => {
  const s = changeObligationAmount(fixture(), "kira", "2026-11", 22000_00);
  assert.equal(occurrence(s.obligations.kira, "2026-10").amount, 20000_00);
  assert.equal(occurrence(s.obligations.kira, "2026-11").amount, 22000_00);
  assert.equal(occurrence(s.obligations.kira, "2027-05").amount, 22000_00);
});

test("dönem özeti: gelir, yükümlülük, harcama, kalan", () => {
  let s = fixture();
  s = quickAdd(s, { amount: 1200_00, categoryId: "market", date: "2026-10-18" }, ctx()).state;
  const r = computePeriod(s, "2026-10", { rates: RATES });
  assert.equal(r.income.total, 60000_00);
  assert.equal(r.income.received, 0);
  assert.equal(r.obligations.total, 20000_00 + 1500_00 + 4000_00);
  assert.equal(r.spending.total, 1200_00);
  assert.equal(r.budgets.reserved, 3800_00);
  assert.equal(r.remaining, 33300_00);
  assert.equal(r.safeToSpend, 29500_00);
  assert.deepEqual(r.missingRates, []);
  assert.equal(r.obligations.items.find(i => i.obligationId === "kira").dueDate, "2026-11-05");
});

test("ödendi işareti gerçek tutarı kullanır; gelir alındı çift sayılmaz", () => {
  let s = fixture();
  s = payObligation(s, "kira", "2026-10", { amount: 20500_00, date: "2026-11-04" }, ctx()).state;
  s = payObligation(s, "maas", "2026-10", {}, ctx()).state;
  const r = computePeriod(s, "2026-10", { rates: RATES });
  const kira = r.obligations.items.find(i => i.obligationId === "kira");
  assert.equal(kira.settled, true);
  assert.equal(kira.cost, 20500_00);
  assert.equal(r.income.received, 60000_00);
  assert.equal(r.income.expectedOpen, 0);
  assert.equal(r.income.total, 60000_00);
  assert.equal(r.obligations.open, 1500_00 + 4000_00);
});

test("eksik kur sessizce sıfır sayılmaz, raporlanır", () => {
  const r = computePeriod(fixture(), "2026-10");
  assert.deepEqual(r.missingRates, ["USD"]);
  assert.throws(() => closePeriod(fixture(), "2026-10"), ValidationError);
});

test("kapanan dönem dondurulur; kur ve ayar değişikliği geçmişi bozmaz", () => {
  let s = fixture();
  s = payObligation(s, "maas", "2026-10", {}, ctx()).state;
  s = payObligation(s, "tel", "2026-10", {}, ctx()).state;
  s = closePeriod(s, "2026-10", { rates: RATES, decisions: { borc: "defer" }, closedAt: NOW.toISOString() });
  const frozen = computePeriod(s, "2026-10", { rates: RATES });
  assert.equal(frozen.closed, true);
  assert.equal(frozen.remaining, 60000_00 - 20000_00 - 1500_00 - 4000_00);

  const later = changeObligationAmount(s, "kira", "2026-10", 30000_00);
  const again = computePeriod(later, "2026-10", { rates: { USD: 55 } });
  assert.deepEqual(again, frozen);

  assert.deepEqual([...frozen.decisions].sort(byId), [
    { obligationId: "borc", decision: "defer" },
    { obligationId: "kira", decision: "carry" }
  ]);

  const nov = computePeriod(s, "2026-11", { rates: RATES });
  const devir = nov.obligations.items.find(i => i.obligationId === "kira~2026-10");
  assert.ok(devir, "kira devri kasım dönemine taşınmalı");
  assert.equal(devir.amount, 20000_00);
  assert.equal(lastPeriod(s.obligations.borc), "2027-07");
  assert.throws(() => closePeriod(s, "2026-10", { rates: RATES }), ValidationError);
  assert.throws(() => quickAdd(s, { amount: 100_00, categoryId: "market", date: "2026-10-20" }, ctx()), ValidationError);
});

test("kredi kartı: önceki dönem harcaması + karttan otomatik taksit, ödeme düşülür", () => {
  let s = fixture();
  s = quickAdd(s, { amount: 1000_00, categoryId: "yakit", accountId: "card", date: "2026-10-16" }, ctx()).state;
  let nov = computePeriod(s, "2026-11", { rates: RATES });
  assert.deepEqual(nov.cards[0], { accountId: "card", name: "Kart", charges: 2500_00, payments: 0, due: 2500_00 });
  s = quickAdd(s, { type: "transfer", amount: 2500_00, accountId: "bank", toAccountId: "card", date: "2026-11-20" }, ctx()).state;
  nov = computePeriod(s, "2026-11", { rates: RATES });
  assert.equal(nov.cards[0].due, 0);
  assert.equal(nov.spending.total, 0, "aktarım harcama sayılmaz");
});

test("projeksiyon: gelecek aylar ve biten taksitler", () => {
  const p = projection(fixture(), "2027-01", 3, { rates: RATES });
  assert.deepEqual(p.map(x => x.period), ["2027-01", "2027-02", "2027-03"]);
  assert.equal(p[0].obligations, 20000_00 + 1500_00 + 4000_00);
  assert.deepEqual(p[1].ending, ["Telefon"]);
  assert.equal(p[2].obligations, 20000_00 + 4000_00);
  assert.equal(p[2].free, 60000_00 - 24000_00 - 5000_00);
});

test("hızlı giriş: varsayılan hesap, sık kullanılanlar, doğrulama", () => {
  let s = fixture();
  assert.equal(defaultAccountFor(s, "yakit"), "bank");
  s = quickAdd(s, { amount: 900_00, categoryId: "yakit", accountId: "card", date: "2026-10-01" }, ctx()).state;
  s = quickAdd(s, { amount: 950_00, categoryId: "yakit" }, ctx()).state;
  const last = Object.values(s.transactions).find(t => t.amount === 950_00);
  assert.equal(last.accountId, "card", "kategori için son kullanılan hesap seçilmeli");
  assert.equal(last.date, "2026-10-20");
  s = quickAdd(s, { amount: 300_00, categoryId: "market" }, ctx()).state;
  const fav = favorites(s, { now: NOW });
  assert.deepEqual(fav.map(f => f.categoryId), ["yakit", "market"]);
  assert.equal(fav[0].lastAmount, 950_00);
  assert.throws(() => quickAdd(s, { amount: 0, categoryId: "market" }, ctx()), ValidationError);
  assert.throws(() => quickAdd(s, { amount: 12.5, categoryId: "market" }, ctx()), ValidationError);
  assert.throws(() => quickAdd(s, { amount: 100_00, categoryId: "yok" }, ctx()), ValidationError);
  assert.throws(() => payObligation(s, "tel", "2027-05", {}, ctx()), ValidationError);
});
