// v3 arayüzü için biçimlendirme: tutar girişi ve gösterimi, tarih ve dönem etiketleri.
// Hesap yapmaz; tutarlar çekirdekteki gibi kuruş cinsinden tam sayıdır.

import { toMinor, periodRange } from "../core/index.js";

export const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const SYMBOL = { TRY: "₺", USD: "$", EUR: "€", XAU: "gr" };
const NUM = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const symbolOf = currency => SYMBOL[currency] || currency;
export const fmtNumber = minor => NUM.format(minor / 100);
// "14.550 ₺", "48.265,44 ₺"
export const fmtMoney = (minor, currency = "TRY") => `${fmtNumber(minor)} ${symbolOf(currency)}`;
// "+3.200 ₺" / "-1.420 ₺"
export const fmtSigned = (minor, currency = "TRY") => `${minor > 0 ? "+" : minor < 0 ? "-" : ""}${fmtMoney(Math.abs(minor), currency)}`;

// Kullanıcının yazdığı tutarı kuruşa çevirir; geçersizse null.
// "1.234,56" → 123456 · "345" → 34500 · "12,5" ve "12.5" → 1250 · "1.250" → 125000 (binlik ayraç)
export function parseAmount(text) {
  let s = String(text ?? "").replace(/[\s₺]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const v = toMinor(s);
  return v > 0 ? v : null;
}

// Giriş alanına önceden yazılacak metin: 34500 → "345", 123456 → "1234,56"
export const amountText = minor => (minor % 100 ? (minor / 100).toFixed(2).replace(".", ",") : String(minor / 100));

const parts = date => date.split("-").map(Number);
const utc = date => { const [y, m, d] = parts(date); return Date.UTC(y, m - 1, d); };

// "2026-05-05" → "5 Mayıs"
export function dayMonth(date) {
  const [, m, d] = parts(date);
  return `${d} ${MONTHS[m - 1]}`;
}

export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / 86400000);

// İşlem listesinde gün: "Bugün", "Dün", "29 Nisan"
export function relativeDay(date, todayDate) {
  const diff = daysBetween(date, todayDate);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Dün";
  return dayMonth(date);
}

// Son ödeme gününe kalan: "Bugün", "3 gün kaldı", "2 gün gecikti"
export function dueText(dueDate, todayDate) {
  const diff = daysBetween(todayDate, dueDate);
  if (diff === 0) return "Bugün";
  return diff > 0 ? `${diff} gün kaldı` : `${-diff} gün gecikti`;
}

// "2026-11" → "Kasım"
export const periodName = period => MONTHS[parts(period)[1] - 1];

// Dönem başlığı: { name: "Kasım", range: "15 Kasım – 14 Aralık", daysLeft: 18 }
export function periodInfo(period, payDay, todayDate) {
  const { start, end } = periodRange(period, payDay);
  return { name: periodName(period), range: `${dayMonth(start)} – ${dayMonth(end)}`, daysLeft: Math.max(0, daysBetween(todayDate, end) + 1), start, end };
}
