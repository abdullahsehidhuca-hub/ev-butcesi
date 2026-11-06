// Ev Bütçesi v2 veri modeli.
//
// Eski modelde aynı harcama 7 ayrı listeye dağılıyordu ve aylar bugünkü ayarlardan
// yeniden hesaplanıyordu. Yeni modelde:
//  - Her para hareketi TEK tip kayıttır: transaction (gider / gelir / aktarım).
//  - Tekrarlayan her şey (sabit gider, taksit, borç, maaş) bir obligation'dır;
//    takvimini kendisi üretir. Tutar değişikliği geçmişi değil, belirtilen dönemden
//    sonrasını etkiler (changes listesi).
//  - Kapatılan dönem closedPeriods içinde dondurulur; kur veya ayar değişse de değişmez.
//  - Koleksiyonlar { id: kayıt } biçimindedir; senkronda kayıt kayıt yazılabilir
//    (tüm veriyi tek parça ezmek yerine), iki kişi aynı anda güvenle çalışır.

import { CURRENCIES, isMinor } from "./money.js";
import { isDate, isPeriodKey } from "./period.js";

export const SCHEMA_VERSION = 2;

export const ACCOUNT_TYPES = ["bank", "cash", "credit", "debit"];
export const TX_TYPES = ["expense", "income", "transfer"];
export const OBLIGATION_KINDS = ["fixed", "installment", "debt", "income"];

export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { payDay: 15, defaultAccountId: null },
    accounts: {},
    categories: {},
    transactions: {},
    obligations: {},
    closedPeriods: {}
  };
}

// account: { id, name, type, currency, cutoffDay? (kredi kartı hesap kesim günü),
//   opening?: { date, balance } (bu tarihin BAŞINDAKİ bakiye, kuruş; kartta borç eksi yazılır) }
// category: { id, name, icon?, budget? (aylık, kuruş), archived? }
// transaction: { id, type, date, amount, currency, accountId, toAccountId?, categoryId?,
//   note?, obligationId?, period? (yükümlülüğün hangi dönemine ait olduğu),
//   createdAt, createdBy }
// obligation: { id, kind, name, amount, currency, accountId, categoryId?, startPeriod,
//   count (null = süresiz), dueDay?, skips: [dönem], changes: [{ fromPeriod, amount }],
//   endPeriod? (süresiz kalem sonlandırıldıysa) }

const err = (list, cond, msg) => { if (!cond) list.push(msg); };

export function validateTransaction(state, t) {
  const e = [];
  err(e, typeof t.id === "string" && t.id, "id eksik");
  err(e, TX_TYPES.includes(t.type), "geçersiz işlem türü");
  err(e, isDate(t.date), "geçersiz tarih");
  err(e, isMinor(t.amount) && t.amount > 0, "tutar sıfırdan büyük tam sayı (kuruş) olmalı");
  err(e, CURRENCIES.includes(t.currency), "geçersiz para birimi");
  err(e, !!state.accounts[t.accountId], "hesap bulunamadı");
  err(e, !state.accounts[t.accountId] || state.accounts[t.accountId].currency === t.currency, "işlem para birimi hesabın para birimiyle aynı olmalı");
  if (t.type === "transfer") {
    err(e, !!state.accounts[t.toAccountId], "hedef hesap bulunamadı");
    err(e, t.toAccountId !== t.accountId, "aynı hesaba aktarım yapılamaz");
    err(e, state.accounts[t.toAccountId]?.currency === state.accounts[t.accountId]?.currency, "farklı para birimli hesaplar arası aktarım desteklenmiyor");
  }
  if (t.categoryId != null) err(e, !!state.categories[t.categoryId], "kategori bulunamadı");
  if (t.obligationId != null) {
    err(e, !!state.obligations[t.obligationId], "yükümlülük bulunamadı");
    err(e, isPeriodKey(t.period), "yükümlülük ödemesinde dönem gerekli");
  }
  return e;
}

export function validateObligation(state, o) {
  const e = [];
  err(e, typeof o.id === "string" && o.id, "id eksik");
  err(e, OBLIGATION_KINDS.includes(o.kind), "geçersiz yükümlülük türü");
  err(e, typeof o.name === "string" && o.name.trim(), "ad eksik");
  err(e, isMinor(o.amount) && o.amount > 0, "tutar sıfırdan büyük tam sayı (kuruş) olmalı");
  err(e, CURRENCIES.includes(o.currency), "geçersiz para birimi");
  err(e, !!state.accounts[o.accountId], "hesap bulunamadı");
  err(e, isPeriodKey(o.startPeriod), "başlangıç dönemi geçersiz");
  err(e, o.count == null || (Number.isInteger(o.count) && o.count > 0), "taksit/ödeme adedi geçersiz");
  err(e, (o.kind !== "installment" && o.kind !== "debt") || o.count != null, "taksit ve borçta adet zorunlu");
  err(e, (o.skips || []).every(isPeriodKey), "erteleme dönemi geçersiz");
  err(e, (o.changes || []).every(c => isPeriodKey(c.fromPeriod) && isMinor(c.amount) && c.amount > 0), "tutar değişikliği geçersiz");
  if (o.endPeriod != null) err(e, isPeriodKey(o.endPeriod), "bitiş dönemi geçersiz");
  if (o.firstAmount != null) err(e, isMinor(o.firstAmount) && o.firstAmount > 0, "ilk taksit tutarı geçersiz");
  return e;
}

export class ValidationError extends Error {
  constructor(errors) { super(errors.join("; ")); this.errors = errors; }
}

// Değişmez (immutable) güncelleme: yeni state döner, eskisi bozulmaz.
export function putRecord(state, collection, record) {
  return { ...state, [collection]: { ...state[collection], [record.id]: record } };
}

export function removeRecord(state, collection, id) {
  const next = { ...state[collection] };
  delete next[id];
  return { ...state, [collection]: next };
}

export function validateAccount(a) {
  const e = [];
  err(e, typeof a.id === "string" && a.id, "id eksik");
  err(e, typeof a.name === "string" && a.name.trim(), "ad eksik");
  err(e, ACCOUNT_TYPES.includes(a.type), "geçersiz hesap türü");
  err(e, CURRENCIES.includes(a.currency), "geçersiz para birimi");
  if (a.opening != null) {
    err(e, isDate(a.opening.date), "açılış tarihi geçersiz");
    err(e, isMinor(a.opening.balance), "açılış bakiyesi tam sayı (kuruş) olmalı");
  }
  return e;
}

export function addAccount(state, a) {
  const e = validateAccount(a);
  if (e.length) throw new ValidationError(e);
  return putRecord(state, "accounts", a);
}

export function addTransaction(state, t) {
  const e = validateTransaction(state, t);
  if (e.length) throw new ValidationError(e);
  return putRecord(state, "transactions", t);
}

export function addObligation(state, o) {
  const rec = { skips: [], changes: [], count: null, ...o };
  const e = validateObligation(state, rec);
  if (e.length) throw new ValidationError(e);
  return putRecord(state, "obligations", rec);
}

// Tutarı belirtilen dönemden itibaren değiştir; önceki dönemler etkilenmez.
export function changeObligationAmount(state, id, fromPeriod, amount) {
  const o = state.obligations[id];
  if (!o) throw new ValidationError(["yükümlülük bulunamadı"]);
  const changes = [...(o.changes || []).filter(c => c.fromPeriod !== fromPeriod), { fromPeriod, amount }]
    .sort((a, b) => a.fromPeriod.localeCompare(b.fromPeriod));
  const rec = { ...o, changes };
  const e = validateObligation(state, rec);
  if (e.length) throw new ValidationError(e);
  return putRecord(state, "obligations", rec);
}

// Bir dönemi atla: taksit/borçta ödeme takvimi bir dönem uzar, toplam adet korunur.
export function skipObligation(state, id, period) {
  const o = state.obligations[id];
  if (!o) throw new ValidationError(["yükümlülük bulunamadı"]);
  if ((o.skips || []).includes(period)) return state;
  return putRecord(state, "obligations", { ...o, skips: [...(o.skips || []), period].sort() });
}
