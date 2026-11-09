// Kredi kartı ekstresi / dönem içi hareketlerin uygulamadaki kayıtlarla eşitlenmesi.
// Girdi: ekstreden kopyalanan metin ya da CSV satırları (her satır bir hareket). Tutarlar ekstredeki gibi
// kuruşuyla okunur ve yuvarlanmaz; eşleşme TAM tutar + yakın tarih ile yapılır.
// Sonuç: eşleşen, yalnız ekstrede olan, yalnız uygulamada olan hareketler ve ekstredeki taksitlerden
// gelecek ayların taksit yükü.

import { ValidationError } from "./model.js";
import { isDate, periodOf, addPeriods } from "./period.js";
import { quickAdd } from "./quickEntry.js";
import { addInstallmentPurchase } from "./installments.js";
import { occurrence } from "./schedule.js";

const DAY = 86400000;
const utc = d => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
const dayDiff = (a, b) => Math.abs(Math.round((utc(a) - utc(b)) / DAY));
const pad = n => String(n).padStart(2, "0");

// Tarih: 05.11.2026 · 05/11/2026 · 05-11-2026 · 05.11.26 · 2026-11-05
const DATE_RE = /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/;
// Tutar: 1.234,56 · 12,50 · -45,00 · 45,00- · 1234.56 (CSV); iki kuruş basamağı zorunlu.
const TR_AMOUNT = /([+-])?\s?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?!\d)\s?([+-])?/g;
const DOT_AMOUNT = /([+-])?(\d+)\.(\d{2})(?!\d)([+-])?/g;
const INSTALLMENT_RE = /(?:^|[^\d])(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/;
const CREDIT_WORDS = /(ödeme|odeme|iade|i̇ade|payment|refund|alacak)/i;

function readDate(m) {
  if (m[1]) return `${m[1]}-${m[2]}-${m[3]}`;
  const y = m[6].length === 2 ? `20${m[6]}` : m[6];
  return `${y}-${pad(m[5])}-${pad(m[4])}`;
}

// Tek satırı okur; tarih ya da tutar yoksa null.
// { date, description, amount (kuruş, pozitif), credit (ödeme/iade), installment: { index, total } | null }
export function parseStatementLine(line) {
  let s = String(line ?? "").replace(/\s+/g, " ").trim();
  const dm = s.match(DATE_RE);
  if (!dm) return null;
  const date = readDate(dm);
  if (!isDate(date)) return null;
  s = (s.slice(0, dm.index) + " " + s.slice(dm.index + dm[0].length)).trim();
  // İkinci bir tarih (işlem/valör) varsa açıklamadan çıkarılır.
  const dm2 = s.match(DATE_RE);
  if (dm2) s = (s.slice(0, dm2.index) + " " + s.slice(dm2.index + dm2[0].length)).trim();

  let hits = [...s.matchAll(TR_AMOUNT)];
  let whole = h => h[2].replace(/\./g, "");
  if (!hits.length) { hits = [...s.matchAll(DOT_AMOUNT)]; whole = h => h[2]; }
  if (!hits.length) return null;
  // Birden fazla tutar varsa (ör. taksit tutarı + toplam) son sütun ekstre tutarıdır.
  const h = hits[hits.length - 1];
  const amount = Number(whole(h)) * 100 + Number(h[3]);
  if (!(amount > 0)) return null;
  const sign = h[1] || h[4] || "";
  let rest = (s.slice(0, h.index) + " " + s.slice(h.index + h[0].length));
  for (const other of hits.slice(0, -1)) rest = rest.replace(other[0], " ");
  rest = rest.replace(/\b(TL|TRY)\b|₺/gi, " ").replace(/[|;\t]+/g, " ").replace(/\s+/g, " ").trim();

  let installment = null;
  const im = rest.match(INSTALLMENT_RE);
  if (im) {
    const index = Number(im[1]), total = Number(im[2]);
    if (total >= 2 && index >= 1 && index <= total) installment = { index, total };
  }
  const credit = sign === "-" || (sign !== "+" && CREDIT_WORDS.test(rest) && !installment);
  return { date, description: rest, amount, credit, installment };
}

// Çok satırlı metin; okunamayan satırlar (başlık, toplam) ayrı sayılır.
export function parseStatementText(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const r = parseStatementLine(raw);
    if (r) rows.push({ ...r, line: rows.length + 1 }); else skipped++;
  }
  return { rows, skipped };
}

// CSV/Excel'den gelen hücre dizileri: hücreler birleştirilip satır gibi okunur.
export const parseStatementCells = cellRows => parseStatementText(cellRows.map(r => r.join(" | ")).join("\n"));

const payDayOf = state => state.settings?.payDay || 1;

// Taksit satırını kartın taksitli alışveriş kalemiyle eşleştirir: aynı kart, aynı taksit tutarı ve sayısı,
// satırın döneminde kaçıncı taksitse o.
function findInstallment(state, accountId, row, used) {
  const period = periodOf(row.date, payDayOf(state));
  let best = null;
  for (const o of Object.values(state.obligations)) {
    if (o.accountId !== accountId || o.kind !== "installment" || used.has(o.id)) continue;
    if (o.count !== row.installment.total) continue;
    // Banka taksiti ekstreye bir dönem kaymalı da yazabilir; satırın dönemi ve komşuları denenir.
    for (const p of [period, addPeriods(period, -1), addPeriods(period, 1)]) {
      const oc = occurrence(o, p, payDayOf(state));
      if (oc && oc.amount === row.amount) { best = { obligation: o, period: p, indexMatches: oc.index === row.installment.index }; break; }
    }
    if (best) break;
  }
  return best;
}

// Ekstre satırlarını kartın kayıtlarıyla eşitler.
// dayTolerance: kart harcaması ekstreye 1-3 gün geç düşebilir.
export function reconcileStatement(state, accountId, rows, { dayTolerance = 3 } = {}) {
  const account = state.accounts[accountId];
  if (!account) throw new ValidationError(["kart bulunamadı"]);
  if (!rows.length) return { matched: [], installments: [], onlyStatement: [], onlyApp: [], credits: [], range: null, totals: { statement: 0, app: 0, diff: 0 } };
  const dates = rows.map(r => r.date).sort();
  const range = { from: dates[0], to: dates[dates.length - 1] };
  const inRange = d => d >= range.from && d <= range.to;

  const txs = Object.values(state.transactions).filter(t => t.accountId === accountId || t.toAccountId === accountId);
  const usedTx = new Set();
  const usedOb = new Set();
  const matched = [], installments = [], onlyStatement = [], credits = [];

  const pickTx = (row, accept) => {
    let best = null;
    for (const t of txs) {
      if (usedTx.has(t.id) || t.amount !== row.amount || !accept(t)) continue;
      const d = dayDiff(t.date, row.date);
      if (d <= dayTolerance && (!best || d < best.d)) best = { t, d };
    }
    if (best) usedTx.add(best.t.id);
    return best?.t || null;
  };

  // Önce taksitler (aynı tutarlı serbest harcamayla karışmasın), sonra harcamalar, en son ödeme/iadeler.
  const ordered = [...rows].sort((a, b) => (b.installment ? 1 : 0) - (a.installment ? 1 : 0));
  for (const row of ordered) {
    if (row.credit) {
      const t = pickTx(row, t => (t.type === "transfer" && t.toAccountId === accountId) || (t.type === "refund" && t.accountId === accountId) || (t.type === "income" && t.accountId === accountId));
      credits.push({ row, tx: t });
      continue;
    }
    if (row.installment) {
      const found = findInstallment(state, accountId, row, usedOb);
      if (found) usedOb.add(found.obligation.id);
      // Taksit ödemesi işlem olarak da kaydedilmişse onu da eşleşmiş say.
      const t = pickTx(row, t => t.type === "expense" && t.accountId === accountId && (!found || !t.obligationId || t.obligationId === found.obligation.id));
      installments.push({ row, obligationId: found?.obligation.id || null, period: found?.period || null, tx: t });
      continue;
    }
    const t = pickTx(row, t => t.type === "expense" && t.accountId === accountId);
    if (t) matched.push({ row, tx: t, dayShift: dayDiff(t.date, row.date) });
    else onlyStatement.push(row);
  }

  // Yalnız uygulamada olanlar: ekstrenin tarih aralığındaki (tolerans dahil) eşleşmemiş kart harcamaları.
  const from = new Date(utc(range.from) - dayTolerance * DAY).toISOString().slice(0, 10);
  const onlyApp = txs
    .filter(t => !usedTx.has(t.id) && t.type === "expense" && t.accountId === accountId && !t.obligationId && t.date >= from && t.date <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date));

  const debit = rows.filter(r => !r.credit);
  const statementTotal = debit.reduce((s, r) => s + r.amount, 0);
  const appTotal = txs.filter(t => t.type === "expense" && t.accountId === accountId && inRange(t.date)).reduce((s, t) => s + t.amount, 0);
  return {
    matched, installments, onlyStatement, onlyApp, credits, range,
    totals: { statement: statementTotal, app: appTotal, diff: statementTotal - appTotal }
  };
}

// Ekstredeki taksit satırlarından gelecek ayların yükü: "3/6" satırı sonraki 3 dönemde aynı tutarı getirir.
// Uygulamada kayıtlı taksitle eşleşenler ayrıca işaretlenir (çift sayılmasın diye).
export function statementInstallmentPlan(state, rows, { months = 6, linked = {} } = {}) {
  const out = [];
  for (const row of rows) {
    if (!row.installment || row.credit) continue;
    const base = periodOf(row.date, payDayOf(state));
    const left = row.installment.total - row.installment.index;
    for (let i = 1; i <= Math.min(left, months); i++) {
      out.push({ period: addPeriods(base, i), amount: row.amount, description: row.description, index: row.installment.index + i, total: row.installment.total, recorded: !!linked[row.line] });
    }
  }
  const byPeriod = {};
  for (const it of out) (byPeriod[it.period] ||= { period: it.period, total: 0, unrecorded: 0, items: [] });
  for (const it of out) {
    const m = byPeriod[it.period];
    m.total += it.amount;
    if (!it.recorded) m.unrecorded += it.amount;
    m.items.push(it);
  }
  return Object.values(byPeriod).sort((a, b) => a.period.localeCompare(b.period));
}

// Yalnız ekstrede olan satırları uygulamaya alır. Taksit satırı taksitli alışveriş kalemi olarak eklenir
// (başlangıç dönemi satırdaki taksit sırasına göre geriye alınır). Kapalı döneme düşen satır atlanır.
// ids: satır başına benzersiz kimlik üreten fonksiyon.
export function importStatementRows(state, accountId, rows, { newId, now = new Date(), userId = null, categoryId = null } = {}) {
  if (!state.accounts[accountId]) throw new ValidationError(["kart bulunamadı"]);
  let next = state;
  const added = [], skipped = [];
  for (const row of rows) {
    try {
      if (row.installment) {
        const start = addPeriods(periodOf(row.date, payDayOf(state)), -(row.installment.index - 1));
        next = addInstallmentPurchase(next, {
          id: newId(), name: row.description || "Taksitli alışveriş", total: row.amount * row.installment.total,
          count: row.installment.total, accountId, categoryId, date: row.date, startPeriod: start
        });
      } else {
        next = quickAdd(next, { type: row.credit ? "refund" : "expense", date: row.date, amount: row.amount, accountId, categoryId, note: row.description || "" },
          { id: newId(), now, userId }).state;
      }
      added.push(row);
    } catch (e) {
      skipped.push({ row, reason: e instanceof ValidationError ? e.errors.join("; ") : e.message });
    }
  }
  return { state: next, added, skipped };
}
