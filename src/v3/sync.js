// v3 bulut eşitlemesinin saf kısmı: Firebase bilmez, testle doğrulanır.
//
// v3 verisi aynı Firebase projesinde, eski uygulamanın verisinden AYRI bir yolda tutulur:
//   families/{familyId}/v3      (eski uygulama: families/{familyId}/data — okunmaz, yazılmaz)
// İki sürüm karşılaştırıldıktan sonra tek yola birleştirilecek (Abdullah, 2026-11-08).
//
// Yazma kayıt kayıttır: yalnız değişen hesap / işlem / kategori yazılır, tüm veri tek parça ezilmez.
// Böylece iki kişi aynı anda farklı kayıtları değiştirse de biri ötekinin değişikliğini silmez.
// Çevrimdışı yapılan değişiklikler "son görülen bulut" (base) ile karşılaştırılarak bulunur ve
// bağlantı gelince buluttaki güncel verinin üzerine uygulanır (üç yönlü birleştirme).

import { emptyState, SCHEMA_VERSION } from "../core/index.js";

export const cloudPath = familyId => `families/${familyId}/v3`;
export const COLLECTIONS = ["accounts", "categories", "transactions", "obligations", "closedPeriods", "merchantLabels", "goals", "carryovers"];

// Realtime Database anahtarlarında . # $ [ ] / kullanılamaz; % ile kaçırılır.
const BAD = /[.#$[\]/%]/g;
export const encodeKey = k => String(k).replace(BAD, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
export const decodeKey = k => String(k).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// Veritabanının sakladığı biçim: null / undefined alanlar, boş nesne ve boş diziler yazılmaz
// (Realtime Database bunları zaten tutmaz). Karşılaştırma bu biçimde yapılır; yoksa her açılışta
// "değişmiş" sanılıp boşuna yazılırdı.
export function clean(v) {
  if (Array.isArray(v)) {
    const a = v.map(clean).filter(x => x !== undefined);
    return a.length ? a : undefined;
  }
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) { const c = clean(x); if (c !== undefined) o[k] = c; }
    return Object.keys(o).length ? o : undefined;
  }
  return v === null || Number.isNaN(v) ? undefined : v;
}

export function toCloud(state) {
  const tree = { schemaVersion: state.schemaVersion, settings: state.settings };
  for (const c of COLLECTIONS) {
    tree[c] = Object.fromEntries(Object.entries(state[c] || {}).map(([k, v]) => [encodeKey(k), v]));
  }
  return clean(tree) || {};
}

const arr = v => Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [];

// Buluttan gelen ağacı uygulama durumuna çevirir; veritabanının düşürdüğü boş alanları geri koyar.
export function fromCloud(tree) {
  const base = emptyState();
  const t = tree || {};
  const state = { ...base, schemaVersion: t.schemaVersion ?? SCHEMA_VERSION, settings: { ...base.settings, ...t.settings } };
  if (t.settings?.cardBudgetModes) state.settings.cardBudgetModes = arr(t.settings.cardBudgetModes);
  if (t.settings?.payMethods) state.settings.payMethods = arr(t.settings.payMethods);
  for (const c of COLLECTIONS) {
    state[c] = Object.fromEntries(Object.entries(t[c] || {}).map(([k, v]) => [decodeKey(k), v]));
  }
  for (const [id, o] of Object.entries(state.obligations)) state.obligations[id] = { ...o, skips: arr(o.skips), changes: arr(o.changes) };
  for (const [id, g] of Object.entries(state.goals)) state.goals[id] = { ...g, accountIds: arr(g.accountIds) };
  for (const [id, a] of Object.entries(state.accounts)) if (a.budgetModes) state.accounts[id] = { ...a, budgetModes: arr(a.budgetModes) };
  for (const [p, s] of Object.entries(state.closedPeriods)) {
    state.closedPeriods[p] = {
      ...s,
      income: { received: 0, expectedOpen: 0, total: 0, ...s.income },
      obligations: { total: 0, open: 0, ...s.obligations, items: arr(s.obligations?.items) },
      spending: { total: 0, ...s.spending, byCategory: s.spending?.byCategory || {} },
      budgets: { reserved: 0, ...s.budgets, items: arr(s.budgets?.items) },
      remaining: s.remaining ?? 0, safeToSpend: s.safeToSpend ?? 0,
      cards: arr(s.cards), missingRates: arr(s.missingRates), decisions: arr(s.decisions), rates: s.rates || {},
      cardBudget: { blocked: 0, load: 0, pending: 0, ...s.cardBudget, cards: arr(s.cardBudget?.cards).map(c => ({
        ...c, blockedItems: arr(c.blockedItems), loadItems: arr(c.loadItems), pendingItems: arr(c.pendingItems), statements: arr(c.statements)
      })) },
      carry: { in: 0, fromSavings: 0, ...s.carry }
    };
  }
  return state;
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a); const kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => deepEqual(a[k], b[k]));
}

// İki ağaç arasındaki kayıt düzeyindeki fark: { "transactions/abc": kayıt | null, "settings": {...} }.
// null silme demektir. Realtime Database update() bu biçimi doğrudan alır.
export function diffTrees(base, next) {
  const a = base || {}; const b = next || {};
  const patch = {};
  for (const k of ["schemaVersion", "settings"]) if (!deepEqual(a[k], b[k])) patch[k] = b[k] ?? null;
  for (const c of COLLECTIONS) {
    const x = a[c] || {}; const y = b[c] || {};
    for (const id of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (!deepEqual(x[id], y[id])) patch[`${c}/${id}`] = y[id] ?? null;
    }
  }
  return patch;
}

export function applyPatch(tree, patch) {
  const out = { ...(tree || {}) };
  for (const [path, value] of Object.entries(patch)) {
    const [c, id] = path.split("/");
    if (id == null) { if (value == null) delete out[c]; else out[c] = value; continue; }
    const col = { ...(out[c] || {}) };
    if (value == null) delete col[id]; else col[id] = value;
    out[c] = col;
  }
  return clean(out) || {};
}

// Buluttan yeni veri geldiğinde ne yapılacağı. Dönüş:
//  { state, pending, needsUpload, keepLocalCopy }
//  - base yoksa (bu cihaz bu aileyle ilk kez eşitleniyor): bulut doluysa bulut geçerlidir, bu cihazdaki
//    v3 verisi kendiliğinden karışmaz (ayrı bir kopya olarak saklanması önerilir: keepLocalCopy).
//    Bulut boşsa ve cihazda veri varsa yükleme kullanıcıya sorulur (needsUpload).
//  - base varsa: cihazda base'den sonra yapılan değişiklikler buluttaki verinin üzerine uygulanır.
export function mergeRemote({ remote, base, local }) {
  const localTree = toCloud(local);
  const hasLocal = COLLECTIONS.some(c => Object.keys(localTree[c] || {}).length);
  if (base == null) {
    if (remote == null) return { state: local, pending: {}, needsUpload: hasLocal, keepLocalCopy: false };
    return { state: fromCloud(remote), pending: {}, needsUpload: false, keepLocalCopy: hasLocal && !deepEqual(clean(remote), localTree) };
  }
  const pending = diffTrees(base, localTree);
  const merged = applyPatch(remote || {}, pending);
  return { state: fromCloud(merged), pending, needsUpload: false, keepLocalCopy: false };
}

// Yerel değişiklik sonrası buluta yazılacak fark (bağlıyken).
export const pendingFor = (base, local) => diffTrees(base || {}, toCloud(local));

// Yeni eklenen işlemlere ekleyen kişiyi yazar (aile listesinde kimin girdiği görünsün).
export function stampCreatedBy(prev, next, userId) {
  if (!userId || prev.transactions === next.transactions) return next;
  let changed = false;
  const txs = { ...next.transactions };
  for (const [id, t] of Object.entries(txs)) {
    if (!prev.transactions[id] && !t.createdBy) { txs[id] = { ...t, createdBy: userId }; changed = true; }
  }
  return changed ? { ...next, transactions: txs } : next;
}
