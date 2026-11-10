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
import { isDate, isPeriodKey, periodOf } from "./period.js";

export const SCHEMA_VERSION = 2;

export const ACCOUNT_TYPES = ["bank", "cash", "credit", "debit"];
// refund: iade — harcamanın kategorisinden düşer, para hesaba geri girer.
// exchange: farklı para birimli hesaplar arası alım-satım (TL ile döviz/altın alma, birikimi bozdurma).
//   accountId'den amount (kendi biriminde) çıkar, toAccountId'ye toAmount (onun biriminde) girer.
//   Gelir ya da gider değildir; bütçeyi yalnız toBudget işaretliyse (birikimden serbest tutara) etkiler.
export const TX_TYPES = ["expense", "income", "transfer", "refund", "exchange"];
export const OBLIGATION_KINDS = ["fixed", "installment", "debt", "income"];

export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { payDay: 15, defaultAccountId: null },
    accounts: {},
    categories: {},
    transactions: {},
    obligations: {},
    closedPeriods: {},
    merchantLabels: {},
    goals: {},
    carryovers: {}
  };
}

// account: { id, name, type, currency, cutoffDay? (kredi kartı hesap kesim günü),
//   opening?: { date, balance } (bu tarihin BAŞINDAKİ bakiye, kuruş; kartta borç eksi yazılır) }
// category: { id, name, icon?, budget? (aylık, kuruş), keywords? (etiketleme), archived? }
// goal: birikim hedefi / acil durum fonu (src/core/savings.js)
// carryovers: { dönem: devreden kararı } (src/core/carryover.js)
// merchantLabels: { satıcı anahtarı: categoryId } — kullanıcı düzeltmelerinden öğrenilir
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
  if (t.type === "exchange") {
    const to = state.accounts[t.toAccountId];
    err(e, !!to, "hedef hesap bulunamadı");
    err(e, !to || to.currency !== state.accounts[t.accountId]?.currency, "aynı para birimli hesaplar arasında aktarım kullanın");
    err(e, !to || to.type !== "credit", "kredi kartına döviz/altın aktarılamaz");
    err(e, isMinor(t.toAmount) && t.toAmount > 0, "alınan miktar sıfırdan büyük olmalı");
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
  if (o.categoryId != null) err(e, !!state.categories[o.categoryId], "kategori bulunamadı");
  if (o.dueDay != null) err(e, Number.isInteger(o.dueDay) && o.dueDay >= 1 && o.dueDay <= 31, "son ödeme günü 1-31 arası olmalı");
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

// Kapalı döneme yeni kayıt eklenmez: dönemin rakamları dondurulduğu için kayıt hiçbir yere yansımazdı.
export function addTransaction(state, t, { allowClosed = false } = {}) {
  const e = validateTransaction(state, t);
  if (!e.length) guardClosedTx(state, t, allowClosed);
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

// ── Düzenleme ve silme ──────────────────────────────────────────────────────────
// Tüm ekranlar aynı kayıtlardan hesaplandığı için bir düzenleme her ekrana kendiliğinden
// yansır (ayrı kopya yok). Kapalı döneme dokunan düzenleme engellenir; kullanımdaki
// kategori/hesap/yükümlülük silinemez (raporlarda sahipsiz kayıt kalmasın), arşivlenir.

const payDayOf = state => state.settings?.payDay || 1;
const periodOfTx = (state, t) => t.period || periodOf(t.date, payDayOf(state));

function guardClosedTx(state, t, allowClosed) {
  const p = periodOfTx(state, t);
  if (!allowClosed && state.closedPeriods?.[p]) throw new ValidationError([`${p} dönemi kapalı; kayıt değiştirilemez`]);
}

// İşlemin dönemi oluşturulurken sabitlenir; maaş günü sonradan değişse de işlem ay değiştirmez.
export function stampPeriod(state, t) {
  return t.period ? t : { ...t, period: periodOf(t.date, payDayOf(state)) };
}

export function updateTransaction(state, id, changes, { allowClosed = false } = {}) {
  const old = state.transactions[id];
  if (!old) throw new ValidationError(["işlem bulunamadı"]);
  guardClosedTx(state, old, allowClosed);
  let next = { ...old, ...changes, id };
  // Tarih değiştiyse (yükümlülük ödemesi değilse) dönem yeni tarihe göre yeniden belirlenir.
  if (changes.date && !next.obligationId && !changes.period) next = { ...next, period: periodOf(next.date, payDayOf(state)) };
  guardClosedTx(state, next, allowClosed);
  const e = validateTransaction(state, next);
  if (e.length) throw new ValidationError(e);
  return putRecord(state, "transactions", next);
}

// Devreden kararıyla oluşan kayıt (carryover) tek başına silinmez; karar geri alınınca silinir
// (src/core/carryover.js undoCarryover). Yoksa karar kaydı sahipsiz kalırdı.
export function deleteTransaction(state, id, { allowClosed = false, allowCarryover = false } = {}) {
  const old = state.transactions[id];
  if (!old) return state;
  guardClosedTx(state, old, allowClosed);
  if (old.carryover && !allowCarryover) throw new ValidationError(["bu kayıt devreden kararıyla oluştu; silmek için devreden kararını geri alın"]);
  return removeRecord(state, "transactions", id);
}

const txs = state => Object.values(state.transactions);

export function archiveCategory(state, id, archived = true) {
  const c = state.categories[id];
  if (!c) throw new ValidationError(["kategori bulunamadı"]);
  return putRecord(state, "categories", { ...c, archived });
}

export function deleteCategory(state, id) {
  const used = txs(state).some(t => t.categoryId === id) || Object.values(state.obligations).some(o => o.categoryId === id);
  if (used) throw new ValidationError(["kategori kullanımda; silmek yerine arşivleyin"]);
  const labels = Object.fromEntries(Object.entries(state.merchantLabels || {}).filter(([, c]) => c !== id));
  return { ...removeRecord(state, "categories", id), merchantLabels: labels };
}

export function deleteAccount(state, id) {
  const used = txs(state).some(t => t.accountId === id || t.toAccountId === id) || Object.values(state.obligations).some(o => o.accountId === id);
  if (used) throw new ValidationError(["hesapta kayıt var; silinemez"]);
  return removeRecord(state, "accounts", id);
}

// Ödemesi girilmiş yükümlülük silinmez; sonlandırılır (geçmiş korunur).
export function deleteObligation(state, id, { allowCarryover = false } = {}) {
  if (txs(state).some(t => t.obligationId === id)) throw new ValidationError(["ödemesi girilmiş kalem silinemez; sonlandırın"]);
  if (state.obligations[id]?.carriedFrom?.carryover && !allowCarryover) throw new ValidationError(["bu borç devreden kararıyla oluştu; silmek için devreden kararını geri alın"]);
  return removeRecord(state, "obligations", id);
}

// Süresiz ya da taksitli kalemi belirtilen dönemden SONRA bitirir (o dönem dahil son ödeme).
export function endObligation(state, id, lastPeriod) {
  const o = state.obligations[id];
  if (!o) throw new ValidationError(["yükümlülük bulunamadı"]);
  if (!isPeriodKey(lastPeriod)) throw new ValidationError(["bitiş dönemi geçersiz"]);
  return putRecord(state, "obligations", { ...o, endPeriod: lastPeriod });
}

// Maaş günü değişikliği yalnız yeni işlemleri etkiler; eski işlemlerin dönemi damgalıdır.
export function setPayDay(state, payDay) {
  if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) throw new ValidationError(["maaş günü 1-31 arası olmalı"]);
  const stamped = Object.fromEntries(Object.entries(state.transactions).map(([id, t]) => [id, stampPeriod(state, t)]));
  return { ...state, transactions: stamped, settings: { ...state.settings, payDay } };
}

// Bir dönemi atla: taksit/borçta ödeme takvimi bir dönem uzar, toplam adet korunur.
export function skipObligation(state, id, period) {
  const o = state.obligations[id];
  if (!o) throw new ValidationError(["yükümlülük bulunamadı"]);
  if ((o.skips || []).includes(period)) return state;
  return putRecord(state, "obligations", { ...o, skips: [...(o.skips || []), period].sort() });
}
