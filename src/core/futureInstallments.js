// Gelecek ay taksitleri: banka uygulamasındaki "gelecek dönem taksitleri" ekranının görüntüsünden (OCR)
// ya da kopyalanan metinden ay + tutar okunur ve uygulamadaki aynı kartın taksit yüküyle kıyaslanır.
// Banka uygulamaları bu ekranda tam tarih yerine ay adı yazar: "Aralık 2026  3.450,25 TL", "Oca 27 1.200,00",
// "01/2027 980,10". Ekran görüntüsünde ay ile tutar alt alta da düşebilir; tutarsız ay satırı bir sonraki
// tutar satırına bağlanır. Tam tarihli satırlar (hareketler) burada sayılmaz. Tutarlar yuvarlanmaz.

import { installmentLoad } from "./installments.js";

const pad = n => String(n).padStart(2, "0");
const FULL_DATE = /\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})(?!\d)/;
const TR_AMOUNT = /(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?!\d)/g;
const DOT_AMOUNT = /(\d+)\.(\d{2})(?!\d)/g;

const fold = s => String(s).toLocaleLowerCase("tr-TR").replace(/\u0307/g, "")
  .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
const MONTH_WORDS = [["ocak", "oca"], ["subat", "sub"], ["mart", "mar"], ["nisan", "nis"], ["mayis", "may"], ["haziran", "haz"],
  ["temmuz", "tem"], ["agustos", "agu", "agt"], ["eylul", "eyl"], ["ekim", "eki"], ["kasim", "kas"], ["aralik", "ara"]];
const MONTH_OF = Object.fromEntries(MONTH_WORDS.flatMap((ws, i) => ws.map(w => [w, i + 1])));
const MONTH_RE = new RegExp(`(?:^|[^a-z])(${Object.keys(MONTH_OF).join("|")})(?![a-z])\\.?\\s*('?\\d{4}|'\\d{2}|\\d{2}(?![\\d.,]))?`);
const NUM_PERIOD_RE = /(?:^|[^\d])(0?[1-9]|1[0-2])[./](20\d{2})(?!\d)|(?:^|[^\d])(20\d{2})[-/.](0[1-9]|1[0-2])(?![\d.,])/;

function lastAmount(s) {
  let hits = [...s.matchAll(TR_AMOUNT)];
  let whole = h => h[1].replace(/\./g, "");
  if (!hits.length) { hits = [...s.matchAll(DOT_AMOUNT)]; whole = h => h[1]; }
  if (!hits.length) return null;
  const h = hits[hits.length - 1];
  const amount = Number(whole(h)) * 100 + Number(h[2]);
  return amount > 0 ? amount : null;
}

function readMonth(line, today) {
  const f = fold(line);
  let month, year = null, rest;
  const nm = f.match(NUM_PERIOD_RE);
  if (nm) {
    month = Number(nm[1] || nm[4]); year = Number(nm[2] || nm[3]);
    rest = f.replace(nm[0], " ");
  } else {
    const mm = f.match(MONTH_RE);
    if (!mm) return null;
    month = MONTH_OF[mm[1]];
    if (mm[2]) { const y = mm[2].replace("'", ""); year = y.length === 2 ? 2000 + Number(y) : Number(y); }
    rest = f.replace(mm[0], " ");
  }
  if (!year) {
    // Yılsız ay: bugünden itibaren gelen ilk o ay.
    const [ty, tm] = (today || new Date().toISOString().slice(0, 10)).split("-").map(Number);
    year = month >= tm ? ty : ty + 1;
  }
  return { period: `${year}-${pad(month)}`, rest };
}

// { months: [{ period "YYYY-MM", amount (kuruş) }], lines } — aynı aya düşen birden fazla satır toplanır.
export function parseFutureInstallments(text, { today } = {}) {
  const byPeriod = {};
  let pending = null, lines = 0;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (FULL_DATE.test(line)) { pending = null; continue; }
    const m = readMonth(line, today);
    const amount = lastAmount(m ? m.rest : line);
    if (m && amount) { byPeriod[m.period] = (byPeriod[m.period] || 0) + amount; lines++; pending = null; }
    else if (m) pending = m.period;
    else if (pending && amount) { byPeriod[pending] = (byPeriod[pending] || 0) + amount; lines++; pending = null; }
  }
  const months = Object.entries(byPeriod).map(([period, amount]) => ({ period, amount })).sort((a, b) => a.period.localeCompare(b.period));
  return { months, lines };
}

// Bankanın bildirdiği aylık taksit tutarlarını uygulamadaki aynı kartın taksit/borç yüküyle kıyaslar.
// diff > 0: banka daha fazla diyor (uygulamada eksik taksit var); diff < 0: uygulamada fazla ya da bitmiş taksit.
export function compareFutureInstallments(state, accountId, months) {
  return months.map(({ period, amount }) => {
    const app = installmentLoad(state, period, 1).months[0].byAccount[accountId] || 0;
    return { period, bank: amount, app, diff: amount - app };
  });
}
