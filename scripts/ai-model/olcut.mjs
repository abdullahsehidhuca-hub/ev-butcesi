// Model denemesinin ölçütleri: ağa çıkmaz, testle doğrulanır (tests/ai-model-olcut.test.js).
// Her denetim kesin bir kurala bağlıdır; "başarılı" yalnız tüm kurallar tuttuğunda sayılır.

export const RECEIPT_CATEGORIES = ["süt ürünleri", "et/tavuk", "meyve/sebze", "temel gıda", "atıştırmalık", "içecek", "temizlik", "kişisel bakım", "bebek/çocuk", "diğer"];
export const ADVISOR_HEADINGS = ["Ne Yapmalıyım?", "Para Ne Zaman Biter?", "Önümüzdeki Günlerde Ne Çıkacak?", "Dikkat Edilmesi Gerekenler", "5 Somut Adım"];

const num = v => typeof v === "number" && Number.isFinite(v);
const kurus = v => Math.round(v * 100);

// Binom dağılımında P(X >= k), n deneme, başarı olasılığı p.
function tailAtLeast(k, n, p) {
  if (k <= 0) return 1;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let sum = 0;
  let logC = 0; // log C(n, i), i = 0'dan başlayarak
  for (let i = 0; i <= n; i++) {
    if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
    if (i >= k) sum += Math.exp(logC + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, sum);
}

/**
 * Tek yönlü Clopper-Pearson alt sınırı: k/n başarıdan "gerçek başarı oranı en az şu" (güven 1 - alpha).
 * P(X >= k | p) = alpha denklemini ikiye bölmeyle çözer.
 */
export function clopperPearsonLower(k, n, alpha = 0.05) {
  if (!n || k <= 0) return 0;
  let lo = 0; let hi = k / n;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tailAtLeast(k, n, mid) < alpha) lo = mid; else hi = mid;
  }
  return lo;
}

/** Hiç hata olmadan "en az oran" sözü için gereken deneme sayısı. */
export const runsNeeded = (target, alpha = 0.05) => Math.ceil(Math.log(alpha) / Math.log(target));

/** Fiş: biçim, kategori, toplamın beklenene eşitliği (kuruşu kuruşuna), kalemlerin toplamla tutarlılığı. */
export function checkReceipt(r, expected) {
  const notes = [];
  if (!r || typeof r !== "object") return { ok: false, notes: ["JSON değil"] };
  if (r.error) return { ok: false, notes: [`model okuyamadı: ${r.error}`] };
  if (typeof r.store !== "string" || !r.store.trim()) notes.push("mağaza adı yok");
  if (!num(r.totalAmount)) notes.push("toplam sayı değil");
  const items = Array.isArray(r.items) ? r.items : [];
  if (!items.length) notes.push("kalem yok");
  if (items.some(it => typeof it.name !== "string" || !num(it.qty) || !num(it.price))) notes.push("kalem biçimi hatalı");
  if (items.some(it => !RECEIPT_CATEGORIES.includes(it.category))) notes.push("listede olmayan kategori");
  if (num(r.totalAmount) && num(expected?.toplam) && kurus(r.totalAmount) !== kurus(expected.toplam)) {
    notes.push(`toplam ${r.totalAmount} ≠ beklenen ${expected.toplam}`);
  }
  if (num(r.totalAmount) && items.length && !notes.includes("kalem biçimi hatalı")) {
    const sum = items.reduce((s, it) => s + it.qty * it.price, 0);
    if (Math.abs(sum - r.totalAmount) > Math.max(1, r.totalAmount * 0.01)) notes.push(`kalemler toplamı ${sum.toFixed(2)} toplamla tutmuyor`);
  }
  return { ok: notes.length === 0, notes };
}

/** Ekstre: işlem sayısı ve tutar toplamı beklenene eşit (kuruşu kuruşuna), tarih ve tutar biçimi doğru. */
export function checkStatement(r, expected) {
  const notes = [];
  if (!r || typeof r !== "object") return { ok: false, notes: ["JSON değil"] };
  if (r.error) return { ok: false, notes: [`model okuyamadı: ${r.error}`] };
  const txs = Array.isArray(r.transactions) ? r.transactions : [];
  if (!txs.length) notes.push("işlem yok");
  if (txs.some(t => !/^\d{2}\.\d{2}\.\d{4}$/.test(t.date || ""))) notes.push("tarih biçimi hatalı");
  if (txs.some(t => !num(t.amount) || t.amount <= 0)) notes.push("tutar biçimi hatalı");
  if (num(expected?.adet) && txs.length !== expected.adet) notes.push(`işlem sayısı ${txs.length} ≠ beklenen ${expected.adet}`);
  if (num(expected?.toplam)) {
    const sum = txs.reduce((s, t) => s + kurus(num(t.amount) ? t.amount : 0), 0);
    if (sum !== kurus(expected.toplam)) notes.push(`tutar toplamı ${(sum / 100).toFixed(2)} ≠ beklenen ${expected.toplam}`);
  }
  return { ok: notes.length === 0, notes };
}

/** Danışman: istenen başlıkların hepsi var, yanıt Türkçe ve boş değil. İçerik kalitesini insan değerlendirir. */
export function checkAdvisor(text) {
  const notes = [];
  const t = typeof text === "string" ? text : "";
  if (t.length < 1500) notes.push(`yanıt kısa (${t.length} karakter)`);
  for (const h of ADVISOR_HEADINGS) if (!t.includes(h)) notes.push(`başlık yok: ${h}`);
  if (!/[çğıöşüİ]/.test(t)) notes.push("Türkçe karakter yok");
  return { ok: notes.length === 0, notes };
}
