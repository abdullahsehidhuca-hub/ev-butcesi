// Birikim ekranının para hareketi (moveFunds): aktarım, döviz/altın alım-satımı, kur ve kapalı dönem kuralları.
// Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, addAccount, computePeriod, ValidationError, setRates, moveFunds, closePeriod, balanceOf } from "../src/core/index.js";

function base() {
  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay: 15 } };
  s = addAccount(s, { id: "bank", name: "Banka", type: "bank", currency: "TRY", opening: { date: "2026-11-15", balance: 50_000_00 } });
  s = addAccount(s, { id: "kumbara", name: "Kumbara", type: "bank", currency: "TRY" });
  s = addAccount(s, { id: "usd", name: "Dolar", type: "bank", currency: "USD" });
  s = addAccount(s, { id: "card", name: "Kart", type: "credit", currency: "TRY" });
  return s;
}

test("moveFunds: aynı birimde aktarım kaydı; serbest tutar değişmez", () => {
  let s = base();
  const before = computePeriod(s, "2026-11").remaining;
  const r = moveFunds(s, { fromAccountId: "bank", toAccountId: "kumbara", amount: 10_000_00, id: "m1", date: "2026-11-20" });
  s = r.state;
  assert.equal(r.txId, "m1");
  assert.equal(s.transactions.m1.type, "transfer");
  assert.equal(s.transactions.m1.note, "Birikime aktarım");
  assert.equal(balanceOf(s, "kumbara", "2026-11-20"), 10_000_00);
  assert.equal(balanceOf(s, "bank", "2026-11-20"), 40_000_00);
  assert.equal(computePeriod(s, "2026-11").remaining, before);
});

test("moveFunds: farklı birimde alım-satım; kur yoksa alınan miktar zorunlu, kur varsa hesaplanır", () => {
  let s = base();
  assert.throws(() => moveFunds(s, { fromAccountId: "bank", toAccountId: "usd", amount: 3_420_00, id: "m2", date: "2026-11-21" }), ValidationError);
  s = moveFunds(s, { fromAccountId: "bank", toAccountId: "usd", amount: 3_420_00, toAmount: 100_00, id: "m2", date: "2026-11-21" }).state;
  assert.equal(s.transactions.m2.type, "exchange");
  assert.equal(s.transactions.m2.toAmount, 100_00);
  assert.equal(s.transactions.m2.note, "100 $ alındı");
  assert.equal(balanceOf(s, "usd", "2026-11-21"), 100_00);
  s = setRates(s, { USD: 35 });
  const r = moveFunds(s, { fromAccountId: "usd", toAccountId: "bank", amount: 40_00, id: "m3", date: "2026-11-22", note: "  " });
  assert.equal(r.state.transactions.m3.toAmount, 1_400_00);
  assert.equal(r.state.transactions.m3.note, "40 $ bozduruldu");
  const named = moveFunds(s, { fromAccountId: "usd", toAccountId: "bank", amount: 10_00, id: "m4", date: "2026-11-22", note: "Kira için" });
  assert.equal(named.state.transactions.m4.note, "Kira için");
});

test("moveFunds: kredi kartı, aynı hesap, sıfır tutar ve kapalı dönem reddedilir", () => {
  const s = base();
  assert.throws(() => moveFunds(s, { fromAccountId: "bank", toAccountId: "card", amount: 100, id: "x1", date: "2026-11-22" }), ValidationError);
  assert.throws(() => moveFunds(s, { fromAccountId: "bank", toAccountId: "bank", amount: 100, id: "x2", date: "2026-11-22" }), /aynı/);
  assert.throws(() => moveFunds(s, { fromAccountId: "bank", toAccountId: "kumbara", amount: 0, id: "x3", date: "2026-11-22" }), /sıfırdan/);
  const closed = closePeriod(s, "2026-11");
  assert.throws(() => moveFunds(closed, { fromAccountId: "bank", toAccountId: "kumbara", amount: 100, id: "x4", date: "2026-11-22" }), /kapalı/);
});
