// Haftalık harçlık, talimat hesabı aktarımı ve bankayla karşılaştırma hatırlatması.
// Harçlık: konfor kartı gibi bir hesaba her hafta aynı gün aynı tutar başka bir hesaptan yüklenir
// (account.allowance = { amount, weekday: 1 Pzt … 7 Paz, fromAccountId, lastDate }). Yükleme gerçek bir
// aktarım kaydıdır; kimliği hesap ve tarihten türetilir, iki cihaz aynı yüklemeyi yazsa da tek kayıt olur.
// lastDate: en son yüklenen gün; silinen yükleme yeniden yazılmaz.

import { sum } from "./money.js";
import { addTransaction, putRecord, ValidationError } from "./model.js";
import { periodOf, periodRange } from "./period.js";
import { occurrencesIn, isAutopay } from "./schedule.js";

const DAY = 86400000;
const toUTC = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const addDays = (d, n) => new Date(toUTC(d) + n * DAY).toISOString().slice(0, 10);
export const isoWeekday = d => ((new Date(toUTC(d)).getUTCDay() + 6) % 7) + 1;
export const allowanceTxId = (accountId, date) => `allow-${accountId}-${date}`;

// Harçlığı tanımlar ya da kaldırır (allowance: null). İlk yükleme bugünden sonraki ilk yükleme günüdür.
export function setAllowance(state, accountId, allowance, today) {
  const a = state.accounts[accountId];
  if (!a) throw new ValidationError(["hesap bulunamadı"]);
  if (!allowance) { const { allowance: _, ...rest } = a; return putRecord(state, "accounts", rest); }
  const e = [];
  if (a.type === "credit") e.push("kredi kartına haftalık yükleme tanımlanamaz");
  if (!(Number.isInteger(allowance.amount) && allowance.amount > 0)) e.push("haftalık tutar sıfırdan büyük olmalı");
  if (!(Number.isInteger(allowance.weekday) && allowance.weekday >= 1 && allowance.weekday <= 7)) e.push("yükleme günü geçersiz");
  const from = state.accounts[allowance.fromAccountId];
  if (!from || from.id === accountId) e.push("yüklemenin yapılacağı hesabı seçin");
  else if (from.currency !== a.currency) e.push("iki hesabın para birimi aynı olmalı");
  if (e.length) throw new ValidationError(e);
  const same = a.allowance && a.allowance.weekday === allowance.weekday;
  const lastDate = same && a.allowance.lastDate ? a.allowance.lastDate : today;
  return putRecord(state, "accounts", { ...a, allowance: { amount: allowance.amount, weekday: allowance.weekday, fromAccountId: allowance.fromAccountId, lastDate } });
}

// Bugüne kadar yapılmamış yüklemeler: lastDate'ten sonra, bugün dahil, yükleme gününe düşen her tarih.
export function dueAllowances(state, today) {
  const out = [];
  for (const a of Object.values(state.accounts)) {
    const al = a.allowance;
    if (!al || a.archived || !state.accounts[al.fromAccountId]) continue;
    for (let d = addDays(al.lastDate || today, 1); d <= today; d = addDays(d, 1)) {
      if (isoWeekday(d) === al.weekday && !state.transactions[allowanceTxId(a.id, d)]) out.push({ accountId: a.id, fromAccountId: al.fromAccountId, amount: al.amount, currency: a.currency, date: d });
    }
  }
  return out;
}

// Bekleyen yüklemeleri aktarım olarak yazar ve lastDate'i bugüne çeker. Yükleme yoksa durum aynen döner.
export function applyAllowances(state, today, { now = new Date(), userId = null } = {}) {
  let next = state;
  const touched = new Set();
  for (const d of dueAllowances(state, today)) {
    touched.add(d.accountId);
    try {
      next = addTransaction(next, {
        id: allowanceTxId(d.accountId, d.date), type: "transfer", date: d.date, amount: d.amount, currency: d.currency,
        accountId: d.fromAccountId, toAccountId: d.accountId, note: "Haftalık yükleme", allowance: true,
        createdAt: now.toISOString(), createdBy: userId
      });
    } catch (e) {
      // Kapanmış döneme düşen eski yükleme yazılmaz (dönem rakamı değişmesin); diğer hatalar iletilir.
      if (!(e instanceof ValidationError) || !String(e.errors).includes("kapal")) throw e;
    }
  }
  for (const id of touched) {
    const a = next.accounts[id];
    next = putRecord(next, "accounts", { ...a, allowance: { ...a.allowance, lastDate: today } });
  }
  return next;
}

// Sonraki yükleme günü (bugünden sonra).
export function nextAllowanceDate(a, today) {
  if (!a.allowance) return null;
  let d = addDays(today, 1);
  while (isoWeekday(d) !== a.allowance.weekday) d = addDays(d, 1);
  return d;
}

// Talimat hesabı: talimatlı ödemeleri ana hesaptan farklı bir hesaptan çekilen her hesap için bu dönem gereken
// tutar ve dönem içinde o hesaba yapılmış aktarımlar. Eksik varsa "aktarılsın mı" sorulur.
// settings.fundingSkips: kullanıcının "bu dönem aktarmayacağım" dediği "hesap|dönem" anahtarları.
export function fundingNeeds(state, today, mainId) {
  const payDay = state.settings?.payDay || 1;
  const period = periodOf(today, payDay);
  const { start, end } = periodRange(period, payDay);
  const skips = new Set(state.settings?.fundingSkips || []);
  const byAcc = {};
  for (const oc of occurrencesIn(state, period)) {
    const a = state.accounts[oc.accountId];
    if (!a || a.type === "credit" || a.id === mainId || !isAutopay(state.obligations[oc.obligationId], period)) continue;
    if (oc.currency !== a.currency) continue;
    byAcc[a.id] = (byAcc[a.id] || 0) + oc.amount;
  }
  return Object.entries(byAcc).map(([accountId, need]) => {
    const funded = sum(Object.values(state.transactions)
      .filter(t => t.type === "transfer" && t.toAccountId === accountId && t.date >= start && t.date <= end).map(t => t.amount));
    return { accountId, name: state.accounts[accountId].name, period, need, funded, amount: need - funded, key: `${accountId}|${period}` };
  }).filter(n => n.amount > 0 && !skips.has(n.key));
}

// Bankayla karşılaştırma hatırlatması: kart dışı, arşivlenmemiş hesaplardan son karşılaştırması (yoksa açılışı)
// "every" günden eski olanlar. settings.reconcileSnooze: bu tarihe kadar hatırlatılmaz.
export function reconcileDue(state, today, every = 7) {
  if (state.settings?.reconcileSnooze && state.settings.reconcileSnooze > today) return [];
  return Object.values(state.accounts)
    .filter(a => a.type !== "credit" && !a.archived && a.opening?.date)
    .map(a => {
      const last = (a.reconciliations || []).map(r => r.date).sort().at(-1) || a.opening.date;
      return { accountId: a.id, name: a.name, last, days: Math.round((toUTC(today) - toUTC(last)) / DAY) };
    })
    .filter(a => a.days >= every)
    .sort((a, b) => b.days - a.days);
}
