// Birikim, döviz/altın varlıkları ve hedefler.
//
// Varlık = kredi kartı dışındaki her hesap (banka, nakit, döviz, altın). Bakiye hesabın kendi para
// biriminde tutulur (altın: 1/100 gram); TL karşılığı kullanıcının girdiği kurla hesaplanır.
// Kur eksikse o varlık sessizce sıfır sayılmaz, eksik kur raporlanır.
// Kurlar settings.rates içinde tutulur ({ USD: 34.2, EUR: 37.1, XAU: 2950 } → 1 birimin TL karşılığı);
// kapanmış dönemler kendi kurlarını dondurduğu için kur değişikliği geçmişi etkilemez.
//
// goal: { id, name, target (TL kuruş), accountIds: [hesap], targetDate? ("YYYY-MM-DD"),
//   kind?: "emergency" (acil durum fonu) | "saving", archived? }
// Hedefe biriken tutar = bağlı hesapların bugünkü bakiyelerinin TL toplamı.

import { CURRENCIES, BASE, toBase, sum } from "./money.js";
import { isDate, periodOf, periodDistance } from "./period.js";
import { putRecord, removeRecord, ValidationError } from "./model.js";
import { balanceOf } from "./accounts.js";
import { occurrencesIn } from "./schedule.js";

export const GOAL_KINDS = ["saving", "emergency"];

export const ratesOf = state => ({ ...(state.settings?.rates || {}) });

// Kur girişi: yalnız bilinen yabancı para birimleri, sıfırdan büyük sayı. null/"" kuru siler.
export function setRates(state, rates) {
  const next = ratesOf(state);
  const e = [];
  for (const [cur, v] of Object.entries(rates || {})) {
    if (!CURRENCIES.includes(cur) || cur === BASE) { e.push(`geçersiz para birimi: ${cur}`); continue; }
    if (v == null || v === "") { delete next[cur]; continue; }
    const n = Number(v);
    if (!(Number.isFinite(n) && n > 0)) { e.push(`${cur} kuru sıfırdan büyük olmalı`); continue; }
    next[cur] = n;
  }
  if (e.length) throw new ValidationError(e);
  return { ...state, settings: { ...state.settings, rates: next } };
}

// Varlıklar: her hesap kendi para biriminde ve TL karşılığıyla; toplam yalnız kuru bilinenlerden.
export function assetsSummary(state, asOf, { rates = ratesOf(state) } = {}) {
  const missing = new Set();
  const list = Object.values(state.accounts)
    .filter(a => a.type !== "credit" && !a.archived)
    .map(a => {
      const balance = balanceOf(state, a.id, asOf);
      const tl = toBase(balance, a.currency, rates);
      if (tl == null) missing.add(a.currency);
      return { accountId: a.id, name: a.name, type: a.type, currency: a.currency, balance, tl };
    });
  const byCurrency = {};
  for (const x of list) byCurrency[x.currency] = (byCurrency[x.currency] || 0) + x.balance;
  return { list, byCurrency, totalTL: sum(list.map(x => x.tl || 0)), missingRates: [...missing].sort() };
}

export function validateGoal(state, g) {
  const e = [];
  if (!(typeof g.id === "string" && g.id)) e.push("id eksik");
  if (!(typeof g.name === "string" && g.name.trim())) e.push("ad eksik");
  if (!(Number.isSafeInteger(g.target) && g.target > 0)) e.push("hedef tutar sıfırdan büyük tam sayı (kuruş) olmalı");
  if (g.kind != null && !GOAL_KINDS.includes(g.kind)) e.push("geçersiz hedef türü");
  if (!Array.isArray(g.accountIds)) e.push("hedefe bağlı hesap listesi gerekli");
  else for (const id of g.accountIds) {
    const a = state.accounts[id];
    if (!a) e.push("hesap bulunamadı");
    else if (a.type === "credit") e.push("kredi kartı birikim hesabı olamaz");
  }
  if (g.targetDate != null && !isDate(g.targetDate)) e.push("hedef tarihi geçersiz");
  return e;
}

export function addGoal(state, g) {
  const rec = { kind: "saving", accountIds: [], ...g };
  const e = validateGoal(state, rec);
  if (e.length) throw new ValidationError(e);
  return putRecord({ ...state, goals: state.goals || {} }, "goals", rec);
}

export function updateGoal(state, id, changes) {
  const old = state.goals?.[id];
  if (!old) throw new ValidationError(["hedef bulunamadı"]);
  return addGoal(state, { ...old, ...changes, id });
}

export function deleteGoal(state, id) {
  if (!state.goals?.[id]) return state;
  return removeRecord(state, "goals", id);
}

// Hedef ilerlemesi. monthlyNeeded: hedef tarihine kadar her dönem ayrılması gereken tutar
// (bugünün dönemi dahil, hedef tarihinin dönemi dahil).
export function goalProgress(state, id, asOf, { rates = ratesOf(state) } = {}) {
  const g = state.goals?.[id];
  if (!g) throw new ValidationError(["hedef bulunamadı"]);
  const missing = new Set();
  let saved = 0;
  for (const accId of g.accountIds) {
    const a = state.accounts[accId];
    if (!a) continue;
    const tl = toBase(balanceOf(state, accId, asOf), a.currency, rates);
    if (tl == null) missing.add(a.currency); else saved += tl;
  }
  const left = Math.max(0, g.target - saved);
  let periodsLeft = null, monthlyNeeded = null;
  if (g.targetDate) {
    const payDay = state.settings?.payDay || 1;
    periodsLeft = Math.max(1, periodDistance(periodOf(asOf, payDay), periodOf(g.targetDate, payDay)) + 1);
    monthlyNeeded = g.targetDate < asOf ? left : Math.ceil(left / periodsLeft);
  }
  return {
    goalId: g.id, name: g.name, kind: g.kind || "saving", target: g.target, saved, left,
    percent: Math.min(100, Math.floor((saved * 100) / g.target)), reached: saved >= g.target,
    periodsLeft, monthlyNeeded, overdue: !!g.targetDate && g.targetDate < asOf && saved < g.target,
    missingRates: [...missing].sort()
  };
}

// Acil durum fonu önerisi: aylık zorunlu giderler (yükümlülükler + kategori bütçeleri) × ay sayısı.
export function emergencyFundTarget(state, period, { months = 6, rates = ratesOf(state) } = {}) {
  const missing = new Set();
  const obligations = sum(occurrencesIn(state, period).filter(o => o.kind !== "income").map(o => {
    const v = toBase(o.amount, o.currency, rates);
    if (v == null) { missing.add(o.currency); return 0; }
    return v;
  }));
  const budgets = sum(Object.values(state.categories).filter(c => !c.archived && c.budget > 0).map(c => c.budget));
  const monthly = obligations + budgets;
  return { months, monthly, target: monthly * months, missingRates: [...missing].sort() };
}
