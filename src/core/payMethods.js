// Hızlı harcamadaki "Nereden ödendi" seçenekleri ve hesapların bu seçeneklere dağılımı.
//
// Seçenekler aileye göre değişir: biri banka kartıyla konfor kartını ayırmaz, biri yemek kartı (Setcard, Multinet)
// kullanır. Bu yüzden liste settings.payMethods içinde tutulur ve Ayarlar'dan düzenlenir; girilmemişse varsayılan
// liste geçerlidir. Hesap account.payMethod ile bir seçeneğe bağlanır ("none": harcamada gösterilmez). Bağlanmamışsa
// türünün varsayılanına, o seçenek silinmişse ilk seçeneğe düşer; böylece hiçbir hesap seçilemez hâle gelmez.
// payMethod: { id, name, accountType? } — accountType: seçenekte hesap yokken "ekle" ile açılacak hesabın türü.

import { ACCOUNT_TYPES, ValidationError } from "./model.js";

export const DEFAULT_PAY_METHODS = [
  { id: "credit", name: "Kredi kartı", accountType: "credit" },
  { id: "debit", name: "Banka kartı", accountType: "bank" },
  { id: "prepaid", name: "Konfor kartı", accountType: "prepaid" },
  { id: "cash", name: "Nakit", accountType: "cash" }
];
export const HIDDEN_PAY_METHOD = "none";

// Türün varsayılan seçeneği: banka hesabı ve eski banka kartı hesapları "Banka kartı"dır.
const defaultFor = type => ["credit", "prepaid", "cash"].includes(type) ? type : "debit";

export function payMethodsOf(state) {
  const list = state.settings?.payMethods;
  return Array.isArray(list) && list.length ? list : DEFAULT_PAY_METHODS;
}

// Hesabın seçeneği (kimlik): bağlı olduğu, yoksa türünün varsayılanı, o da listede yoksa ilk seçenek.
// Harcamada gösterilmeyecek hesap için null.
export function accountPayMethod(state, account, methods = payMethodsOf(state)) {
  if (!account || account.payMethod === HIDDEN_PAY_METHOD) return null;
  const ids = new Set(methods.map(m => m.id));
  if (account.payMethod && ids.has(account.payMethod)) return account.payMethod;
  const def = defaultFor(account.type);
  return ids.has(def) ? def : methods[0]?.id || null;
}

// Ayarlardan kayıt: seçenek listesi ve hesap → seçenek eşlemesi birlikte doğrulanır.
// assignments: { hesapId: seçenekId | "none" }; listede olmayan hesaplara dokunulmaz.
export function setPayMethods(state, methods, assignments = {}) {
  const e = [];
  if (!Array.isArray(methods) || !methods.length) e.push("en az bir ödeme seçeneği olmalı");
  const ids = new Set();
  const names = new Set();
  for (const m of Array.isArray(methods) ? methods : []) {
    const name = typeof m?.name === "string" ? m.name.trim() : "";
    const key = name.toLocaleLowerCase("tr-TR");
    if (!(typeof m?.id === "string" && m.id) || m.id === HIDDEN_PAY_METHOD || ids.has(m.id)) e.push("seçenek kimliği geçersiz");
    ids.add(m?.id);
    if (!name) e.push("seçenek adı boş olamaz");
    else if (names.has(key)) e.push(`"${name}" iki kez yazılmış`);
    names.add(key);
    if (m?.accountType != null && !ACCOUNT_TYPES.includes(m.accountType)) e.push("geçersiz hesap türü");
  }
  for (const [id, mid] of Object.entries(assignments)) {
    if (!state.accounts[id]) e.push("hesap bulunamadı");
    else if (mid !== HIDDEN_PAY_METHOD && !ids.has(mid)) e.push("hesabın seçeneği listede yok");
  }
  if (e.length) throw new ValidationError([...new Set(e)]);
  const accounts = { ...state.accounts };
  for (const [id, mid] of Object.entries(assignments)) accounts[id] = { ...accounts[id], payMethod: mid };
  const payMethods = methods.map(m => ({ id: m.id, name: m.name.trim(), ...(m.accountType ? { accountType: m.accountType } : {}) }));
  return { ...state, accounts, settings: { ...state.settings, payMethods } };
}
