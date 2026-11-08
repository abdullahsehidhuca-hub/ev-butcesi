// v3 verisi bu cihazda (localStorage) ayrı bir anahtarda saklanır. Eski uygulamanın
// verisi okunmaz ve değiştirilmez (eski veriler aktarılmayacak — Abdullah, 2026-11-06).
// Bulut senkronu (kayıt kayıt, aile paylaşımı) sonraki adımdır.

import { emptyState, SCHEMA_VERSION } from "../core/index.js";

export const STORAGE_KEY = "evButcesi.v3.state";
// Yalnız geliştirmede açılan örnek veri modu (/v3?ornek) gerçek veriden ayrı anahtarlara yazar.
export const SAMPLE_KEY = "evButcesi.v3.ornek.state";
export const SAMPLE_PLAN_KEY = "evButcesi.v3.ornek.plan";

const storageOf = storage => storage ?? globalThis.localStorage;

// Dönüş: { state, error } — error: null | "load". Okunamayan veri silinmez;
// üzerine yazılmadan önce ".bozuk" ekli anahtara kopyalanır.
export function loadState(storage, key = STORAGE_KEY) {
  const s = storageOf(storage);
  let raw = null;
  try {
    raw = s?.getItem(key) ?? null;
    if (!raw) return { state: emptyState(), error: null };
    const data = JSON.parse(raw);
    if (data?.schemaVersion !== SCHEMA_VERSION) throw new Error("şema sürümü uyumsuz");
    return { state: { ...emptyState(), ...data, settings: { ...emptyState().settings, ...data.settings } }, error: null };
  } catch {
    try { if (raw) s?.setItem(`${key}.bozuk`, raw); } catch { /* yedek de yazılamadı */ }
    return { state: emptyState(), error: "load" };
  }
}

// Başarılıysa true; depolama kapalı ya da doluysa false.
export function saveState(state, storage, key = STORAGE_KEY) {
  try {
    storageOf(storage).setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState(storage) {
  try { storageOf(storage).removeItem(STORAGE_KEY); return true; } catch { return false; }
}

export function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// Arayüz tercihleri motor verisinden ayrı tutulur: "Çöz" penceresindeki erteleme / bölme
// planları (yalnız bakiye akışı tahminini değiştirir) ve görünüm teması.
export const PLAN_KEY = "evButcesi.v3.plan";
export const THEME_KEY = "evButcesi.v3.tema";
// Yedek hatırlatması: son yedeğin ve "yarın hatırlat" ertelemesinin tarihi { last, snooze }.
export const BACKUP_KEY = "evButcesi.v3.yedek";
// Bulut eşitlemesi: son görülen bulut verisi (çevrimdışı değişiklikleri bulmak için) ve aileye ilk
// bağlanırken bulut dolu olduğu için yerine geçilen bu cihazdaki v3 verisinin kopyası.
export const CLOUD_BASE_KEY = "evButcesi.v3.bulut";
export const LOCAL_COPY_KEY = "evButcesi.v3.yerelKopya";

export function loadPref(key, fallback, storage) {
  try { const raw = storageOf(storage)?.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

export function savePref(key, value, storage) {
  try { storageOf(storage).setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// Yedek: tüm v3 verisi tek JSON dosyası. Geri yüklemede şema sürümü ve ana bölümler denetlenir;
// geçersiz dosya mevcut veriye dokunmadan hata verir.
export function exportBackup(state, { now = new Date() } = {}) {
  return JSON.stringify({ app: "ev-butcesi-v3", exportedAt: now.toISOString(), state }, null, 2);
}

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Dosya okunamadı: geçerli bir yedek değil."); }
  const s = data?.app === "ev-butcesi-v3" ? data.state : null;
  if (!s) throw new Error("Bu dosya Ev Bütçesi v3 yedeği değil.");
  if (s.schemaVersion !== SCHEMA_VERSION) throw new Error("Yedek farklı bir sürümden; geri yüklenemez.");
  for (const k of ["accounts", "categories", "obligations", "transactions"]) {
    if (!s[k] || typeof s[k] !== "object" || Array.isArray(s[k])) throw new Error("Yedek eksik ya da bozuk.");
  }
  const base = emptyState();
  return { ...base, ...s, settings: { ...base.settings, ...s.settings } };
}

// İşlemler CSV (Excel/Numbers için noktalı virgül, ondalık virgül). Tutarlar kuruştan çevrilir.
const TX_TYPE = { expense: "Gider", income: "Gelir", refund: "İade", transfer: "Aktarım" };
const cell = v => { const t = String(v ?? ""); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function transactionsCsv(state) {
  const head = ["Tarih", "Tür", "Tutar", "Para birimi", "Hesap", "Hedef hesap", "Kategori", "Düzenli ödeme", "Açıklama"];
  const rows = Object.values(state.transactions)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || "").localeCompare(b.createdAt || ""))
    .map(t => [t.date, TX_TYPE[t.type] || t.type, (t.amount / 100).toFixed(2).replace(".", ","), t.currency || "TRY",
      state.accounts[t.accountId]?.name, state.accounts[t.toAccountId]?.name, state.categories[t.categoryId]?.name,
      state.obligations[t.obligationId]?.name, t.note]);
  return "\uFEFF" + [head, ...rows].map(r => r.map(cell).join(";")).join("\r\n");
}
