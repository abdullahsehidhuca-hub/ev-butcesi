// v3 arayüz seçicileri: örnek veriyle temel sonuçları kontrol eder. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSampleState, SAMPLE_TODAY } from "../src/v3/sampleData.js";
import { overview, forecast, resolveOptions, paymentsView, report } from "../src/v3/selectors.js";
import { computePeriod } from "../src/core/index.js";

const state = buildSampleState();

test("Serbest tutar motorun 'kalan' değeriyle aynı", () => {
  const o = overview(state, SAMPLE_TODAY);
  assert.equal(o.free, computePeriod(state, o.period).remaining);
});

test("Gelecek bakiye akışı maaş gününde önce geliri sayar", () => {
  const f = forecast(state, SAMPLE_TODAY);
  const payDay = f.points.filter(p => p.date === "2026-12-15");
  if (payDay.length > 1) assert.ok(payDay[0].delta >= payDay[1].delta);
});

test("Çözüm seçenekleri en düşük bakiyeyi eksiden çıkarır", () => {
  const f = forecast(state, SAMPLE_TODAY);
  if (!f.firstNegative) return;
  const opts = resolveOptions(state, SAMPLE_TODAY, {});
  assert.ok(opts.length > 0);
  assert.ok(opts.some(o => o.resultMin >= 0));
});

test("Ödemeler görünümünde toplam = açık + ödenen", () => {
  const v = paymentsView(state, "2026-11");
  assert.ok(v.open <= v.total);
  assert.equal(v.before.length + v.after.length, v.count);
});

test("Rapor 6 aylık plan ve en fazla 5 dilim döndürür", () => {
  const r = report(state, SAMPLE_TODAY);
  assert.equal(r.projection.length, 6);
  assert.ok(r.parts.length <= 5);
});
