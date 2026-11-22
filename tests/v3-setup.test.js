// İlk kurulum karşılaması: ilk hesap eklenince ana ekrana atlanmaz (2026-11-12 hatası). Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, addAccount } from "../src/core/index.js";
import { setupSteps } from "../src/v3/selectors.js";
import { buildSampleState } from "../src/v3/sampleData.js";

const withObligation = (s, o) => ({ ...s, obligations: { ...s.obligations, [o.id]: o } });

test("Karşılama ilk hesaptan sonra sürer; maaş ve sabit ödeme girilince biter", () => {
  let s = emptyState();
  assert.equal(setupSteps(s).show, true);
  s = addAccount(s, { id: "b", name: "Banka", type: "bank", currency: "TRY" });
  assert.deepEqual(setupSteps(s), { account: true, bank: true, credit: false, extra: false, catFixed: false, catVariable: false, income: false, fixed: false, mode: null, show: true });
  s = withObligation(s, { id: "m", kind: "income", name: "Maaş" });
  assert.equal(setupSteps(s).show, true, "sabit ödeme adımı atlanmamalı");
  s = withObligation(s, { id: "k", kind: "fixed", name: "Kira" });
  assert.equal(setupSteps(s).show, false);
});

test("Sabit ödemesi olmayan kullanıcı 'Başla' ile geçer; hesap yoksa karşılama her zaman görünür", () => {
  let s = addAccount(emptyState(), { id: "b", name: "Banka", type: "bank", currency: "TRY" });
  s = withObligation(s, { id: "m", kind: "income", name: "Maaş" });
  s = { ...s, settings: { ...s.settings, setupDone: true } };
  assert.equal(setupSteps(s).show, false);
  assert.equal(setupSteps({ ...emptyState(), settings: { ...emptyState().settings, setupDone: true } }).show, true);
});

test("Kurulu veri (örnek veri) karşılama göstermez", () => {
  assert.equal(setupSteps(buildSampleState()).show, false);
});

test("Hesap düzeni: kart ve gider takibi adımları ayrı izlenir; maaş adımı yalnız gelir tarafındaki hesapla açılır", () => {
  let s = { ...emptyState(), settings: { ...emptyState().settings, trackingMode: "separate" } };
  assert.equal(setupSteps(s).mode, "cards", "eski 'her hesabı ayrı izlerim' seçimi kategorili düzende açılır");
  s = addAccount(s, { id: "k", name: "Kart", type: "credit", currency: "TRY" });
  assert.deepEqual([setupSteps(s).bank, setupSteps(s).credit, setupSteps(s).extra], [false, true, false]);
  s = addAccount(s, { id: "t", name: "Talimat", type: "bank", currency: "TRY", purpose: "autopay" });
  assert.deepEqual([setupSteps(s).bank, setupSteps(s).extra], [false, true], "gider takibi hesabı bütçe hesabı sayılmaz");
  s = addAccount(s, { id: "b", name: "Maaş", type: "bank", currency: "TRY", purpose: "salary" });
  s = addAccount(s, { id: "b2", name: "Eşin maaşı", type: "bank", currency: "TRY", purpose: "salary" });
  assert.deepEqual([setupSteps(s).bank, setupSteps(s).extra], [true, true]);
});

test("Gider takibi adımı 'ayrı hesap açmayacağım' ile tamamlanır; kategoriler iki dalda sayılır", () => {
  let s = addAccount(emptyState(), { id: "b", name: "Maaş", type: "bank", currency: "TRY", purpose: "salary" });
  assert.equal(setupSteps(s).extra, false);
  s = { ...s, settings: { ...s.settings, noExpenseAccounts: true } };
  assert.equal(setupSteps(s).extra, true);
  s = { ...s, categories: { k: { id: "k", name: "Kira", group: "fixed" }, m: { id: "m", name: "Market" } } };
  assert.deepEqual([setupSteps(s).catFixed, setupSteps(s).catVariable], [true, true], "dalı olmayan eski kategori değişken sayılır");
});
