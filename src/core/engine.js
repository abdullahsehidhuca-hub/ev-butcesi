// Hesap motoru: saf fonksiyonlar. Arayüz, Firebase veya cihaz saati bilmez;
// aynı girdi her zaman aynı sonucu verir ve testlerle doğrulanır.

import { toBase, sum } from "./money.js";
import { periodOf, prevPeriod, nextPeriod, addPeriods } from "./period.js";
import { occurrencesIn } from "./schedule.js";
import { addObligation, skipObligation, ValidationError } from "./model.js";

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

  // Yükümlülük ödemeleri: ödenen tutar gerçekleşen maliyettir (fatura tutarı plandan farklı olabilir).
  const paidBy = {};
  for (const t of txs) {
    if (t.obligationId) paidBy[t.obligationId] = (paidBy[t.obligationId] || 0) + base(t.amount, t.currency);
  }
  // Kredi kartına bağlı gider kalemleri (taksit, abonelik) karttan kendiliğinden çekilir:
  // "ödendi" işareti beklenmez, açık sayılmaz ve ay kapatmada devredilmez (çift sayım olurdu).
  // Kartın kendisi bankadan ödenir; o ödeme cards bölümünde izlenir.
  const items = occurrencesIn(state, period).map(oc => {
    const planned = base(oc.amount, oc.currency);
    const paid = paidBy[oc.obligationId] || 0;
    const auto = oc.kind !== "income" && state.accounts[oc.accountId]?.type === "credit";
    const settled = paid > 0 || auto;
    return { ...oc, planned, paid, auto, settled, cost: paid > 0 ? paid : planned, open: settled ? 0 : planned };
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

  // Serbest harcamalar (yükümlülüğe bağlı olmayan giderler), kategori bazında.
  const byCategory = {};
  for (const t of txs) {
    if (t.type !== "expense" || t.obligationId) continue;
    const k = t.adjustment ? "_adjustment" : (t.categoryId || "_none");
    byCategory[k] = (byCategory[k] || 0) + base(t.amount, t.currency);
  }
  const spendingTotal = sum(Object.values(byCategory));

  // Kategori bütçesinin henüz harcanmamış kısmı ayrılmış sayılır.
  const budgets = Object.values(state.categories)
    .filter(c => !c.archived && c.budget > 0)
    .map(c => ({ categoryId: c.id, budget: c.budget, spent: byCategory[c.id] || 0, left: Math.max(0, c.budget - (byCategory[c.id] || 0)) }));
  const reserved = sum(budgets.map(b => b.left));

  const obligationsTotal = sum(outItems.map(i => i.cost));
  const obligationsOpen = sum(outItems.map(i => i.open));
  const remaining = incomeTotal - obligationsTotal - spendingTotal;

  // Kredi kartı: önceki dönemde karta yazılan giderler ile karttan otomatik çekilen
  // yükümlülükler (taksit, abonelik) bu dönem ödenir; bu dönem karta yapılan aktarımlar düşülür.
  // (Hesap kesim gününe göre ekstre ayrımı sonraki adımda.)
  const prev = prevPeriod(period);
  const prevTxs = inPeriod(prev);
  const prevLinked = new Set(prevTxs.filter(t => t.obligationId).map(t => t.obligationId));
  const prevOccurrences = occurrencesIn(state, prev).filter(o => o.kind !== "income" && !prevLinked.has(o.obligationId));
  const cards = Object.values(state.accounts).filter(a => a.type === "credit").map(a => {
    const charged = sum(prevTxs.filter(t => t.type === "expense" && t.accountId === a.id).map(t => base(t.amount, t.currency)));
    const automatic = sum(prevOccurrences.filter(o => o.accountId === a.id).map(o => base(o.amount, o.currency)));
    const payments = sum(txs.filter(t => t.type === "transfer" && t.toAccountId === a.id).map(t => base(t.amount, t.currency)));
    const charges = charged + automatic;
    return { accountId: a.id, name: a.name, charges, payments, due: Math.max(0, charges - payments) };
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
