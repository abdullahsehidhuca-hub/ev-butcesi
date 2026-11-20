import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, addAccount, addObligation, validateObligation, computePeriod, payObligation, balanceOf
} from "../src/core/index.js";
import { forecast, paymentsOf } from "../src/v3/selectors.js";

const NOW = new Date("2026-11-01T09:00:00Z");
let seq = 0;
const ctx = () => ({ id: `a${++seq}`, now: NOW, userId: "u1" });

// Kira banka hesabından talimatla ödeniyor: talimat 2026-11 döneminden itibaren, ödeme günü 20.
function fixture() {
  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay: 15, defaultAccountId: "bank" } };
  s = addAccount(s, { id: "bank", name: "Banka", type: "bank", currency: "TRY", opening: { date: "2026-10-15", balance: 10000_00 } });
  s = addObligation(s, { id: "maas", kind: "income", name: "Maaş", amount: 60000_00, currency: "TRY", accountId: "bank", startPeriod: "2026-10", dueDay: 15 });
  s = addObligation(s, { id: "kira", kind: "fixed", name: "Kira", amount: 2000_00, currency: "TRY", accountId: "bank", startPeriod: "2026-10", dueDay: 20, autopayFrom: "2026-11" });
  return s;
}

const kiraIn = (s, p) => computePeriod(s, p).obligations.items.find(i => i.obligationId === "kira");

test("talimatlı ödeme: talimat döneminden itibaren işaret beklemeden kapanır", () => {
  const s = fixture();
  const before = kiraIn(s, "2026-10");
  assert.equal(before.auto, false);
  assert.equal(before.open, 2000_00);
  const after = kiraIn(s, "2026-11");
  assert.equal(after.auto, true);
  assert.equal(after.open, 0);
  assert.equal(after.cost, 2000_00);
});

test("talimatlı ödeme: bakiyeden ödeme gününde düşer, öncesinde düşmez", () => {
  const s = fixture();
  assert.equal(balanceOf(s, "bank", "2026-11-19"), 10000_00);
  assert.equal(balanceOf(s, "bank", "2026-11-20"), 8000_00);
  // Talimattan önceki dönem kendiliğinden düşmez (geçmiş bakiyeler değişmez).
  assert.equal(balanceOf(s, "bank", "2026-11-14"), 10000_00);
});

test("talimatlı ödeme: elle girilen gerçek tutar otomatik çekimin yerine geçer, iki kez düşmez", () => {
  const s = payObligation(fixture(), "kira", "2026-11", { amount: 2100_00, accountId: "bank" }, ctx()).state;
  assert.equal(balanceOf(s, "bank", "2026-11-25"), 10000_00 - 2100_00);
  assert.equal(kiraIn(s, "2026-11").cost, 2100_00);
});

test("talimatlı ödeme: tahminde ödeme gününde bakiyeden düşer", () => {
  const fc = forecast(fixture(), "2026-11-16", { days: 10 });
  const kira = fc.points.find(p => p.label === "Kira");
  assert.ok(kira);
  assert.equal(kira.date, "2026-11-20");
  assert.equal(kira.delta, -2000_00);
  assert.equal(forecast(fixture(), "2026-11-21", { days: 10 }).points.some(p => p.label === "Kira"), false);
});

test("talimatlı ödeme: gelire tanımlanamaz, dönem geçerli olmalı", () => {
  const s = fixture();
  assert.deepEqual(validateObligation(s, { ...s.obligations.maas, autopayFrom: "2026-11" }), ["gelire talimat tanımlanamaz"]);
  assert.deepEqual(validateObligation(s, { ...s.obligations.kira, autopayFrom: "2026-13" }), ["talimat başlangıç dönemi geçersiz"]);
  assert.deepEqual(validateObligation(s, s.obligations.kira), []);
});

test("talimatlı ödeme: ödeme listesinde kaynağı banka talimatı olarak işaretlenir, karttaki otomatik değil", () => {
  let s = addAccount(fixture(), { id: "kart", name: "Kart", type: "credit", currency: "TRY", opening: { date: "2026-10-15", balance: 0 } });
  s = addObligation(s, { id: "dijital", kind: "fixed", name: "Dijital abonelik", amount: 200_00, currency: "TRY", accountId: "kart", startPeriod: "2026-10", dueDay: 3 });
  const items = paymentsOf(s, "2026-11");
  const kira = items.find(i => i.obligationId === "kira");
  const dijital = items.find(i => i.obligationId === "dijital");
  assert.equal(kira.auto, true);
  assert.equal(kira.bankAuto, true);
  assert.equal(dijital.auto, true);
  assert.equal(dijital.bankAuto, false);
});
