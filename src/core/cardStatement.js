// Kredi kartı ekstresi: hesap kesim gününe (cutoffDay) göre hangi harcamanın hangi ekstreye
// girdiği ve o ekstrenin hangi bütçe döneminde ödeneceği.
//
// Ekstre penceresi: önceki kesim gününün ertesi günü – kesim günü (ikisi dahil).
// Son ödeme tarihi: hesapta paymentDay varsa kesimden sonraki ilk o gün, yoksa kesim + 10 gün.
// Bir bütçe dönemi, son ödeme tarihi o döneme düşen ekstreleri öder.
// cutoffDay girilmemiş kartta eski kural geçerlidir (önceki dönemin harcamaları bu dönem ödenir).

import { daysInMonth, periodOf, periodRange, nextPeriod } from "./period.js";
import { occurrence } from "./schedule.js";

const pad = n => String(n).padStart(2, "0");
const dayOf = (y, m, day) => `${y}-${pad(m)}-${pad(Math.min(Math.max(1, day), daysInMonth(y, m)))}`;
const shiftMonth = (y, m, n) => { const t = y * 12 + (m - 1) + n; return [Math.floor(t / 12), (t % 12) + 1]; };
function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const DEFAULT_PAYMENT_GAP_DAYS = 10;

// Kesim tarihinden sonra gelen son ödeme tarihi.
export function statementDueDate(account, cutoff) {
  if (!account.paymentDay) return addDays(cutoff, DEFAULT_PAYMENT_GAP_DAYS);
  const [y, m] = cutoff.split("-").map(Number);
  const same = dayOf(y, m, account.paymentDay);
  if (same > cutoff) return same;
  const [ny, nm] = shiftMonth(y, m, 1);
  return dayOf(ny, nm, account.paymentDay);
}

// Dönemde ödenecek ekstreler: [{ cutoff, from, to, dueDate }] (genelde bir tane).
export function statementsDueIn(account, period, payDay = 1) {
  if (!account?.cutoffDay) return [];
  const range = periodRange(period, payDay);
  const [py, pm] = period.split("-").map(Number);
  const out = [];
  for (let i = -2; i <= 1; i++) {
    const [y, m] = shiftMonth(py, pm, i);
    const cutoff = dayOf(y, m, account.cutoffDay);
    const dueDate = statementDueDate(account, cutoff);
    if (dueDate < range.start || dueDate > range.end) continue;
    const [ly, lm] = shiftMonth(y, m, -1);
    out.push({ cutoff, from: addDays(dayOf(ly, lm, account.cutoffDay), 1), to: cutoff, dueDate });
  }
  return out;
}

// Tarihin girdiği ekstrenin kesim tarihi.
export function statementCutoffFor(account, date) {
  const [y, m] = date.split("-").map(Number);
  const cutoff = dayOf(y, m, account.cutoffDay);
  if (date <= cutoff) return cutoff;
  const [ny, nm] = shiftMonth(y, m, 1);
  return dayOf(ny, nm, account.cutoffDay);
}

// Ekstre penceresindeki kart borcu: harcamalar − iadeler + karttan kendiliğinden çekilen
// taksit/abonelikler ("ödendi" olarak ayrıca girilmemişse; çekim tarihi = dönemin ilk günü).
// base: (tutar, para birimi) → TL.
export function statementCharges(state, account, { from, to }, base = a => a) {
  const payDay = state.settings?.payDay || 1;
  const all = Object.values(state.transactions);
  const inWindow = t => t.accountId === account.id && t.date >= from && t.date <= to;
  const expenses = all.filter(t => t.type === "expense" && inWindow(t)).reduce((s, t) => s + base(t.amount, t.currency), 0);
  const refunds = all.filter(t => t.type === "refund" && inWindow(t)).reduce((s, t) => s + base(t.amount, t.currency), 0);
  const linked = new Set(all.filter(t => t.obligationId).map(t => `${t.obligationId}|${t.period}`));
  let automatic = 0;
  const last = periodOf(to, payDay);
  for (const o of Object.values(state.obligations)) {
    if (o.accountId !== account.id || o.kind === "income") continue;
    for (let p = periodOf(from, payDay); p <= last; p = nextPeriod(p)) {
      const date = periodRange(p, payDay).start;
      if (date < from || date > to || linked.has(`${o.id}|${p}`)) continue;
      const oc = occurrence(o, p, payDay);
      if (oc) automatic += base(oc.amount, oc.currency);
    }
  }
  return { expenses, refunds, automatic, total: expenses - refunds + automatic };
}
