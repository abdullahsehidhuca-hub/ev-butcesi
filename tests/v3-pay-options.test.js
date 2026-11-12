// Hızlı harcamada "nereden ödendi" seçenekleri, Ayarlar'dan düzenlenmeleri ve konfor kartı. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, addAccount, quickAdd, setPayMethods, accountPayMethod, payMethodsOf, DEFAULT_PAY_METHODS, HIDDEN_PAY_METHOD } from "../src/core/index.js";
import { payOptions, savingsView } from "../src/v3/selectors.js";
import { toCloud, fromCloud } from "../src/v3/sync.js";

const opening = { date: "2026-11-01", balance: 0 };
function build() {
  let s = emptyState();
  s = addAccount(s, { id: "maas", name: "Maaş hesabı", type: "bank", currency: "TRY", opening });
  s = addAccount(s, { id: "bonus", name: "Bonus", type: "credit", currency: "TRY", opening });
  s = addAccount(s, { id: "axess", name: "Axess", type: "credit", currency: "TRY", opening });
  s = addAccount(s, { id: "konfor", name: "Konfor kartı", type: "prepaid", currency: "TRY", opening: { date: "2026-11-01", balance: 500000 } });
  s = addAccount(s, { id: "dolar", name: "Dolar", type: "bank", currency: "USD", opening });
  return { ...s, settings: { ...s.settings, defaultAccountId: "maas" } };
}
const ids = (opts, method) => opts.find(o => o.method === method)?.accounts.map(a => a.id);

test("Varsayılan: kredi kartı, banka kartı ve konfor kartı; nakit yalnız hesabı varsa", () => {
  const opts = payOptions(build());
  assert.deepEqual(opts.map(o => o.label), ["Kredi kartı", "Banka kartı", "Konfor kartı"]);
  const withCash = addAccount(build(), { id: "cep", name: "Cüzdan", type: "cash", currency: "TRY", opening });
  assert.deepEqual(payOptions(withCash).map(o => o.method), ["credit", "debit", "prepaid", "cash"]);
});

test("Banka kartı banka hesabından çekilir; TL dışı hesaplar listelenmez", () => {
  const opts = payOptions(build());
  assert.deepEqual(ids(opts, "debit"), ["maas"]);
  assert.ok(!opts.flatMap(o => o.accounts).some(a => a.id === "dolar"));
  assert.equal(accountPayMethod(build(), { type: "debit" }), "debit");
});

test("Aynı seçenekte son harcama yapılan kart öne gelir", () => {
  let s = build();
  assert.deepEqual(ids(payOptions(s), "credit"), ["axess", "bonus"]);
  s = quickAdd(s, { amount: 10000, accountId: "bonus", date: "2026-11-05" }, { id: "t1", now: new Date("2026-11-05T10:00:00") }).state;
  assert.deepEqual(ids(payOptions(s), "credit"), ["bonus", "axess"]);
});

test("Konfor kartından harcama kartın bakiyesinden düşer, birikim sayılmaz", () => {
  let s = build();
  s = quickAdd(s, { amount: 120000, accountId: "konfor", date: "2026-11-06" }, { id: "t2", now: new Date("2026-11-06T10:00:00") }).state;
  const v = savingsView(s, "2026-11-06");
  assert.equal(v.assets.list.find(a => a.accountId === "konfor").balance, 380000);
  assert.ok(!v.savingsAccounts.some(a => a.accountId === "konfor"));
});

test("Ayarlar: banka kartı ile konfor kartı birleştirilir, yemek kartı eklenir, hesap gizlenir", () => {
  let s = addAccount(build(), { id: "multinet", name: "Multinet", type: "prepaid", currency: "TRY", opening });
  const methods = [
    { id: "credit", name: "Kredi kartı" },
    { id: "debit", name: "  Banka / konfor  " },
    { id: "yemek", name: "Yemek kartı", accountType: "prepaid" }
  ];
  s = setPayMethods(s, methods, { konfor: "debit", multinet: "yemek", axess: HIDDEN_PAY_METHOD });
  const opts = payOptions(s);
  assert.deepEqual(opts.map(o => o.label), ["Kredi kartı", "Banka / konfor", "Yemek kartı"]);
  assert.deepEqual(ids(opts, "credit"), ["bonus"]);
  assert.deepEqual(ids(opts, "debit").sort(), ["konfor", "maas"]);
  assert.deepEqual(ids(opts, "yemek"), ["multinet"]);
  assert.equal(opts.find(o => o.method === "yemek").accountType, "prepaid");
  // Düzenlenmiş listede hesabı olmayan seçenek de görünür ("ekle" ile kart eklenir).
  const empty = setPayMethods(s, [...methods, { id: "hediye", name: "Hediye kartı" }]);
  assert.deepEqual(ids(payOptions(empty), "hediye"), []);
});

test("Silinen seçenekteki hesap kaybolmaz: türünün varsayılanına, o da yoksa ilk seçeneğe düşer", () => {
  const s = setPayMethods(build(), [{ id: "debit", name: "Banka kartı" }, { id: "credit", name: "Kredi kartı" }]);
  assert.equal(accountPayMethod(s, s.accounts.konfor), "debit");
  assert.equal(accountPayMethod(s, s.accounts.bonus), "credit");
  assert.equal(payOptions(s).flatMap(o => o.accounts).length, 4);
});

test("Geçersiz ödeme seçenekleri kaydedilmez", () => {
  const s = build();
  assert.throws(() => setPayMethods(s, []), /en az bir/);
  assert.throws(() => setPayMethods(s, [{ id: "a", name: " " }]), /boş olamaz/);
  assert.throws(() => setPayMethods(s, [{ id: "a", name: "Kart" }, { id: "b", name: "kart" }]), /iki kez/);
  assert.throws(() => setPayMethods(s, [{ id: "a", name: "Kart" }], { bonus: "yok" }), /listede yok/);
  assert.equal(payMethodsOf(s), DEFAULT_PAY_METHODS);
});

test("Düzenlenen seçenekler buluttan aynen geri okunur", () => {
  const s = setPayMethods(build(), [{ id: "credit", name: "Kredi kartı" }, { id: "yemek", name: "Yemek kartı", accountType: "prepaid" }], { konfor: "yemek" });
  const back = fromCloud(JSON.parse(JSON.stringify(toCloud(s))));
  assert.deepEqual(back.settings.payMethods, s.settings.payMethods);
  assert.equal(back.accounts.konfor.payMethod, "yemek");
});
