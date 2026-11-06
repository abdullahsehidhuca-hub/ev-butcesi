// Yükümlülük takvimi: bir sabit gider / taksit / borç / maaş hangi dönemde, kaçıncı
// ödeme olarak, ne tutarla düşer?

import { dateInPeriod, nextPeriod, periodDistance } from "./period.js";

// Dönemde geçerli tutar: son değişiklik (fromPeriod <= dönem) yoksa ana tutar.
export function amountFor(o, period) {
  let amount = o.amount;
  for (const c of o.changes || []) if (c.fromPeriod <= period) amount = c.amount;
  return amount;
}

// Dönemdeki ödeme; yoksa null. index 1'den başlar.
// firstAmount: taksitte bölünmeden kalan kuruş farkı ilk taksite eklenir.
export function occurrence(o, period, payDay = 1) {
  if (period < o.startPeriod) return null;
  if (o.endPeriod && period > o.endPeriod) return null;
  const skips = o.skips || [];
  if (skips.includes(period)) return null;
  const skippedBefore = skips.filter(s => s >= o.startPeriod && s < period).length;
  const index = periodDistance(o.startPeriod, period) - skippedBefore + 1;
  if (o.count != null && index > o.count) return null;
  return {
    obligationId: o.id,
    kind: o.kind,
    name: o.name,
    period,
    index,
    total: o.count ?? null,
    amount: index === 1 && o.firstAmount ? o.firstAmount : amountFor(o, period),
    currency: o.currency,
    accountId: o.accountId,
    categoryId: o.categoryId ?? null,
    dueDate: o.dueDay ? dateInPeriod(period, o.dueDay, payDay) : null
  };
}

export function occurrencesIn(state, period) {
  const payDay = state.settings?.payDay || 1;
  return Object.values(state.obligations)
    .map(o => occurrence(o, period, payDay))
    .filter(Boolean)
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "") || a.name.localeCompare(b.name, "tr"));
}

// Son ödemenin düştüğü dönem (süresiz kalemde bitiş dönemi ya da null).
// Her erteleme kuyruğu bir dönem uzatır.
export function lastPeriod(o) {
  if (o.count == null) return o.endPeriod || null;
  const skips = new Set(o.skips || []);
  let period = o.startPeriod;
  let paid = 0;
  for (let guard = 0; guard < o.count + skips.size; guard++) {
    if (!skips.has(period)) { paid++; if (paid === o.count) return period; }
    period = nextPeriod(period);
  }
  return null;
}
