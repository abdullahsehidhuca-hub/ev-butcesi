// Kısa süreli bütçe (kamp, tatil, gezi): ev bütçesinden ayrı, kendi üyeleri olan bir harcama listesi.
// Saf fonksiyonlar; Firebase okuma/yazma src/v3/events.js'tedir.
// event: { meta: { name, kind: "split" | "trip", start, end, budget? (kuruş, yalnız trip) },
//   members: { uid: { name } }, expenses: { id: { amount (kuruş), note, category, paidBy, method: "cash" | "card", date, createdBy } } }
// split (ortak harcama): herkes kendi ödediğini girer, sonunda eşit paylaşılır ve kimin kime göndereceği çıkar.
// trip (tatil bütçesi): toplam bütçeden her harcama düşer; kalan ve günlük harcanabilir tutar görünür.

import { sum } from "./money.js";

export const EVENT_CATEGORIES = [
  { id: "food", name: "Yemek ve market" },
  { id: "stay", name: "Konaklama" },
  { id: "transport", name: "Ulaşım ve yakıt" },
  { id: "activity", name: "Gezi ve etkinlik" },
  { id: "shopping", name: "Alışveriş" },
  { id: "other", name: "Diğer" }
];
export const eventCategoryName = id => EVENT_CATEGORIES.find(c => c.id === id)?.name || "Diğer";

const DAY = 86400000;
const toUTC = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const daysIncl = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY) + 1;

export const eventExpenses = event => Object.entries(event?.expenses || {}).map(([id, e]) => ({ id, ...e }))
  .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));

// Etkinlik bitti mi (bitiş günü geçti mi)?
export const eventEnded = (event, today) => !!event?.meta?.end && event.meta.end < today;

// Toplamlar: kategoriye, ödeme biçimine (nakit / kart) ve ödeyen kişiye göre. trip'te kalan ve günlük tutar.
export function eventSummary(event, today) {
  const list = eventExpenses(event);
  const total = sum(list.map(e => e.amount));
  const group = key => {
    const out = {};
    for (const e of list) out[e[key] || "other"] = (out[e[key] || "other"] || 0) + e.amount;
    return out;
  };
  const meta = event?.meta || {};
  const res = { total, count: list.length, byCategory: group("category"), byMethod: { cash: 0, card: 0, ...group("method") }, byPayer: group("paidBy") };
  if (meta.kind === "trip" && meta.budget > 0) {
    const left = meta.budget - total;
    // Bugün dahil kalan gün; etkinlik başlamadıysa bütün süre, bittiyse 0.
    const from = today < meta.start ? meta.start : today;
    const daysLeft = meta.end && from <= meta.end ? daysIncl(from, meta.end) : 0;
    res.budget = meta.budget;
    res.left = left;
    res.daysLeft = daysLeft;
    res.perDay = daysLeft > 0 ? Math.max(0, Math.floor(left / daysLeft)) : null;
    res.spentToday = sum(list.filter(e => e.date === today).map(e => e.amount));
  }
  return res;
}

// Hesaplaşma: toplam harcama üyelere eşit bölünür (kuruş farkı kimlik sırasıyla ilk üyelere). Payından fazla
// ödeyen alacaklı, az ödeyen borçludur. En büyük borçlu en büyük alacaklıya öder; en çok üye − 1 aktarım çıkar.
// Dönüş: { share: { uid: pay }, balance: { uid: ödediği − payı }, transfers: [{ from, to, amount }] }
export function settleUp(event) {
  const ids = Object.keys(event?.members || {}).sort();
  const paid = Object.fromEntries(ids.map(id => [id, 0]));
  for (const e of eventExpenses(event)) if (e.paidBy in paid) paid[e.paidBy] += e.amount;
  const total = sum(Object.values(paid));
  const n = ids.length || 1;
  const base = Math.floor(total / n);
  const extra = total - base * n;
  const share = Object.fromEntries(ids.map((id, i) => [id, base + (i < extra ? 1 : 0)]));
  const balance = Object.fromEntries(ids.map(id => [id, paid[id] - share[id]]));
  const debtors = ids.filter(id => balance[id] < 0).map(id => ({ id, amount: -balance[id] }));
  const creditors = ids.filter(id => balance[id] > 0).map(id => ({ id, amount: balance[id] }));
  const transfers = [];
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
    creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
    const d = debtors[0], c = creditors[0];
    const amount = Math.min(d.amount, c.amount);
    transfers.push({ from: d.id, to: c.id, amount });
    d.amount -= amount; c.amount -= amount;
    if (!d.amount) debtors.shift();
    if (!c.amount) creditors.shift();
  }
  return { paid, share, balance, transfers };
}

// Harcama kaydı doğrulaması (veritabanı kuralları da aynı alanları denetler).
export function validateEventExpense(event, e) {
  const errs = [];
  if (!(Number.isInteger(e.amount) && e.amount > 0)) errs.push("tutarı girin, örneğin 345 ya da 1.250,50");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) errs.push("tarih geçersiz");
  if (e.method !== "cash" && e.method !== "card") errs.push("nakit ya da kart seçin");
  if (!event?.members?.[e.paidBy]) errs.push("ödeyen kişiyi seçin");
  if (e.note && String(e.note).length > 80) errs.push("açıklama en çok 80 karakter olabilir");
  return errs;
}

// Yeni etkinlik doğrulaması.
export function validateEventMeta(m) {
  const errs = [];
  if (!m.name?.trim()) errs.push("bir ad yazın, örneğin Kaş kampı");
  else if (m.name.trim().length > 60) errs.push("ad en çok 60 karakter olabilir");
  if (m.kind !== "split" && m.kind !== "trip") errs.push("bütçe türünü seçin");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(m.end || "")) errs.push("başlangıç ve bitiş tarihini seçin");
  else if (m.end < m.start) errs.push("bitiş tarihi başlangıçtan önce olamaz");
  if (m.kind === "trip" && !(Number.isInteger(m.budget) && m.budget > 0)) errs.push("toplam bütçeyi girin, örneğin 30.000");
  return errs;
}
