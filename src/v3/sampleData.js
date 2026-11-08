// Önizleme için örnek aile verisi (testler ve yalnız geliştirmede /v3?ornek). Gerçek veri değildir; tutarlar tasarımdaki senaryoyu
// (10 Aralık'ta hesabın eksiye düşmesi) yeniden üretecek şekilde seçildi.
// Kayıtlar core fonksiyonlarıyla eklenir; geçersiz bir kayıt olursa core hata verir.

import { emptyState, putRecord, addAccount, addObligation, addTransaction, payObligation } from "../core/index.js";

export const SAMPLE_TODAY = "2026-11-26";

// Arayüz düzeyinde aile üyeleri (core'da henüz yok). createdBy alanı bu kimlikleri kullanır.
export const SAMPLE_MEMBERS = {
  "u-a": { id: "u-a", name: "Abdullah", initial: "A", color: "indigo", self: true },
  "u-k": { id: "u-k", name: "Eşin", initial: "K", color: "orange" }
};

const TL = n => Math.round(n * 100);

export function buildSampleState() {
  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay: 15, defaultAccountId: "maas" } };
  s = addAccount(s, { id: "maas", name: "Maaş hesabı", type: "bank", currency: "TRY", opening: { date: "2026-11-15", balance: TL(805) } });
  s = addAccount(s, { id: "nakit", name: "Nakit", type: "cash", currency: "TRY", opening: { date: "2026-11-15", balance: TL(4200) } });
  s = addAccount(s, { id: "birikim", name: "Birikim", type: "bank", currency: "TRY", opening: { date: "2026-11-15", balance: TL(0) } });
  // paymentDay: kartın son ödeme günü. minPaymentRate: asgari ödeme oranı — örnek değerdir,
  // gerçek oranı kullanıcı bankasına göre girer. İkisi de yalnızca v3 arayüzü tarafından okunur.
  s = addAccount(s, { id: "bonus", name: "Bonus kart", type: "credit", currency: "TRY", cutoffDay: 28, paymentDay: 10, minPaymentRate: 0.4, opening: { date: "2026-10-15", balance: 0 } });

  const cats = [
    ["market", "Market", "cart", "teal", 12000], ["yakit", "Yakıt", "fuel", "orange", 4000], ["yemek", "Dışarıda yemek", "food", "red", 3000],
    ["ev", "Ev", "home", "purple"], ["saglik", "Sağlık", "health", "pink"], ["giyim", "Giyim", "shirt", "indigo"],
    ["fatura", "Fatura", "bolt", "orange"], ["diger", "Diğer", "more", "gray"]
  ];
  for (const [id, name, icon, color, budget] of cats) s = putRecord(s, "categories", { id, name, icon, color, ...(budget ? { budget: TL(budget) } : {}) });

  const ob = (o) => { s = addObligation(s, { currency: "TRY", ...o }); };
  ob({ id: "maas-geliri", kind: "income", name: "Maaş", amount: TL(60000), accountId: "maas", startPeriod: "2026-01", dueDay: 15 });
  ob({ id: "kira", kind: "fixed", name: "Kira", icon: "home", color: "purple", amount: TL(20000), accountId: "maas", categoryId: "ev", startPeriod: "2026-01", dueDay: 5 });
  ob({ id: "aidat", kind: "fixed", name: "Aidat", icon: "home", color: "indigo", amount: TL(1500), accountId: "maas", categoryId: "ev", startPeriod: "2026-01", dueDay: 20 });
  ob({ id: "elektrik", kind: "fixed", name: "Elektrik", icon: "bolt", color: "orange", amount: TL(1150), accountId: "maas", categoryId: "fatura", startPeriod: "2026-01", dueDay: 18 });
  ob({ id: "dogalgaz", kind: "fixed", name: "Doğalgaz", icon: "flame", color: "orange", amount: TL(1600), accountId: "maas", categoryId: "fatura", startPeriod: "2026-01", dueDay: 12 });
  ob({ id: "buzdolabi", kind: "installment", name: "Buzdolabı", icon: "fridge", color: "teal", amount: TL(5000), accountId: "bonus", categoryId: "ev", startPeriod: "2026-09", count: 6 });

  let n = 0;
  const now = d => new Date(`${d}T12:00:00`);
  const pay = (id, period, date, by = "u-a") => { s = payObligation(s, id, period, { date }, { id: `p${++n}`, now: now(date), userId: by }).state; };
  pay("maas-geliri", "2026-11", "2026-11-15");
  pay("elektrik", "2026-11", "2026-11-18");
  pay("aidat", "2026-11", "2026-11-20", "u-k");

  const tx = (t) => { s = addTransaction(s, { id: `t${++n}`, currency: "TRY", createdAt: now(t.date).toISOString(), ...t }); };
  const exp = (date, amount, categoryId, note, by = "u-a", accountId = "maas") => tx({ type: "expense", date, amount: TL(amount), categoryId, note, accountId, createdBy: by });
  // Geçen dönem karta yazılan harcama (bu dönem ekstreye gelir).
  exp("2026-10-20", 3740, "ev", "Teknosa", "u-a", "bonus");
  tx({ type: "transfer", date: "2026-11-16", amount: TL(20000), accountId: "maas", toAccountId: "birikim", note: "Birikime aktarım", createdBy: "u-a" });
  exp("2026-11-17", 2300, "market", "Migros");
  exp("2026-11-18", 1500, "giyim", "LC Waikiki", "u-k");
  exp("2026-11-19", 450, "saglik", "Eczane", "u-k");
  exp("2026-11-20", 1300, "yakit", "Opet");
  exp("2026-11-21", 640, "market", "BİM", "u-k");
  exp("2026-11-22", 1780, "market", "Kasap");
  exp("2026-11-23", 860, "yemek", "Köfteci");
  exp("2026-11-24", 1060, "yemek", "Restoran", "u-k");
  exp("2026-11-25", 1150, "yakit", "Opet", "u-k", "bonus");
  exp("2026-11-26", 1420, "market", "Migros");
  return s;
}
