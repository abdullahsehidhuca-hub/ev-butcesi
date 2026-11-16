// Motor ile ekran arasındaki tutarlılık denetimi (16 Kasım 2026) sırasında bulunan çelişkiler. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, addAccount, addObligation, payObligation, closePeriod, computePeriod, carryoverOf, projection, setRates, ratesOf
} from "../src/core/index.js";
import { overview, paymentsView } from "../src/v3/selectors.js";

function base() {
  let s = emptyState();
  s = addAccount(s, { id: "b", name: "Banka", type: "bank", currency: "TRY" });
  s = addObligation(s, { id: "maas", kind: "income", name: "Maaş", amount: 500000, currency: "TRY", accountId: "b", startPeriod: "2026-09" });
  return s;
}

test("kısmen ödenen kalem kapatmada yalnız kalanıyla taşınır; toplam ödeme planlananı aşmaz", () => {
  let s = addObligation(base(), { id: "kira", kind: "fixed", name: "Kira", amount: 100000, currency: "TRY", accountId: "b", startPeriod: "2026-09", count: 1 });
  s = payObligation(s, "maas", "2026-09", {}, { id: "t0", now: new Date("2026-09-16") }).state;
  s = payObligation(s, "kira", "2026-09", { amount: 30000, partial: true }, { id: "t1", now: new Date("2026-09-20") }).state;
  s = closePeriod(s, "2026-09");
  const carried = computePeriod(s, "2026-10").obligations.items.find(i => i.obligationId === "kira~2026-09");
  assert.equal(carried.planned, 70000);
  // Eylül'ün devredeni: maaş − ödenen 300 ₺ (taşınan kalan sonraki dönemde gider sayılır).
  assert.equal(carryoverOf(s, "2026-09").amount, 470000);
});

test("kısmen ödenen taksit ertelenemez (ödenen kısım iki kez beklenirdi)", () => {
  let s = addObligation(base(), { id: "tv", kind: "installment", name: "TV", amount: 100000, currency: "TRY", accountId: "b", startPeriod: "2026-09", count: 3 });
  s = payObligation(s, "tv", "2026-09", { amount: 40000, partial: true }, { id: "t1", now: new Date("2026-09-20") }).state;
  assert.throws(() => closePeriod(s, "2026-09", { decisions: { tv: "defer" } }), /kısmen ödendi/);
});

test("dövizli kalem Birikim'de girilen kurla sayılır; ay kapatma kur ister ama kayıtlı kuru kullanır", () => {
  let s = addAccount(base(), { id: "usd", name: "Dolar", type: "bank", currency: "USD" });
  s = addObligation(s, { id: "kira", kind: "fixed", name: "Kira", amount: 50000, currency: "USD", accountId: "usd", startPeriod: "2026-09" });
  assert.deepEqual(computePeriod(s, "2026-09").missingRates, ["USD"]);
  assert.throws(() => closePeriod(s, "2026-09"), /kur eksik/);
  s = setRates(s, { USD: 40 });
  const o = overview(s, "2026-09-20");
  assert.deepEqual(o.summary.missingRates, []);
  assert.equal(o.summary.obligations.total, 2000000);
  assert.equal(projection(s, "2026-10", 1)[0].obligations, 2000000);
  const closed = closePeriod(s, "2026-09").closedPeriods["2026-09"];
  assert.deepEqual(closed.rates, ratesOf(s));
});

test("karttan otomatik çekilen taksit Ödemeler toplamında bir kez sayılır (kart ekstresinde)", () => {
  let s = addAccount(base(), { id: "kk", name: "Kart", type: "credit", currency: "TRY" });
  s = addObligation(s, { id: "tel", kind: "installment", name: "Telefon", amount: 100000, currency: "TRY", accountId: "kk", startPeriod: "2026-09", count: 6 });
  const v = paymentsView(s, "2026-10");
  const all = [...v.before, ...v.after];
  assert.ok(all.some(i => i.auto && i.amount === 100000), "oto satırı listede kalır");
  assert.equal(all.find(i => i.type === "card").amount, 100000);
  assert.equal(v.total, 100000);
  assert.equal(v.open, 100000);
});
