// Kart ekstresinin hangi bütçeden ödeneceği (A/B), mod geçişi, devreden kararları ve birikimden
// serbest tutara aktarım. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, addAccount, addTransaction, addObligation, computePeriod, closePeriod, balanceOf, setRates, ValidationError,
  setCardBudgetMode, cardBudgetModeAt, cardModeChangeImpact,
  carryoverOf, pendingCarryover, decideCarryover, undoCarryover, savingsToBudget, carryoverCardWarning, CARRYOVER_GOAL_ID,
  updateTransaction, deleteTransaction, deleteObligation
} from "../src/core/index.js";
import { toCloud, fromCloud } from "../src/v3/sync.js";

const TL = n => n * 100;
const now = new Date("2026-11-02T10:00:00Z");
let seq = 0;
const tx = (s, t) => addTransaction(s, { id: `t${++seq}`, currency: "TRY", ...t });

// Maaş günü 1: "2026-10" dönemi = 1–31 Ekim. Kart kesimi 25, son ödeme 5 → Ekim ekstresi 5 Kasım'da ödenir.
function base(card = { cutoffDay: 25, paymentDay: 5 }) {
  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay: 1 } };
  s = addAccount(s, { id: "bank", name: "Banka", type: "bank", currency: "TRY" });
  s = addAccount(s, { id: "card", name: "Kart", type: "credit", currency: "TRY", ...card });
  s = addAccount(s, { id: "save", name: "Birikim", type: "bank", currency: "TRY", opening: { date: "2026-09-01", balance: TL(10000) } });
  s = addAccount(s, { id: "eur", name: "Euro", type: "bank", currency: "EUR" });
  s = addObligation(s, { id: "salary", kind: "income", name: "Maaş", amount: TL(30000), currency: "TRY", accountId: "bank", startPeriod: "2026-09" });
  return s;
}
const pay = s => setCardBudgetMode(s, { mode: "pay", from: "2026-01-01" });

test("A (varsayılan): kart harcaması yapıldığı ayın bütçesinden düşer ve bloke görünür", () => {
  let s = tx(base(), { type: "expense", date: "2026-10-10", amount: TL(1000), accountId: "card", note: "Teknosa" });
  const oct = computePeriod(s, "2026-10");
  assert.equal(oct.spending.total, TL(1000));
  assert.equal(oct.remaining, TL(29000));
  assert.equal(oct.cardBudget.blocked, TL(1000));
  const card = oct.cardBudget.cards[0];
  assert.equal(card.blockedItems[0].name, "Teknosa");
  assert.deepEqual(card.statements, [{ cutoff: "2026-10-25", dueDate: "2026-11-05" }]);
  // Kasım: ekstre nakit olarak ödenir ama bütçeden ikinci kez düşülmez.
  const nov = computePeriod(s, "2026-11");
  assert.equal(nov.cards[0].charges, TL(1000));
  assert.equal(nov.remaining, TL(30000));
  assert.equal(nov.cardBudget.load, 0);
});

test("B: harcama ödendiği ayın bütçesinden düşer; o zamana kadar gelecek dönem yükü", () => {
  let s = pay(base());
  s = tx(s, { type: "expense", date: "2026-10-10", amount: TL(1000), accountId: "card" });
  s = tx(s, { type: "refund", date: "2026-10-12", amount: TL(200), accountId: "card" });
  const oct = computePeriod(s, "2026-10");
  assert.equal(oct.spending.total, 0);
  assert.equal(oct.remaining, TL(30000));
  assert.equal(oct.cardBudget.pending, TL(800));
  const nov = computePeriod(s, "2026-11");
  assert.equal(nov.cardBudget.load, TL(800));
  assert.equal(nov.remaining, TL(29200));
});

test("Taksit: her dönem yalnız o dönemin taksiti bloke edilir; B'de ekstre dönemine kayar", () => {
  const withInstallment = s => addObligation(s, { id: "tv", kind: "installment", name: "TV", amount: TL(500), currency: "TRY", accountId: "card", startPeriod: "2026-10", count: 3 });
  const a = computePeriod(withInstallment(base()), "2026-10");
  assert.equal(a.obligations.total, TL(500));
  const item = a.cardBudget.cards[0].blockedItems[0];
  assert.equal(item.index, 1);
  assert.equal(item.total, 3);
  assert.equal(item.amount, TL(500));

  const s = withInstallment(pay(base()));
  const oct = computePeriod(s, "2026-10");
  assert.equal(oct.obligations.total, 0);
  assert.equal(oct.cardBudget.pending, TL(500));
  // 1 Ekim çekimi 25 Ekim kesimli ekstreye girer, 5 Kasım'da ödenir.
  assert.equal(computePeriod(s, "2026-11").cardBudget.load, TL(500));
  // Kasım taksiti 1 Kasım'da çekilir, 25 Kasım kesimli ekstreyle Aralık'ta ödenir.
  assert.equal(computePeriod(s, "2026-11").cardBudget.pending, TL(500));
});

test("A'dan B'ye geçiş: önceden düşülen harcama yeniden sayılmaz, arada boşluk kalmaz", () => {
  let s = setCardBudgetMode(base(), { mode: "pay", from: "2026-10-15" });
  s = tx(s, { type: "expense", date: "2026-10-10", amount: TL(1000), accountId: "card" }); // A
  s = tx(s, { type: "expense", date: "2026-10-20", amount: TL(2000), accountId: "card" }); // B
  assert.equal(cardBudgetModeAt(s, s.accounts.card, "2026-10-10"), "spend");
  assert.equal(cardBudgetModeAt(s, s.accounts.card, "2026-10-20"), "pay");
  const oct = computePeriod(s, "2026-10");
  const nov = computePeriod(s, "2026-11");
  assert.equal(oct.spending.total, TL(1000));
  assert.equal(nov.cardBudget.load, TL(2000));
  assert.equal(oct.spending.total + oct.cardBudget.load + nov.spending.total + nov.cardBudget.load, TL(3000));
  assert.equal(cardModeChangeImpact(s, { mode: "pay", from: "2026-10-15" }).extra, 0);
});

test("B'den A'ya geçiş: eski ekstre ile yeni blokeler birlikte düşer; ek yük önceden hesaplanır", () => {
  let s = pay(base());
  s = tx(s, { type: "expense", date: "2026-10-10", amount: TL(1000), accountId: "card" }); // B
  const impact = cardModeChangeImpact(s, { mode: "spend", from: "2026-10-15" });
  assert.equal(impact.extra, TL(1000));
  assert.equal(impact.cards[0].name, "Kart");
  s = setCardBudgetMode(s, { mode: "spend", from: "2026-10-15" });
  s = tx(s, { type: "expense", date: "2026-10-20", amount: TL(2000), accountId: "card" }); // A
  const oct = computePeriod(s, "2026-10");
  const nov = computePeriod(s, "2026-11");
  assert.equal(oct.spending.total, TL(2000));
  assert.equal(nov.cardBudget.load, TL(1000));
  assert.equal(oct.spending.total + oct.cardBudget.load + nov.spending.total + nov.cardBudget.load, TL(3000));
});

test("Kart bazında ayar genel ayarı geçersiz kılar; mode: null genel ayara döner", () => {
  let s = pay(base());
  s = setCardBudgetMode(s, { accountId: "card", mode: "spend", from: "2026-10-01" });
  assert.equal(cardBudgetModeAt(s, s.accounts.card, "2026-10-05"), "spend");
  s = setCardBudgetMode(s, { accountId: "card", mode: null, from: "2026-11-01" });
  assert.equal(cardBudgetModeAt(s, s.accounts.card, "2026-11-05"), "pay");
  assert.throws(() => setCardBudgetMode(s, { accountId: "bank", mode: "pay", from: "2026-10-01" }), ValidationError);
  assert.throws(() => setCardBudgetMode(s, { mode: "x", from: "2026-10-01" }), ValidationError);
});

test("Kart ödeme ayarı ve devreden kararları buluta yazılıp geri okunur", () => {
  let s = setCardBudgetMode(base(), { mode: "pay", from: "2026-10-01" });
  s = setCardBudgetMode(s, { accountId: "card", mode: "spend", from: "2026-10-05" });
  s = tx(s, { type: "expense", date: "2026-10-03", amount: TL(100), accountId: "bank" });
  s = closePeriod(s, "2026-10");
  s = decideCarryover(s, "2026-10", { choice: "later" }, { now });
  const back = fromCloud(JSON.parse(JSON.stringify(toCloud(s))));
  assert.deepEqual(back.settings.cardBudgetModes, s.settings.cardBudgetModes);
  assert.deepEqual(back.accounts.card.budgetModes, s.accounts.card.budgetModes);
  assert.deepEqual(back.carryovers, s.carryovers);
  assert.equal(back.closedPeriods["2026-10"].cardBudget.blocked, 0);
});

// ── Devreden ──────────────────────────────────────────────────────────────────

function closedOctober(spent) {
  let s = tx(base(), { type: "expense", date: "2026-10-03", amount: spent, accountId: "bank" });
  return closePeriod(s, "2026-10");
}

test("Devreden: açık dönemde tahmini, kapanınca kesin; serbest tutara eklenmez", () => {
  let s = tx(base(), { type: "expense", date: "2026-10-03", amount: TL(5000), accountId: "bank" });
  const est = carryoverOf(s, "2026-10");
  assert.equal(est.final, false);
  assert.equal(est.amount, TL(25000));
  assert.equal(est.pending, false);
  s = closePeriod(s, "2026-10");
  const c = carryoverOf(s, "2026-10");
  assert.equal(c.final, true);
  assert.equal(c.pending, true);
  assert.equal(pendingCarryover(s).period, "2026-10");
  assert.equal(computePeriod(s, "2026-11").remaining, TL(30000));
});

test("Devreden: sonraki aya taşınan açık ödeme devredene geri eklenir (çift sayılmaz)", () => {
  let s = addObligation(base(), { id: "rent", kind: "fixed", name: "Kira", amount: TL(1000), currency: "TRY", accountId: "bank", startPeriod: "2026-10", count: 1 });
  s = closePeriod(s, "2026-10");
  assert.equal(computePeriod(s, "2026-10").remaining, TL(29000));
  assert.equal(carryoverOf(s, "2026-10").amount, TL(30000));
  let d = closePeriod(addObligation(base(), { id: "rent", kind: "fixed", name: "Kira", amount: TL(1000), currency: "TRY", accountId: "bank", startPeriod: "2026-10", count: 1 }), "2026-10", { decisions: { rent: "drop" } });
  assert.equal(carryoverOf(d, "2026-10").amount, TL(29000));
});

test("Artı devreden → TL birikime aktar: aktarım ve Devreden birikim hedefi; bütçe değişmez", () => {
  let s = closedOctober(TL(5000));
  s = decideCarryover(s, "2026-10", { choice: "saving", fromAccountId: "bank", toAccountId: "save", units: TL(25000) }, { id: "x1", date: "2026-11-02", now });
  const t = s.transactions.x1;
  assert.equal(t.type, "transfer");
  assert.equal(t.amount, TL(25000));
  assert.equal(s.goals[CARRYOVER_GOAL_ID].target, TL(25000));
  assert.deepEqual(s.goals[CARRYOVER_GOAL_ID].accountIds, ["save"]);
  assert.equal(s.carryovers["2026-10"].choice, "saving");
  assert.equal(carryoverOf(s, "2026-10").pending, false);
  const nov = computePeriod(s, "2026-11");
  assert.equal(nov.remaining, TL(30000));
  assert.equal(nov.income.total, TL(30000));
  assert.throws(() => decideCarryover(s, "2026-10", { choice: "ignore" }, { now }), ValidationError);
});

test("Artı devreden → döviz birikimi: miktar devredenle eşleşmek zorunda değil, not otomatik", () => {
  let s = closedOctober(TL(27700)); // devreden 2.300 ₺
  s = decideCarryover(s, "2026-10", { choice: "saving", fromAccountId: "bank", toAccountId: "eur", units: 5000 }, { id: "x2", date: "2026-11-02", now });
  const t = s.transactions.x2;
  assert.equal(t.type, "exchange");
  assert.equal(t.amount, TL(2300));
  assert.equal(t.toAmount, 5000);
  assert.match(t.note, /Ekim ayından devreden .*2\.300.* ile 50 € alındı/);
  assert.equal(balanceOf(s, "eur", "2026-11-02"), 5000);
  assert.equal(computePeriod(s, "2026-11").remaining, TL(30000));
});

test("Artı devreden → döviz birikimi, devredenin bir kısmıyla: kalan TL hesapta kalır, hedef ve geri alma o kadar", () => {
  let s = closedOctober(TL(27700)); // devreden 2.300 ₺
  s = decideCarryover(s, "2026-10", { choice: "saving", fromAccountId: "bank", toAccountId: "eur", units: 3000, tlAmount: TL(1500) }, { id: "x3", date: "2026-11-02", now });
  const t = s.transactions.x3;
  assert.equal(t.amount, TL(1500));
  assert.equal(t.toAmount, 3000);
  assert.match(t.note, /1\.500/);
  assert.equal(s.carryovers["2026-10"].tlAmount, TL(1500));
  assert.equal(s.goals[CARRYOVER_GOAL_ID].target, TL(1500));
  assert.equal(computePeriod(s, "2026-11").remaining, TL(30000)); // serbest tutara eklenmez
  // Devredeni aşan tutar reddedilir.
  assert.throws(() => decideCarryover(closedOctober(TL(27700)), "2026-10", { choice: "saving", fromAccountId: "bank", toAccountId: "eur", units: 1, tlAmount: TL(2301) }, { id: "x4", date: "2026-11-02", now }), ValidationError);
  const u = undoCarryover(s, "2026-10");
  assert.equal(u.transactions.x3, undefined);
  assert.equal(u.goals[CARRYOVER_GOAL_ID], undefined);
});

test("Artı devreden → sonra karar ver, ardından yok say", () => {
  let s = closedOctober(TL(5000));
  s = decideCarryover(s, "2026-10", { choice: "later" }, { now });
  assert.equal(carryoverOf(s, "2026-10").pending, true);
  s = decideCarryover(s, "2026-10", { choice: "ignore" }, { now });
  assert.equal(s.carryovers["2026-10"].choice, "ignore");
  assert.equal(pendingCarryover(s), null);
  assert.equal(computePeriod(s, "2026-11").remaining, TL(30000));
  assert.throws(() => decideCarryover(s, "2026-10", { choice: "nextBudget" }, { now }), ValidationError);
});

test("Eksi devreden → sonraki ayın bütçesinden düşülür", () => {
  let s = closedOctober(TL(35000));
  assert.equal(carryoverOf(s, "2026-10").amount, -TL(5000));
  assert.throws(() => decideCarryover(s, "2026-10", { choice: "later" }, { now }), ValidationError);
  s = decideCarryover(s, "2026-10", { choice: "nextBudget" }, { now });
  const nov = computePeriod(s, "2026-11");
  assert.equal(nov.carry.in, TL(5000));
  assert.equal(nov.remaining, TL(25000));
  assert.equal(nov.income.total, TL(30000));
});

test("Eksi devreden → birikimden karşılanır (TL aktarım; dövizde kurla bozdurma)", () => {
  let s = decideCarryover(closedOctober(TL(35000)), "2026-10", { choice: "saving", fromAccountId: "save", toAccountId: "bank" }, { id: "x3", date: "2026-11-02", now });
  assert.equal(s.transactions.x3.amount, TL(5000));
  assert.equal(balanceOf(s, "save", "2026-11-02"), TL(5000));
  assert.equal(computePeriod(s, "2026-11").remaining, TL(30000));

  let e = setRates(closedOctober(TL(35000)), { EUR: 40 });
  e = decideCarryover(e, "2026-10", { choice: "saving", fromAccountId: "eur", toAccountId: "bank" }, { id: "x4", date: "2026-11-02", now });
  assert.equal(e.transactions.x4.type, "exchange");
  assert.equal(e.transactions.x4.amount, 12500); // 125 €
  assert.equal(e.transactions.x4.toAmount, TL(5000));
  assert.throws(() => decideCarryover(closedOctober(TL(35000)), "2026-10", { choice: "saving", fromAccountId: "eur", toAccountId: "bank" }, { id: "x5", date: "2026-11-02", now, rates: {} }), /kuru eksik/);
});

test("Eksi devreden → borç alındı: kendi cinsinden tutar ve vadesiyle borç kalemi", () => {
  let s = addAccount(closedOctober(TL(35000)), { id: "gold", name: "Altın", type: "cash", currency: "XAU" });
  s = decideCarryover(s, "2026-10", { choice: "debt", currency: "XAU", amount: 200, dueDate: "2027-01-10", lender: "Annem", accountId: "gold" }, { id: "d1", now });
  const o = s.obligations.d1;
  assert.equal(o.kind, "debt");
  assert.equal(o.name, "Borç · Annem");
  assert.equal(o.amount, 200);
  assert.equal(o.startPeriod, "2027-01");
  assert.equal(s.carryovers["2026-10"].obligationId, "d1");
  assert.equal(computePeriod(s, "2026-11").remaining, TL(30000));
  const jan = computePeriod(s, "2027-01", { rates: { XAU: 3000 } }).obligations.items.find(i => i.obligationId === "d1");
  assert.equal(jan.dueDate, "2027-01-10");
});

test("Eksi devreden → yok say (kayıt hatası / sorun değil): yalnız etiket farklı", () => {
  for (const choice of ["ignoreError", "ignoreOk"]) {
    const s = decideCarryover(closedOctober(TL(35000)), "2026-10", { choice }, { now });
    assert.equal(s.carryovers["2026-10"].choice, choice);
    assert.equal(computePeriod(s, "2026-11").remaining, TL(30000));
  }
});

test("Devreden kararı kapanmamış dönemde verilemez", () => {
  const s = tx(base(), { type: "expense", date: "2026-10-03", amount: TL(5000), accountId: "bank" });
  assert.throws(() => decideCarryover(s, "2026-10", { choice: "ignore" }, { now }), /kapanmadan/);
});

test("Birikimden serbest tutara aktarım: bu dönemin serbest tutarına eklenir, gelir sayılmaz", () => {
  let s = savingsToBudget(base(), { fromAccountId: "save", toAccountId: "bank", amount: TL(2000), id: "b1", date: "2026-11-03", now });
  const nov = computePeriod(s, "2026-11");
  assert.equal(nov.carry.fromSavings, TL(2000));
  assert.equal(nov.remaining, TL(32000));
  assert.equal(nov.income.total, TL(30000));
  assert.equal(balanceOf(s, "save", "2026-11-03"), TL(8000));
  // Dövizden: kurla TL karşılığı hesaplanır.
  let e = setRates(base(), { EUR: 40 });
  e = addTransaction(e, { id: "in", type: "income", date: "2026-10-02", amount: 10000, currency: "EUR", accountId: "eur" });
  e = savingsToBudget(e, { fromAccountId: "eur", toAccountId: "bank", amount: 5000, id: "b2", date: "2026-11-03", now });
  assert.equal(e.transactions.b2.toAmount, TL(2000));
  assert.equal(computePeriod(e, "2026-11", { rates: { EUR: 40 } }).carry.fromSavings, TL(2000));
  assert.throws(() => savingsToBudget(closedOctober(TL(1)), { fromAccountId: "save", toAccountId: "bank", amount: 100, id: "b3", date: "2026-10-20", now }), /kapalı/);
});

test("B modunda yaklaşan ekstre sonraki ayın gelirini aşıyorsa uyarı", () => {
  let s = pay(base());
  s = tx(s, { type: "expense", date: "2026-10-10", amount: TL(31000), accountId: "card" });
  s = closePeriod(s, "2026-10");
  const w = carryoverCardWarning(s, "2026-10");
  assert.equal(w.load, TL(31000));
  assert.equal(w.short, TL(1000));
  assert.equal(carryoverCardWarning(closedOctober(TL(100)), "2026-10"), null);
});

// ── Kararı geri alma, silme koruması, kapalı dönem ──────────────────────────────

test("Devreden kararı geri alınır: aktarım silinir, hedef geri düşülür, dönem yeniden karar bekler", () => {
  let s = closedOctober(TL(5000));
  s = decideCarryover(s, "2026-10", { choice: "saving", fromAccountId: "bank", toAccountId: "save", units: TL(25000) }, { id: "u1", date: "2026-11-02", now });
  s = undoCarryover(s, "2026-10");
  assert.equal(s.transactions.u1, undefined);
  assert.equal(s.goals[CARRYOVER_GOAL_ID], undefined);
  assert.equal(s.carryovers["2026-10"], undefined);
  assert.equal(carryoverOf(s, "2026-10").pending, true);
  assert.equal(balanceOf(s, "save", "2026-11-02"), TL(10000));
  // Yeniden seçilebilir.
  s = decideCarryover(s, "2026-10", { choice: "ignore" }, { now });
  assert.equal(s.carryovers["2026-10"].choice, "ignore");
  assert.throws(() => undoCarryover(s, "2026-09"), /karar/);
});

test("Geri alma yalnız o kararın payını düşer; hedefe başka kararla bağlı hesap kalır", () => {
  let s = closedOctober(TL(5000)); // Ekim: +25.000
  s = decideCarryover(s, "2026-10", { choice: "saving", fromAccountId: "bank", toAccountId: "save", units: TL(25000) }, { id: "u2", date: "2026-11-02", now });
  s = tx(s, { type: "expense", date: "2026-11-03", amount: TL(20000), accountId: "bank" });
  s = closePeriod(s, "2026-11"); // Kasım: +10.000
  s = decideCarryover(s, "2026-11", { choice: "saving", fromAccountId: "bank", toAccountId: "save", units: TL(10000) }, { id: "u3", date: "2026-12-02", now });
  assert.equal(s.goals[CARRYOVER_GOAL_ID].target, TL(35000));
  s = undoCarryover(s, "2026-11");
  assert.equal(s.goals[CARRYOVER_GOAL_ID].target, TL(25000));
  assert.deepEqual(s.goals[CARRYOVER_GOAL_ID].accountIds, ["save"]);
  // Ekim kararının aktarımı kapanmış Kasım dönemine düştü: geri alınamaz.
  assert.throws(() => undoCarryover(s, "2026-10"), /kapanmış 2026-11/);
});

test("Sonraki aydan düşülen açık geri alınınca o ayın serbest tutarı eski hâline döner", () => {
  let s = decideCarryover(closedOctober(TL(35000)), "2026-10", { choice: "nextBudget" }, { now });
  assert.equal(computePeriod(s, "2026-11").remaining, TL(25000));
  const undone = undoCarryover(s, "2026-10");
  assert.equal(computePeriod(undone, "2026-11").remaining, TL(30000));
  const closedNov = closePeriod(s, "2026-11");
  assert.throws(() => undoCarryover(closedNov, "2026-10"), /sonraki dönem kapandı/);
});

test("Borç kararı geri alınınca borç silinir; ödemesi girildiyse geri alınamaz", () => {
  let s = addAccount(closedOctober(TL(35000)), { id: "gold", name: "Altın", type: "cash", currency: "XAU" });
  s = decideCarryover(s, "2026-10", { choice: "debt", currency: "XAU", amount: 200, dueDate: "2027-01-10", accountId: "gold" }, { id: "d2", now });
  assert.throws(() => deleteObligation(s, "d2"), /devreden kararını geri alın/);
  assert.equal(undoCarryover(s, "2026-10").obligations.d2, undefined);
  const paid = addTransaction(s, { id: "p1", type: "expense", date: "2027-01-10", amount: 200, currency: "XAU", accountId: "gold", obligationId: "d2", period: "2027-01" });
  assert.throws(() => undoCarryover(paid, "2026-10"), /ödemesi girildi/);
});

test("Devredenle oluşan aktarım tek başına silinmez; karar geri alınarak silinir", () => {
  const s = decideCarryover(closedOctober(TL(5000)), "2026-10", { choice: "saving", fromAccountId: "bank", toAccountId: "save", units: TL(25000) }, { id: "u4", date: "2026-11-02", now });
  assert.equal(s.transactions.u4.carryover, "2026-10");
  assert.throws(() => deleteTransaction(s, "u4"), /devreden kararını geri alın/);
});

test("Kapalı döneme yeni kayıt eklenemez", () => {
  const s = closedOctober(TL(100));
  assert.throws(() => tx(s, { type: "expense", date: "2026-10-20", amount: TL(50), accountId: "bank" }), /2026-10 dönemi kapalı/);
  assert.ok(tx(s, { type: "expense", date: "2026-11-01", amount: TL(50), accountId: "bank" }));
  assert.ok(addTransaction(s, { id: "ok1", type: "expense", date: "2026-10-20", amount: TL(50), currency: "TRY", accountId: "bank" }, { allowClosed: true }));
});

test("Döviz/altın alım-satımında alınan miktar da düzenlenir", () => {
  let s = decideCarryover(closedOctober(TL(27700)), "2026-10", { choice: "saving", fromAccountId: "bank", toAccountId: "eur", units: 5000 }, { id: "u5", date: "2026-11-02", now });
  s = updateTransaction(s, "u5", { toAmount: 5500 });
  assert.equal(balanceOf(s, "eur", "2026-11-02"), 5500);
  assert.throws(() => updateTransaction(s, "u5", { toAmount: 0 }), ValidationError);
});
