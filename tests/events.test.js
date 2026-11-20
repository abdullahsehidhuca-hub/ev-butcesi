import { test } from "node:test";
import assert from "node:assert/strict";
import { eventSummary, settleUp, validateEventExpense, validateEventMeta, eventEnded } from "../src/core/events.js";

const camp = {
  meta: { name: "Kamp", kind: "split", start: "2026-07-01", end: "2026-07-03" },
  members: { ali: { name: "Ali" }, ayse: { name: "Ayşe" }, can: { name: "Can" } },
  expenses: {
    e1: { amount: 900_00, paidBy: "ali", method: "card", category: "food", date: "2026-07-01" },
    e2: { amount: 300_00, paidBy: "ayse", method: "cash", category: "transport", date: "2026-07-02" },
    e3: { amount: 100_01, paidBy: "ali", method: "cash", category: "food", date: "2026-07-02" }
  }
};

test("ortak harcama: toplamlar kategoriye, ödeme biçimine ve kişiye göre", () => {
  const s = eventSummary(camp, "2026-07-02");
  assert.equal(s.total, 1300_01);
  assert.deepEqual(s.byCategory, { food: 1000_01, transport: 300_00 });
  assert.deepEqual(s.byMethod, { cash: 400_01, card: 900_00 });
  assert.deepEqual(s.byPayer, { ali: 1000_01, ayse: 300_00 });
  assert.equal(s.budget, undefined);
});

test("hesaplaşma: eşit pay, kuruş farkı kaybolmaz, en az aktarım", () => {
  const r = settleUp(camp);
  assert.equal(Object.values(r.share).reduce((a, b) => a + b, 0), 1300_01);
  assert.deepEqual(r.share, { ali: 433_34, ayse: 433_34, can: 433_33 });
  assert.deepEqual(r.transfers, [{ from: "can", to: "ali", amount: 433_33 }, { from: "ayse", to: "ali", amount: 133_34 }]);
  assert.equal(Object.values(r.balance).reduce((a, b) => a + b, 0), 0);
  assert.deepEqual(settleUp({ members: { a: {}, b: {} }, expenses: {} }).transfers, []);
});

test("tatil bütçesi: kalan, kalan gün ve günlük harcanabilir", () => {
  const trip = { ...camp, meta: { name: "Tatil", kind: "trip", start: "2026-07-01", end: "2026-07-05", budget: 5000_00 } };
  const s = eventSummary(trip, "2026-07-02");
  assert.equal(s.left, 5000_00 - 1300_01);
  assert.equal(s.daysLeft, 4);
  assert.equal(s.perDay, Math.floor((5000_00 - 1300_01) / 4));
  assert.equal(s.spentToday, 400_01);
  assert.equal(eventSummary(trip, "2026-06-20").daysLeft, 5, "başlamadıysa bütün süre");
  assert.equal(eventSummary(trip, "2026-07-06").perDay, null, "bittiyse günlük tutar yok");
  assert.equal(eventEnded(trip, "2026-07-06"), true);
});

test("doğrulama: harcama ve etkinlik alanları", () => {
  assert.deepEqual(validateEventExpense(camp, { amount: 100, paidBy: "ali", method: "cash", date: "2026-07-01" }), []);
  assert.equal(validateEventExpense(camp, { amount: 0, paidBy: "x", method: "pos", date: "" }).length, 4);
  assert.deepEqual(validateEventMeta({ name: "Kamp", kind: "split", start: "2026-07-01", end: "2026-07-03" }), []);
  assert.deepEqual(validateEventMeta({ name: "Tatil", kind: "trip", start: "2026-07-03", end: "2026-07-01" }), ["bitiş tarihi başlangıçtan önce olamaz", "toplam bütçeyi girin, örneğin 30.000"]);
});
