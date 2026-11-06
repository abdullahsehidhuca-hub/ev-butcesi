// Hesap bakiyesi ve banka mutabakatı.
// Hedef: uygulamadaki bakiye = bankadaki bakiye (kuruşu kuruşuna).
// Bakiye yalnızca GERÇEKLEŞMİŞ hareketlerden hesaplanır; planlanan ama ödenmemiş
// yükümlülükler bakiyeyi etkilemez. Her işlem hesabın kendi para birimindedir.
// İstisna: kredi kartına bağlı taksit/abonelikler karttan kendiliğinden çekildiği için
// dönem başında kart bakiyesine "otomatik" hareket olarak yazılır (ekstredeki gibi).

import { sum } from "./money.js";
import { addTransaction, putRecord, ValidationError } from "./model.js";
import { nextPeriod, periodOf, periodRange, today as todayOf } from "./period.js";
import { occurrence } from "./schedule.js";

// İşlemin hesabın bakiyesine etkisi (+ giriş, − çıkış).
export function effectOn(t, accountId) {
  if (t.type === "auto" && t.accountId === accountId) return -t.amount;
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

// Kredi kartında, "ödendi" olarak ayrıca girilmemiş taksit/abonelik çekimleri.
// Çekim tarihi = dönemin ilk günü. Dönüş: işlem benzeri { type: "auto", ... } kayıtları.
function autoCharges(state, a, upTo) {
  if (a.type !== "credit" || !upTo) return [];
  const payDay = state.settings?.payDay || 1;
  const linked = new Set(Object.values(state.transactions).filter(t => t.obligationId).map(t => `${t.obligationId}|${t.period}`));
  const lastPeriod = periodOf(upTo, payDay);
  const out = [];
  for (const o of Object.values(state.obligations)) {
    if (o.accountId !== a.id || o.kind === "income") continue;
    for (let p = o.startPeriod; p <= lastPeriod; p = nextPeriod(p)) {
      const oc = occurrence(o, p, payDay);
      if (!oc || linked.has(`${o.id}|${p}`)) continue;
      const date = periodRange(p, payDay).start;
      if (date > upTo || (a.opening?.date && date < a.opening.date)) continue;
      out.push({ id: `auto:${o.id}:${p}`, type: "auto", date, amount: oc.amount, currency: oc.currency, accountId: a.id, obligationId: o.id, period: p, note: o.name });
    }
  }
  return out;
}

// Hesabın hareketleri: açılış tarihinden (dahil) itibaren, isteğe bağlı aralıkla.
// upTo verilmezse bugüne kadar.
export function movementsOf(state, accountId, { after = null, upTo = null } = {}) {
  const a = accountOf(state, accountId);
  const end = upTo || todayOf();
  const from = a.opening?.date || null;
  return [...Object.values(state.transactions), ...autoCharges(state, a, end)]
    .filter(t => effectOn(t, accountId) !== 0)
    .filter(t => (!from || t.date >= from) && (!after || t.date > after) && t.date <= end)
    .sort(byDate);
}

// asOf gününün SONUNDAKİ bakiye (asOf verilmezse bugün).
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
