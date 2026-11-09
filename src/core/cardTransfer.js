// "Karta aktarıldı" bayrağı (ilk hâldeki temel denetim). Kredi kartıyla yapılan her harcama için
// karşılığı bankadan kart hesabına aktarıldığında işlem üzerine cardTransferredAt (YYYY-MM-DD) yazılır.
// Bankadaki tutar uygulamadakiyle tutmadığında ilk bakılan yer, bayrağı eklenmemiş kart harcamalarıdır.

import { ValidationError, putRecord } from "./model.js";
import { isDate } from "./period.js";

const DAY = 86400000;
const utc = d => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };

export const isCardExpense = (state, t) => t?.type === "expense" && state.accounts[t.accountId]?.type === "credit";

// Aktarılmamış kart harcamaları, eskiden yeniye. today verilirse kaç gündür beklediği (days) eklenir.
export function untransferredCardExpenses(state, { today, accountId } = {}) {
  return Object.values(state.transactions)
    .filter(t => isCardExpense(state, t) && !t.cardTransferredAt && (!accountId || t.accountId === accountId))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || "").localeCompare(b.createdAt || ""))
    .map(t => (today ? { ...t, days: Math.max(0, Math.round((utc(today) - utc(t.date)) / DAY)) } : t));
}

// Toplam ve 2+ gündür bekleyenler (ilk hâldeki uyarı eşiği).
export function cardTransferSummary(state, today, { staleDays = 2 } = {}) {
  const list = untransferredCardExpenses(state, { today });
  const stale = list.filter(t => t.days >= staleDays);
  const total = list.reduce((s, t) => s + t.amount, 0);
  return { list, total, stale, staleTotal: stale.reduce((s, t) => s + t.amount, 0) };
}

// Bayrağı koyar (date) ya da kaldırır (date = null). Kapalı dönem kaydı da işaretlenebilir:
// bayrak tutarı, tarihi ya da dönemi değiştirmez, yalnız aktarımın yapıldığını not eder.
export function markCardTransferred(state, ids, date) {
  if (date != null && !isDate(date)) throw new ValidationError(["aktarım tarihi geçersiz"]);
  let next = state;
  for (const id of [].concat(ids)) {
    const t = next.transactions[id];
    if (!t) throw new ValidationError(["işlem bulunamadı"]);
    if (!isCardExpense(next, t)) throw new ValidationError(["yalnız kredi kartı harcaması karta aktarıldı olarak işaretlenir"]);
    const { cardTransferredAt, ...rest } = t;
    next = putRecord(next, "transactions", date ? { ...rest, cardTransferredAt: date } : rest);
  }
  return next;
}
