// Az dokunuşla veri girişi.
// Hedef: "tutar yaz → kategoriye dokun" (2 adım). Hesap, tarih ve para birimi
// geçmiş kullanımdan doldurulur. favorites() ana ekran kısayolları ve ileride
// telefon widget'ı için aynı listeyi üretir.

import { addTransaction, ValidationError } from "./model.js";
import { isClosed } from "./engine.js";
import { periodOf, today as todayOf } from "./period.js";
import { occurrence } from "./schedule.js";

const payDayOf = state => state.settings?.payDay || 1;
const freeExpense = t => t.type === "expense" && !t.obligationId;
const newest = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || "");

// Kategori için son kullanılan hesap; yoksa varsayılan hesap; o da yoksa ilk hesap.
export function defaultAccountFor(state, categoryId) {
  if (categoryId) {
    const last = Object.values(state.transactions).filter(t => freeExpense(t) && t.categoryId === categoryId).sort(newest)[0];
    if (last && state.accounts[last.accountId]) return last.accountId;
  }
  const def = state.settings?.defaultAccountId;
  if (def && state.accounts[def]) return def;
  return Object.keys(state.accounts)[0] || null;
}

// Son `days` günde en sık kullanılan kategoriler, son tutar ve hesapla birlikte.
export function favorites(state, { now = new Date(), days = 90, limit = 6 } = {}) {
  const since = todayOf(new Date(now.getTime() - days * 86400000));
  const groups = {};
  for (const t of Object.values(state.transactions)) {
    if (!freeExpense(t) || !t.categoryId || t.date < since || !state.categories[t.categoryId]) continue;
    (groups[t.categoryId] ||= []).push(t);
  }
  return Object.entries(groups)
    .map(([categoryId, list]) => {
      const last = list.sort(newest)[0];
      const c = state.categories[categoryId];
      return { categoryId, name: c.name, icon: c.icon || null, accountId: last.accountId, lastAmount: last.amount, currency: last.currency, count: list.length, lastDate: last.date };
    })
    .filter(f => !state.categories[f.categoryId].archived)
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit);
}

function guardClosed(state, period, allowClosed) {
  if (!allowClosed && isClosed(state, period)) throw new ValidationError([`${period} dönemi kapalı; kayıt eklenemez`]);
}

// ctx: { id, now, userId, allowClosed } — kimlik ve saat dışarıdan verilir (test edilebilirlik).
export function quickAdd(state, input, { id, now = new Date(), userId = null, allowClosed = false } = {}) {
  const date = input.date || todayOf(now);
  const accountId = input.accountId || defaultAccountFor(state, input.categoryId);
  const t = {
    id,
    type: input.type || "expense",
    date,
    amount: input.amount,
    currency: input.currency || state.accounts[accountId]?.currency || "TRY",
    accountId,
    categoryId: input.categoryId ?? null,
    note: input.note || "",
    createdAt: now.toISOString(),
    createdBy: userId
  };
  if (t.type === "transfer") t.toAccountId = input.toAccountId;
  guardClosed(state, periodOf(date, payDayOf(state)), allowClosed);
  return { state: addTransaction(state, t), transaction: t };
}

// Tek dokunuşla "ödendi" (gelir kaleminde "alındı"): planlanan tutarla bağlı işlem oluşturur.
// Fatura gibi değişken tutarlarda input.amount ile gerçek tutar verilir.
export function payObligation(state, obligationId, period, input = {}, { id, now = new Date(), userId = null, allowClosed = false } = {}) {
  const o = state.obligations[obligationId];
  if (!o) throw new ValidationError(["yükümlülük bulunamadı"]);
  const oc = occurrence(o, period, payDayOf(state));
  if (!oc) throw new ValidationError([`${o.name} için ${period} döneminde ödeme yok`]);
  guardClosed(state, period, allowClosed);
  const t = {
    id,
    type: o.kind === "income" ? "income" : "expense",
    date: input.date || todayOf(now),
    amount: input.amount ?? oc.amount,
    currency: oc.currency,
    accountId: input.accountId || o.accountId,
    categoryId: o.categoryId ?? null,
    note: input.note || "",
    obligationId,
    period,
    createdAt: now.toISOString(),
    createdBy: userId
  };
  return { state: addTransaction(state, t), transaction: t };
}
