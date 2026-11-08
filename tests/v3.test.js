// v3 arayüz yardımcıları: tutar girişi/gösterimi, dönem etiketleri, cihazda saklama.
import test from "node:test";
import assert from "node:assert/strict";
import { parseAmount, amountText, fmtMoney, fmtSigned, periodInfo, dueText, relativeDay, dayMonth } from "../src/v3/format.js";
import { loadState, saveState, STORAGE_KEY } from "../src/v3/store.js";
import { emptyState, addAccount } from "../src/core/index.js";

const memory = (init = {}) => {
  const data = { ...init };
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; }, data };
};

test("tutar girişi Türkçe yazımı kuruşa çevirir", () => {
  assert.equal(parseAmount("345"), 34500);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("12,5"), 1250);
  assert.equal(parseAmount("12.5"), 1250);
  assert.equal(parseAmount("1.250"), 125000);
  assert.equal(parseAmount(" 20.000 ₺ "), 2000000);
  for (const bad of ["", "0", "abc", "1,2,3", "-5", "1,234"]) assert.equal(parseAmount(bad), null, bad);
  assert.equal(amountText(34500), "345");
  assert.equal(amountText(123456), "1234,56");
  assert.equal(parseAmount(amountText(123456)), 123456);
});

test("tutar gösterimi binlik nokta, kuruş virgül, sembol sonda", () => {
  assert.equal(fmtMoney(1455000), "14.550 ₺");
  assert.equal(fmtMoney(4826544), "48.265,44 ₺");
  assert.equal(fmtMoney(10000, "USD"), "100 $");
  assert.equal(fmtSigned(320000), "+3.200 ₺");
  assert.equal(fmtSigned(-142000), "-1.420 ₺");
});

test("dönem başlığı ve kalan gün Türkçe ay adlarıyla", () => {
  const info = periodInfo("2026-11", 15, "2026-11-27");
  assert.equal(info.name, "Kasım");
  assert.equal(info.range, "15 Kasım – 14 Aralık");
  assert.equal(info.daysLeft, 18);
  assert.equal(periodInfo("2026-04", 15, "2026-05-14").daysLeft, 1);
  assert.equal(dayMonth("2026-08-05"), "5 Ağustos");
  assert.equal(dueText("2026-12-05", "2026-12-02"), "3 gün kaldı");
  assert.equal(dueText("2026-12-01", "2026-12-02"), "1 gün gecikti");
  assert.equal(relativeDay("2026-12-01", "2026-12-02"), "Dün");
  assert.equal(relativeDay("2026-12-02", "2026-12-02"), "Bugün");
});

test("v3 verisi kendi anahtarında saklanır, eski veriye dokunulmaz", () => {
  const storage = memory({ evButcesi: "eski veri" });
  assert.deepEqual(loadState(storage), { state: emptyState(), error: null });
  const state = addAccount(emptyState(), { id: "a", name: "Maaş hesabı", type: "bank", currency: "TRY", opening: { date: "2026-11-07", balance: 100 } });
  assert.equal(saveState(state, storage), true);
  assert.equal(storage.data.evButcesi, "eski veri");
  assert.equal(loadState(storage).state.accounts.a.name, "Maaş hesabı");
});

test("okunamayan veri silinmez, ayrı anahtara yedeklenir", () => {
  const storage = memory({ [STORAGE_KEY]: "{bozuk" });
  const r = loadState(storage);
  assert.equal(r.error, "load");
  assert.deepEqual(r.state, emptyState());
  assert.equal(storage.data[`${STORAGE_KEY}.bozuk`], "{bozuk");
  const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); } };
  assert.equal(saveState(emptyState(), full), false);
});
