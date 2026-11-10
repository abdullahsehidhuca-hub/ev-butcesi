// Kredi kartı hesap kesim günü ekstresi ile birikim / döviz / altın varlıkları ve hedefler.
// Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, addAccount, addTransaction, addObligation, putRecord, computePeriod, ValidationError,
  statementsDueIn, statementDueDate, statementCutoffFor,
  setRates, ratesOf, assetsSummary, addGoal, updateGoal, deleteGoal, goalProgress, emergencyFundTarget
} from "../src/core/index.js";
import { toCloud, fromCloud, clean } from "../src/v3/sync.js";

const tx = (s, t) => addTransaction(s, { currency: "TRY", ...t });

function cardState(card = {}) {
  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay: 15 } };
  s = addAccount(s, { id: "bank", name: "Banka", type: "bank", currency: "TRY" });
  s = addAccount(s, { id: "card", name: "Kart", type: "credit", currency: "TRY", ...card });
  return s;
}

test("Ekstre penceresi kesim gününe göre; son ödeme tarihi ödeme gününe ya da kesim + 10 güne düşer", () => {
  const acc = { cutoffDay: 28, paymentDay: 10 };
  assert.deepEqual(statementsDueIn(acc, "2026-11", 15), [{ cutoff: "2026-11-28", from: "2026-10-29", to: "2026-11-28", dueDate: "2026-12-10" }]);
  assert.equal(statementDueDate({ cutoffDay: 28 }, "2026-11-28"), "2026-12-08");
  assert.equal(statementDueDate({ cutoffDay: 5, paymentDay: 20 }, "2026-11-05"), "2026-11-20");
  assert.equal(statementCutoffFor({ cutoffDay: 31 }, "2027-02-10"), "2027-02-28");
  assert.equal(statementCutoffFor(acc, "2026-11-29"), "2026-12-28");
  assert.deepEqual(statementsDueIn({}, "2026-11", 15), []);
});

test("Kart borcu kesim gününe göre ayrılır: kesimden sonraki harcama sonraki ekstreye kalır; iade ve otomatik taksit yansır", () => {
  let s = cardState({ cutoffDay: 28, paymentDay: 10 });
  s = tx(s, { id: "a", type: "expense", date: "2026-10-30", amount: 300_00, accountId: "card" });
  s = tx(s, { id: "b", type: "expense", date: "2026-11-20", amount: 200_00, accountId: "card" });
  s = tx(s, { id: "c", type: "expense", date: "2026-11-29", amount: 999_00, accountId: "card" });
  s = tx(s, { id: "d", type: "refund", date: "2026-11-21", amount: 50_00, accountId: "card" });
  s = addObligation(s, { id: "tv", kind: "installment", name: "TV", amount: 1000_00, currency: "TRY", accountId: "card", startPeriod: "2026-11", count: 3 });
  s = tx(s, { id: "p", type: "transfer", date: "2026-12-05", amount: 400_00, accountId: "bank", toAccountId: "card" });

  const card = computePeriod(s, "2026-11").cards[0];
  assert.equal(card.dueDate, "2026-12-10");
  assert.equal(card.statements[0].expenses, 500_00);
  assert.equal(card.statements[0].refunds, 50_00);
  assert.equal(card.statements[0].automatic, 1000_00);
  assert.equal(card.charges, 1450_00);
  assert.equal(card.due, 1050_00);
  // 29 Kasım harcaması bir sonraki ekstrede.
  assert.equal(computePeriod(s, "2026-12").cards[0].statements[0].expenses, 999_00);
});

test("Kesim günü girilmemiş kartta eski kural: önceki dönem harcaması bu dönem ödenir", () => {
  let s = cardState();
  s = tx(s, { id: "a", type: "expense", date: "2026-10-20", amount: 300_00, accountId: "card" });
  const card = computePeriod(s, "2026-11").cards[0];
  assert.equal(card.charges, 300_00);
  assert.equal("statements" in card, false);
});

function assetState() {
  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay: 15 } };
  s = addAccount(s, { id: "tl", name: "Vadesiz", type: "bank", currency: "TRY", opening: { date: "2026-11-01", balance: 5000_00 } });
  s = addAccount(s, { id: "usd", name: "Dolar", type: "bank", currency: "USD", opening: { date: "2026-11-01", balance: 1000_00 } });
  s = addAccount(s, { id: "gold", name: "Altın", type: "bank", currency: "XAU", opening: { date: "2026-11-01", balance: 10_00 } });
  s = addAccount(s, { id: "card", name: "Kart", type: "credit", currency: "TRY" });
  return s;
}

test("Varlıklar kendi para biriminde ve TL karşılığıyla; eksik kur raporlanır, sıfır sayılmaz", () => {
  let s = assetState();
  const none = assetsSummary(s, "2026-11-20");
  assert.deepEqual(none.missingRates, ["USD", "XAU"]);
  assert.equal(none.totalTL, 5000_00);
  assert.equal(none.list.some(x => x.accountId === "card"), false);

  s = setRates(s, { USD: 40, XAU: 3000 });
  assert.deepEqual(ratesOf(s), { USD: 40, XAU: 3000 });
  const all = assetsSummary(s, "2026-11-20");
  assert.deepEqual(all.missingRates, []);
  assert.equal(all.totalTL, 5000_00 + 40000_00 + 30000_00);
  assert.deepEqual(all.byCurrency, { TRY: 5000_00, USD: 1000_00, XAU: 10_00 });

  assert.throws(() => setRates(s, { USD: 0 }), ValidationError);
  assert.throws(() => setRates(s, { TRY: 1 }), ValidationError);
  assert.deepEqual(ratesOf(setRates(s, { XAU: null })), { USD: 40 });
});

test("Hedef: bağlı hesaplardan biriken, kalan ve hedef tarihine kadar aylık gereken tutar", () => {
  let s = setRates(assetState(), { USD: 40, XAU: 3000 });
  s = addGoal(s, { id: "ev", name: "Ev peşinatı", target: 100000_00, accountIds: ["usd", "gold"], targetDate: "2027-01-20" });
  const g = goalProgress(s, "ev", "2026-11-20");
  assert.equal(g.saved, 70000_00);
  assert.equal(g.left, 30000_00);
  assert.equal(g.percent, 70);
  assert.equal(g.periodsLeft, 3);
  assert.equal(g.monthlyNeeded, 10000_00);
  assert.equal(g.reached, false);

  s = updateGoal(s, "ev", { target: 50000_00 });
  assert.equal(goalProgress(s, "ev", "2026-11-20").reached, true);
  assert.throws(() => addGoal(s, { id: "x", name: "X", target: 100_00, accountIds: ["card"] }), ValidationError);
  assert.throws(() => addGoal(s, { id: "x", name: "X", target: 0, accountIds: [] }), ValidationError);
  assert.equal(deleteGoal(s, "ev").goals.ev, undefined);
});

test("Acil durum fonu önerisi: aylık zorunlu gider × ay sayısı", () => {
  let s = assetState();
  s = addObligation(s, { id: "kira", kind: "fixed", name: "Kira", amount: 20000_00, currency: "TRY", accountId: "tl", startPeriod: "2026-01" });
  s = addObligation(s, { id: "maas", kind: "income", name: "Maaş", amount: 60000_00, currency: "TRY", accountId: "tl", startPeriod: "2026-01" });
  s = putRecord(s, "categories", { id: "market", name: "Market", budget: 5000_00 });
  const e = emergencyFundTarget(s, "2026-11");
  assert.equal(e.monthly, 25000_00);
  assert.equal(e.target, 150000_00);
});

test("Hedefler ve kurlar buluta kayıt kayıt yazılıp aynen geri okunur", () => {
  let s = setRates(assetState(), { USD: 40 });
  s = addGoal(s, { id: "acil", kind: "emergency", name: "Acil durum", target: 1000_00, accountIds: ["tl"] });
  s = addGoal(s, { id: "bos", name: "Boş", target: 1000_00, accountIds: [] });
  const back = fromCloud(clean(JSON.parse(JSON.stringify(toCloud(s)))));
  assert.deepEqual(back.goals, s.goals);
  assert.deepEqual(back.settings.rates, { USD: 40 });
});
