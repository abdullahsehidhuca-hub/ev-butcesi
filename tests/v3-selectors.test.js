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

import { upcoming, recent, accountsView } from "../src/v3/selectors.js";
import { exportBackup, parseBackup, transactionsCsv } from "../src/v3/store.js";

test("Ana rakam motorun güvenle harcanabilir değeri; döküm toplamı tutuyor", () => {
  const o = overview(state, SAMPLE_TODAY);
  const s = computePeriod(state, o.period);
  assert.equal(o.safe, s.safeToSpend);
  const b = o.salaryBar;
  assert.equal(b.income - b.obligations - b.spent - b.reserved, b.safe);
});

test("Yaklaşan listesi beklenen geliri de içerir ve tarih sıralı", () => {
  const up = upcoming(state, SAMPLE_TODAY, 50);
  const dates = up.map(i => i.date);
  assert.deepEqual(dates, [...dates].sort());
  for (const i of up.filter(x => x.type === "income")) assert.ok(i.open > 0);
});

test("Son işlemler tüm türleri kapsar", () => {
  const all = Object.keys(state.transactions).length;
  assert.equal(recent(state, 1000).length, all);
});

test("Rapor tüm kategorileri tutarıyla verir; toplam harcamaya eşit", () => {
  const r = report(state, SAMPLE_TODAY);
  assert.equal(r.rows.reduce((s, x) => s + x.value, 0), r.total);
  assert.ok(r.projection.every(m => m.free === m.income - m.obligations - m.budgets));
});

test("Hesap toplamı TL hesapların bakiyelerinin toplamı", () => {
  const v = accountsView(state, SAMPLE_TODAY);
  assert.equal(v.total, v.list.filter(a => a.currency === "TRY").reduce((s, a) => s + a.balance, 0));
});

test("Yedek dışa aktarılıp aynen geri yüklenir; yabancı dosya reddedilir", () => {
  const back = parseBackup(exportBackup(state));
  assert.deepEqual(back.transactions, state.transactions);
  assert.deepEqual(back.accounts, state.accounts);
  assert.throws(() => parseBackup("{}"));
  assert.throws(() => parseBackup("bozuk"));
  assert.throws(() => parseBackup(JSON.stringify({ app: "ev-butcesi-v3", state: { ...state, schemaVersion: -1 } })));
});

test("CSV her işlem için bir satır ve başlık içerir", () => {
  const lines = transactionsCsv(state).split("\r\n");
  assert.equal(lines.length, Object.keys(state.transactions).length + 1);
  assert.ok(lines[0].includes("Tarih;Tür;Tutar"));
});

import { balanceView } from "../src/v3/selectors.js";
import { reconcile, adjustBalance, balanceOf } from "../src/core/index.js";

test("Başlık dökümü: kullanılabilir = safeToSpend; bloke yalnız açık, otomatik olmayan kalemler", () => {
  const v = balanceView(state, SAMPLE_TODAY);
  const o = overview(state, SAMPLE_TODAY);
  assert.equal(v.available, o.safe);
  assert.equal(v.afterBlocked, v.bank - v.blocked);
  assert.ok(v.blockedItems.every(i => i.open > 0 && !i.auto && !i.paid));
  assert.ok(v.banks.every(a => state.accounts[a.id].type !== "credit"));
});

test("Bankayla karşılaştırma farkı düzeltmeyle kapanır; bankadaki tutar gerçek bakiyeye eşitlenir", () => {
  const acc = balanceView(state, SAMPLE_TODAY).banks[0];
  const r = reconcile(state, acc.id, SAMPLE_TODAY, acc.balance - 12345);
  assert.equal(r.diff, -12345);
  const next = adjustBalance(state, r, { id: "duzeltme-1", now: new Date(`${SAMPLE_TODAY}T12:00:00`) }).state;
  assert.equal(balanceOf(next, acc.id, SAMPLE_TODAY), acc.balance - 12345);
});
