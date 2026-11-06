// Hesap bakiyesi ve banka mutabakatı.
// Hedef: uygulamadaki bakiye = bankadaki bakiye (kuruşu kuruşuna).
// Bakiye yalnızca GERÇEKLEŞMİŞ işlemlerden hesaplanır; planlanan ama ödenmemiş
// yükümlülükler bakiyeyi etkilemez. Her işlem hesabın kendi para birimindedir.

import { sum } from "./money.js";
import { addTransaction, putRecord, ValidationError } from "./model.js";

// İşlemin hesabın bakiyesine etkisi (+ giriş, − çıkış).
export function effectOn(t, accountId) {
  if (t.type === "income" && t.accountId === accountId) return t.amount;
  if (t.type === "expense" && t.accountId === accountId) return -t.amount;
  if (t.type === "transfer") {
    if (t.accountId === accountId) return -t.amount;
    if (t.toAccountId === accountId) return t.amount;
  }
  return 0;
}

const byDate = (a, b) => a.date.localeCompare(b.date) || (a.createdAt || "").localeCompare(b.createdAt || "");

function accountOf(state, accountId) {
  const a = state.accounts[accountId];
  if (!a) throw new ValidationError(["hesap bulunamadı"]);
  return a;
}

// Hesabın hareketleri: açılış tarihinden (dahil) itibaren, isteğe bağlı aralıkla.
export function movementsOf(state, accountId, { after = null, upTo = null } = {}) {
  const a = accountOf(state, accountId);
  const from = a.opening?.date || null;
  return Object.values(state.transactions)
    .filter(t => effectOn(t, accountId) !== 0)
    .filter(t => (!from || t.date >= from) && (!after || t.date > after) && (!upTo || t.date <= upTo))
    .sort(byDate);
}

// asOf gününün SONUNDAKİ bakiye (asOf verilmezse tüm hareketler).
export function balanceOf(state, accountId, asOf = null) {
  const a = accountOf(state, accountId);
  return (a.opening?.balance || 0) + sum(movementsOf(state, accountId, { upTo: asOf }).map(t => effectOn(t, accountId)));
}

// Bankadaki gerçek bakiyeyle karşılaştırır. Fark varsa, son tutan mutabakattan beri
// girilen hareketleri döndürür; eksik/yanlış kayıt bu listede aranır.
export function reconcile(state, accountId, date, actualBalance) {
  const a = accountOf(state, accountId);
  const app = balanceOf(state, accountId, date);
  const lastMatch = (a.reconciliations || []).filter(r => r.date <= date && r.diff === 0).sort(byDate).pop();
  const since = lastMatch?.date || null;
  return {
    accountId,
    date,
    app,
    actual: actualBalance,
    diff: actualBalance - app,
    matched: actualBalance === app,
    since,
    movements: movementsOf(state, accountId, { after: since, upTo: date })
  };
}

// Mutabakat sonucunu hesabın geçmişine kaydeder (ne zaman, ne kadar fark vardı).
export function recordReconciliation(state, result, at = null) {
  const a = accountOf(state, result.accountId);
  const entry = { date: result.date, actual: result.actual, app: result.app, diff: result.diff, at };
  const list = [...(a.reconciliations || []).filter(r => r.date !== result.date), entry].sort(byDate);
  return putRecord(state, "accounts", { ...a, reconciliations: list });
}

// Açıklanamayan farkı görünür bir "bakiye düzeltme" işlemiyle kapatır.
// Gizli bir sıfırlama yapılmaz; düzeltme raporlarda ayrıca görünür.
export function adjustBalance(state, result, { id, now = new Date(), userId = null, note = "Bakiye düzeltme" } = {}) {
  if (result.diff === 0) return { state, transaction: null };
  const a = accountOf(state, result.accountId);
  const t = {
    id,
    type: result.diff > 0 ? "income" : "expense",
    date: result.date,
    amount: Math.abs(result.diff),
    currency: a.currency,
    accountId: a.id,
    categoryId: null,
    note,
    adjustment: true,
    createdAt: now.toISOString(),
    createdBy: userId
  };
  let next = addTransaction(state, t);
  next = recordReconciliation(next, { ...result, app: result.actual, diff: 0 }, now.toISOString());
  return { state: next, transaction: t };
}
