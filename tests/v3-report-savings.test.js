// v3 seçicileri: Rapor dönem seçici, harcama trendi, birikim görünümü ve taksit denemesi. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSampleState, SAMPLE_TODAY } from "../src/v3/sampleData.js";
import { report, spendingTrend, savingsView, installmentTrial } from "../src/v3/selectors.js";
import { computePeriod, setRates, addAccount, addGoal } from "../src/core/index.js";

const state = buildSampleState();

test("Rapor geçmiş dönemde o dönemin tamamını gösterir; plan bugünkü dönemden başlar", () => {
  const r = report(state, SAMPLE_TODAY, 6, "2026-10");
  assert.equal(r.period, "2026-10");
  assert.equal(r.current, false);
  assert.equal(r.total, computePeriod(state, "2026-10").spending.total);
  assert.equal(r.day, r.totalDays);
  assert.equal(r.projection[0].period, "2026-11");
  assert.ok(r.insights.every(i => i.tone !== "warn"), "geçmiş dönemde limit tahmini yapılmaz");
  for (const l of r.limits) assert.equal(l.projected, l.spent);
  // İleri tarih istenirse bugünkü döneme düşer; bugünkü dönem öncekiyle aynı sonucu verir.
  assert.equal(report(state, SAMPLE_TODAY, 6, "2027-03").period, "2026-11");
  assert.equal(report(state, SAMPLE_TODAY, 6, "2026-11").total, report(state, SAMPLE_TODAY).total);
});

test("Harcama trendi son 6 dönemi eskiden yeniye verir, sonuncusu bugünkü dönemdir", () => {
  const t = spendingTrend(state, SAMPLE_TODAY, 6);
  assert.deepEqual(t.map(x => x.period), ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
  assert.equal(t.at(-1).current, true);
  assert.equal(t.filter(x => x.current).length, 1);
  assert.equal(t.at(-1).spent, computePeriod(state, "2026-11").spending.total);
  assert.equal(t[4].spent, computePeriod(state, "2026-10").spending.total);
});

test("Birikim görünümü harcama hesabını ve kartı dışarıda bırakır; acil fon önerisi 6 aylık zorunlu gider", () => {
  const v = savingsView(state, SAMPLE_TODAY);
  assert.equal(v.main, "maas");
  assert.ok(!v.savingsAccounts.some(a => a.accountId === "maas"));
  assert.ok(!v.savingsAccounts.some(a => a.accountId === "bonus"), "kredi kartı varlık değil");
  assert.equal(v.savingsTotal, v.savingsAccounts.reduce((s, a) => s + a.tl, 0));
  assert.equal(v.emergency.months, 6);
  assert.equal(v.emergency.target, v.emergency.monthly * 6);
  assert.deepEqual(v.goals, []);
  assert.equal(v.hasEmergency, false);
});

test("Birikim görünümü: kuru eksik döviz toplama girmez, kur girilince girer; hedef ilerlemesi hesaplanır", () => {
  let s = addAccount(state, { id: "usd", name: "Dolar", type: "bank", currency: "USD", opening: { date: "2026-11-15", balance: 100_00 } });
  let v = savingsView(s, SAMPLE_TODAY);
  assert.deepEqual(v.assets.missingRates, ["USD"]);
  const withoutUsd = v.savingsTotal;
  s = setRates(s, { USD: 35 });
  v = savingsView(s, SAMPLE_TODAY);
  assert.deepEqual(v.assets.missingRates, []);
  assert.equal(v.savingsTotal, withoutUsd + 3_500_00);
  s = addGoal(s, { id: "g1", name: "Acil durum fonu", kind: "emergency", target: 40_000_00, accountIds: ["birikim", "usd"] });
  v = savingsView(s, SAMPLE_TODAY);
  assert.equal(v.hasEmergency, true);
  assert.equal(v.goals[0].saved, 20_000_00 + 3_500_00);
  assert.equal(v.goals[0].percent, 58);
});

test("Taksit denemesi kayıt yapmaz; aylık kalan taksit tutarı kadar düşer", () => {
  const t = installmentTrial(state, SAMPLE_TODAY, { total: 24_000_00, count: 6, accountId: "bonus" });
  assert.equal(t.monthly, 4_000_00);
  assert.equal(t.firstPeriod, "2026-11");
  assert.equal(t.lastPeriod, "2027-04");
  assert.equal(t.rows.length, 6);
  for (const r of t.rows) assert.equal(r.before - r.after, 4_000_00);
  assert.equal("_deneme" in state.obligations, false);
  assert.equal(t.fits, true);
  const big = installmentTrial(state, SAMPLE_TODAY, { total: 600_000_00, count: 6, accountId: "bonus" });
  assert.equal(big.fits, false);
  assert.equal(big.newlyNegative.period, "2026-11");
  const later = installmentTrial(state, SAMPLE_TODAY, { total: 12_000_00, count: 3, accountId: "bonus", startPeriod: "2026-12" });
  assert.equal(later.rows[0].delta, 0);
  assert.equal(later.rows[1].delta, -4_000_00);
  assert.equal(later.lastPeriod, "2027-02");
});
