// Taksitler ve gelecek ayların taksit/borç yükü.

import { addObligation, ValidationError } from "./model.js";
import { isMinor, toBase, sum } from "./money.js";
import { periodOf, addPeriods, nextPeriod, isDate } from "./period.js";
import { occurrence, occurrencesIn, lastPeriod } from "./schedule.js";

const LOAD_KINDS = ["installment", "debt"];

// Toplamı eşit taksitlere böler; bölünemeyen kuruş farkı ilk taksite eklenir.
// Taksitlerin toplamı her zaman alışveriş tutarına eşittir.
export function splitInstallments(total, count) {
  if (!isMinor(total) || total <= 0) throw new ValidationError(["toplam tutar sıfırdan büyük tam sayı (kuruş) olmalı"]);
  if (!Number.isInteger(count) || count < 1) throw new ValidationError(["taksit sayısı geçersiz"]);
  const amount = Math.floor(total / count);
  return { amount, firstAmount: total - amount * (count - 1) };
}

// Taksitli alışveriş: ilk taksit alışverişin bütçe dönemine düşer (startPeriod ile değiştirilebilir).
export function addInstallmentPurchase(state, { id, name, total, count, accountId, categoryId = null, date, startPeriod = null }) {
  if (!isDate(date)) throw new ValidationError(["alışveriş tarihi geçersiz"]);
  const { amount, firstAmount } = splitInstallments(total, count);
  return addObligation(state, {
    id,
    kind: "installment",
    name,
    amount,
    firstAmount: firstAmount !== amount ? firstAmount : null,
    currency: state.accounts[accountId]?.currency || "TRY",
    accountId,
    categoryId,
    startPeriod: startPeriod || periodOf(date, state.settings?.payDay || 1),
    count,
    purchase: { date, total }
  });
}

// Belirtilen dönemden SONRA kalan taksitler (adet ve tutar, kalemin para biriminde).
export function remainingAfter(o, period) {
  const end = lastPeriod(o);
  if (!end) return null; // süresiz kalem
  let p = o.startPeriod > period ? o.startPeriod : nextPeriod(period);
  const amounts = [];
  for (; p <= end; p = nextPeriod(p)) {
    const oc = occurrence(o, p);
    if (oc) amounts.push(oc.amount);
  }
  return { count: amounts.length, amount: sum(amounts), lastPeriod: end };
}

// fromPeriod'dan itibaren `count` dönemin taksit + borç yükü (TL).
export function installmentLoad(state, fromPeriod, count, { rates = {} } = {}) {
  const months = Array.from({ length: count }, (_, i) => {
    const period = addPeriods(fromPeriod, i);
    const missing = new Set();
    const items = occurrencesIn(state, period)
      .filter(o => LOAD_KINDS.includes(o.kind))
      .map(o => {
        const tl = toBase(o.amount, o.currency, rates);
        if (tl == null) missing.add(o.currency);
        return { obligationId: o.obligationId, name: o.name, kind: o.kind, index: o.index, total: o.total, accountId: o.accountId, amount: o.amount, currency: o.currency, tl: tl ?? 0 };
      });
    const byAccount = {};
    for (const it of items) byAccount[it.accountId] = (byAccount[it.accountId] || 0) + it.tl;
    return {
      period,
      total: sum(items.map(i => i.tl)),
      byAccount,
      items,
      ending: items.filter(i => i.index === i.total).map(i => i.name),
      missingRates: [...missing].sort()
    };
  });
  return { months, total: sum(months.map(m => m.total)) };
}
