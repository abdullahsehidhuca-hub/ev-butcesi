// Hesap motoru: saf fonksiyonlar. Arayüz, Firebase veya cihaz saati bilmez;
// aynı girdi her zaman aynı sonucu verir ve testlerle doğrulanır.

import { toBase, sum } from "./money.js";
import { periodOf, prevPeriod, nextPeriod, addPeriods } from "./period.js";
import { occurrencesIn } from "./schedule.js";
import { addObligation, skipObligation, ValidationError } from "./model.js";
import { statementsDueIn, statementCharges } from "./cardStatement.js";
import { cardBudget } from "./cardBudget.js";

const payDayOf = state => state.settings?.payDay || 1;

// İşlemin bütçe dönemi: yükümlülük ödemesi ait olduğu döneme, diğerleri tarihine göre.
export function txPeriod(t, payDay) {
  return t.period || periodOf(t.date, payDay);
}

export const isClosed = (state, period) => !!state.closedPeriods?.[period];

// Kapalı dönemde dondurulmuş özet, açık dönemde canlı hesap döner.
export function computePeriod(state, period, { rates = {} } = {}) {
  return state.closedPeriods?.[period] || liveSummary(state, period, rates);
}

function liveSummary(state, period, rates) {
  const payDay = payDayOf(state);
  const missing = new Set();
  const base = (amount, currency) => {
    const v = toBase(amount, currency, rates);
    if (v == null) { missing.add(currency); return 0; }
    return v;
  };
  const all = Object.values(state.transactions);
  const inPeriod = p => all.filter(t => txPeriod(t, payDay) === p);
  const txs = inPeriod(period);

  // Kart ödeme ayarı B ("ödendiği ayın bütçesinden") olan kart kalemleri bu dönemin harcama/ödeme
  // toplamına girmez; ekstresinin ödendiği dönemde cardBudget.load olarak düşülür (src/core/cardBudget.js).
  const cb = cardBudget(state, period, base);
  const deferredTx = new Set(cb.cards.flatMap(c => c.deferred.filter(i => i.txId).map(i => i.txId)));
  const deferredOb = new Set(cb.cards.flatMap(c => c.deferred.filter(i => i.obligationId).map(i => i.obligationId)));

  // Yükümlülük ödemeleri: ödenen tutar gerçekleşen maliyettir (fatura tutarı plandan farklı olabilir).
  // Kısmi ödeme (partial) kalemi kapatmaz; kalan tutar açık kalır.
  const paidBy = {};
  const finalBy = new Set();
  for (const t of txs) {
    if (!t.obligationId) continue;
    paidBy[t.obligationId] = (paidBy[t.obligationId] || 0) + base(t.amount, t.currency);
    if (!t.partial) finalBy.add(t.obligationId);
  }
  // Kredi kartına bağlı gider kalemleri (taksit, abonelik) karttan kendiliğinden çekilir:
  // "ödendi" işareti beklenmez, açık sayılmaz ve ay kapatmada devredilmez (çift sayım olurdu).
  // Kartın kendisi bankadan ödenir; o ödeme cards bölümünde izlenir.
  const items = occurrencesIn(state, period).map(oc => {
    const planned = base(oc.amount, oc.currency);
    const paid = paidBy[oc.obligationId] || 0;
    const auto = oc.kind !== "income" && state.accounts[oc.accountId]?.type === "credit";
    const settled = auto || finalBy.has(oc.obligationId);
    const open = settled ? 0 : Math.max(0, planned - paid);
    const deferred = auto && deferredOb.has(oc.obligationId);
    return { ...oc, planned, paid, auto, settled, cost: settled && paid > 0 ? paid : Math.max(planned, paid), open, ...(deferred ? { deferred } : {}) };
  });
  const incomeItems = items.filter(i => i.kind === "income");
  const outItems = items.filter(i => i.kind !== "income");

  // Maaş gibi beklenen gelir "alındı" işaretlenmeden ayrı bir gelir olarak girilmişse çift sayılmaz:
  // bağsız gelir önce bekleyen gelir kalemlerini karşılar, fazlası ek gelirdir.
  const incomeTxs = txs.filter(t => t.type === "income");
  const received = sum(incomeTxs.map(t => base(t.amount, t.currency)));
  const unlinkedIncome = sum(incomeTxs.filter(t => !t.obligationId && !t.adjustment).map(t => base(t.amount, t.currency)));
  const expectedOpen = Math.max(0, sum(incomeItems.map(i => i.open)) - unlinkedIncome);
  const incomeTotal = received + expectedOpen;

  // Serbest harcamalar (yükümlülüğe bağlı olmayan giderler), kategori bazında; iadeler düşülür.
  const byCategory = {};
  for (const t of txs) {
    if ((t.type !== "expense" && t.type !== "refund") || t.obligationId || deferredTx.has(t.id)) continue;
    const k = t.adjustment ? "_adjustment" : (t.categoryId || "_none");
    const sign = t.type === "refund" ? -1 : 1;
    byCategory[k] = (byCategory[k] || 0) + sign * base(t.amount, t.currency);
  }
  const spendingTotal = sum(Object.values(byCategory));

  // Kategori bütçesinin henüz harcanmamış kısmı ayrılmış sayılır.
  const budgets = Object.values(state.categories)
    .filter(c => !c.archived && c.budget > 0)
    .map(c => ({ categoryId: c.id, budget: c.budget, spent: byCategory[c.id] || 0, left: Math.max(0, c.budget - (byCategory[c.id] || 0)) }));
  const reserved = sum(budgets.map(b => b.left));

  const obligationsTotal = sum(outItems.filter(i => !i.deferred).map(i => i.cost));
  const obligationsOpen = sum(outItems.map(i => i.open));

  // Devreden (src/core/carryover.js): önceki dönemin açığı "sonraki ay bütçemden düşülsün" seçildiyse
  // bu dönemden düşülür. Birikimden serbest tutara aktarım (toBudget işaretli aktarım) bu döneme eklenir.
  // İkisi de gelir ya da gider değildir; ayrı satır olarak raporlanır.
  const prevCarry = state.carryovers?.[prevPeriod(period)];
  const carryIn = prevCarry?.choice === "nextBudget" ? Math.max(0, -prevCarry.amount) : 0;
  const fromSavings = sum(txs.filter(t => t.toBudget && (t.type === "transfer" || t.type === "exchange"))
    .map(t => t.type === "exchange" ? base(t.toAmount, state.accounts[t.toAccountId]?.currency) : base(t.amount, t.currency)));
  const remaining = incomeTotal - obligationsTotal - spendingTotal - cb.load - carryIn + fromSavings;

  // Kredi kartı: hesap kesim günü (cutoffDay) girilmişse son ödeme tarihi bu döneme düşen
  // ekstre(ler) ödenir; ekstre = kesim penceresindeki harcamalar − iadeler + karttan otomatik
  // çekilen yükümlülükler (src/core/cardStatement.js). Kesim günü yoksa önceki dönemde karta
  // yazılanlar bu dönem ödenir. Her iki durumda bu dönem karta yapılan aktarımlar düşülür.
  const prev = prevPeriod(period);
  const prevTxs = inPeriod(prev);
  const prevLinked = new Set(prevTxs.filter(t => t.obligationId).map(t => t.obligationId));
  const prevOccurrences = occurrencesIn(state, prev).filter(o => o.kind !== "income" && !prevLinked.has(o.obligationId));
  const cards = Object.values(state.accounts).filter(a => a.type === "credit").map(a => {
    const charged = sum(prevTxs.filter(t => t.type === "expense" && t.accountId === a.id).map(t => base(t.amount, t.currency)))
      - sum(prevTxs.filter(t => t.type === "refund" && t.accountId === a.id).map(t => base(t.amount, t.currency)));
    const automatic = sum(prevOccurrences.filter(o => o.accountId === a.id).map(o => base(o.amount, o.currency)));
    const payments = sum(txs.filter(t => t.type === "transfer" && t.toAccountId === a.id).map(t => base(t.amount, t.currency)));
    let charges = charged + automatic;
    let statements = null;
    if (a.cutoffDay) {
      statements = statementsDueIn(a, period, payDay).map(st => ({ ...st, ...statementCharges(state, a, st, base) }));
      charges = sum(statements.map(st => st.total));
    }
    return {
      accountId: a.id, name: a.name, charges: Math.max(0, charges), payments, due: Math.max(0, charges - payments),
      ...(statements ? { statements, dueDate: statements[statements.length - 1]?.dueDate || null } : {})
    };
  });

  return {
    period,
    closed: false,
    income: { received, expectedOpen, total: incomeTotal },
    obligations: { items, total: obligationsTotal, open: obligationsOpen },
    spending: { total: spendingTotal, byCategory },
    budgets: { items: budgets, reserved },
    remaining,
    safeToSpend: remaining - reserved,
    cards,
    cardBudget: {
      blocked: cb.blocked, load: cb.load, pending: cb.pending,
      cards: cb.cards.map(({ deferred, ...c }) => c)
    },
    carry: { in: carryIn, fromSavings },
    missingRates: [...missing].sort()
  };
}

// Dönemi kapatır ve dondurur. Ödenmemiş yükümlülükler için karar:
//  "carry" (varsayılan): sonraki döneme tek seferlik kalem olarak taşı
//  "defer": bu dönemi atla (taksit/borçta takvim bir dönem uzar)
//  "drop": vazgeç
export function closePeriod(state, period, { rates = {}, decisions = {}, closedAt = null } = {}) {
  if (isClosed(state, period)) throw new ValidationError([`${period} zaten kapalı`]);
  const summary = liveSummary(state, period, rates);
  if (summary.missingRates.length) throw new ValidationError([`kur eksik: ${summary.missingRates.join(", ")}`]);

  let next = state;
  const applied = [];
  for (const item of summary.obligations.items) {
    if (item.kind === "income" || !item.open) continue;
    const decision = decisions[item.obligationId] || "carry";
    if (decision === "carry") {
      next = addObligation(next, {
        id: `${item.obligationId}~${period}`,
        kind: "fixed",
        name: `${item.name} (devir)`,
        amount: item.amount,
        currency: item.currency,
        accountId: item.accountId,
        categoryId: item.categoryId,
        startPeriod: nextPeriod(period),
        count: 1,
        carriedFrom: { obligationId: item.obligationId, period }
      });
    } else if (decision === "defer") {
      next = skipObligation(next, item.obligationId, period);
    } else if (decision !== "drop") {
      throw new ValidationError([`geçersiz devir kararı: ${decision}`]);
    }
    applied.push({ obligationId: item.obligationId, decision });
  }

  const snapshot = { ...summary, closed: true, closedAt, rates: { ...rates }, decisions: applied };
  return { ...next, closedPeriods: { ...next.closedPeriods, [period]: snapshot } };
}

// Gelecek dönemlerin planı: beklenen gelir − yükümlülükler − kategori bütçeleri.
export function projection(state, fromPeriod, count, { rates = {} } = {}) {
  const budgets = sum(Object.values(state.categories).filter(c => !c.archived && c.budget > 0).map(c => c.budget));
  return Array.from({ length: count }, (_, i) => {
    const period = addPeriods(fromPeriod, i);
    const missing = new Set();
    const base = oc => { const v = toBase(oc.amount, oc.currency, rates); if (v == null) { missing.add(oc.currency); return 0; } return v; };
    const items = occurrencesIn(state, period);
    const income = sum(items.filter(o => o.kind === "income").map(base));
    const obligations = sum(items.filter(o => o.kind !== "income").map(base));
    return {
      period,
      income,
      obligations,
      budgets,
      free: income - obligations - budgets,
      ending: items.filter(o => o.total != null && o.index === o.total).map(o => o.name),
      missingRates: [...missing].sort()
    };
  });
}
