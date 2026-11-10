// Kredi kartı harcamasının hangi bütçe döneminden düşüleceği (kullanıcı ayarı).
//
//  "spend" (A, varsayılan): harcamanın yapıldığı dönemin bütçesinden. Harcama o gün serbest tutardan düşer
//    ve kartın yaklaşan ekstresi için "bloke" sayılır. Taksitte her dönem yalnız o dönemin taksiti düşer.
//  "pay" (B): ekstrenin ödendiği dönemin bütçesinden. Harcama yapıldığı dönemde düşülmez; ekstresinin
//    son ödeme tarihinin düştüğü dönemde zorunlu gider olarak düşülür. Henüz ödeme dönemi gelmemiş
//    harcamalar "gelecek dönem yükü" olarak ayrıca gösterilir.
//
// Ayar geçerlilik tarihiyle saklanır: settings.cardBudgetModes (genel) ve account.budgetModes (kart
// bazında; mode: null → genel ayarı izle), ikisi de [{ from: "YYYY-MM-DD", mode }] listesi.
// Her kalem, tarihinde geçerli olan kurala göre hesaplanır: harcama/iade kendi tarihine, karttan
// kendiliğinden çekilen taksit/abonelik dönemin ilk gününe göre. Böylece mod değiştiğinde aynı harcama
// iki kez sayılmaz ve arada sayılmayan harcama kalmaz.

import { sum } from "./money.js";
import { isDate, periodOf, periodRange, nextPeriod, addPeriods } from "./period.js";
import { occurrence } from "./schedule.js";
import { statementCutoffFor, statementDueDate } from "./cardStatement.js";
import { putRecord, ValidationError } from "./model.js";

export const CARD_BUDGET_MODES = ["spend", "pay"];
export const DEFAULT_CARD_BUDGET_MODE = "spend";

const list = v => Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [];
const latest = (entries, date) => list(entries).filter(e => e.from <= date).sort((a, b) => a.from.localeCompare(b.from)).at(-1);

// Kartta, tarihte geçerli mod.
export function cardBudgetModeAt(state, account, date) {
  const own = latest(account?.budgetModes, date);
  if (own?.mode) return own.mode;
  return latest(state.settings?.cardBudgetModes, date)?.mode || DEFAULT_CARD_BUDGET_MODE;
}

// Modu from tarihinden itibaren değiştirir. accountId verilmezse genel ayar; kartta mode: null genel ayara döner.
export function setCardBudgetMode(state, { accountId = null, mode, from }) {
  const e = [];
  if (!isDate(from)) e.push("geçerlilik tarihi geçersiz");
  if (!(CARD_BUDGET_MODES.includes(mode) || (accountId && mode == null))) e.push("geçersiz kart ödeme ayarı");
  const a = accountId ? state.accounts[accountId] : null;
  if (accountId && !a) e.push("hesap bulunamadı");
  else if (a && a.type !== "credit") e.push("bu ayar yalnız kredi kartında geçerli");
  if (e.length) throw new ValidationError(e);
  const put = entries => [...list(entries).filter(x => x.from !== from), { from, mode: mode ?? null }].sort((x, y) => x.from.localeCompare(y.from));
  if (a) return putRecord(state, "accounts", { ...a, budgetModes: put(a.budgetModes) });
  return { ...state, settings: { ...state.settings, cardBudgetModes: put(state.settings?.cardBudgetModes) } };
}

// Kartın fromPeriod–toPeriod (dahil) dönemlerindeki bütçe kalemleri.
// Kalem: { key, kind: "expense"|"refund"|"auto"|"installment", date, period, payPeriod, cutoff, dueDate,
//   amount (TL; iade eksi), mode, name, categoryId, txId?, obligationId?, index?, total? }
// payPeriod: ekstrenin ödendiği dönem (kesim günü yoksa harcamanın ertesi dönemi).
export function cardItems(state, account, fromPeriod, toPeriod, base = a => a) {
  const payDay = state.settings?.payDay || 1;
  const when = date => {
    if (!account.cutoffDay) return { cutoff: null, dueDate: null, payPeriod: nextPeriod(periodOf(date, payDay)) };
    const cutoff = statementCutoffFor(account, date);
    const dueDate = statementDueDate(account, cutoff);
    return { cutoff, dueDate, payPeriod: periodOf(dueDate, payDay) };
  };
  const txs = Object.values(state.transactions).filter(t => t.accountId === account.id && (t.type === "expense" || t.type === "refund"));
  const out = [];
  for (const t of txs) {
    const period = t.period || periodOf(t.date, payDay);
    if (period < fromPeriod || period > toPeriod) continue;
    const ob = t.obligationId && state.obligations[t.obligationId];
    const oc = ob ? occurrence(ob, period, payDay) : null;
    // Yükümlülük ödemesi dönemin kuralına (dönemin ilk günü), diğerleri kendi tarihine bağlıdır.
    const modeDate = ob ? periodRange(period, payDay).start : t.date;
    const sign = t.type === "refund" ? -1 : 1;
    out.push({
      key: `t:${t.id}`, kind: ob ? (ob.kind === "installment" ? "installment" : "auto") : t.type, date: t.date, period, ...when(t.date),
      amount: sign * base(t.amount, t.currency), mode: cardBudgetModeAt(state, account, modeDate),
      name: ob ? ob.name : t.note || null, categoryId: t.categoryId ?? ob?.categoryId ?? null, txId: t.id,
      obligationId: t.obligationId || null, index: oc?.index ?? null, total: oc?.total ?? null
    });
  }
  const linked = new Set(Object.values(state.transactions).filter(t => t.obligationId).map(t => `${t.obligationId}|${t.period}`));
  for (const o of Object.values(state.obligations)) {
    if (o.accountId !== account.id || o.kind === "income") continue;
    for (let p = fromPeriod; p <= toPeriod; p = nextPeriod(p)) {
      const oc = occurrence(o, p, payDay);
      if (!oc || linked.has(`${o.id}|${p}`)) continue;
      const date = periodRange(p, payDay).start;
      out.push({
        key: `o:${o.id}:${p}`, kind: o.kind === "installment" ? "installment" : "auto", date, period: p, ...when(date),
        amount: base(oc.amount, oc.currency), mode: cardBudgetModeAt(state, account, date),
        name: o.name, categoryId: o.categoryId ?? null, obligationId: o.id, index: oc.index, total: oc.total
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

const total = items => sum(items.map(i => i.amount));

// Dönemin kart bütçesi, kart kart:
//  blocked: A modundaki, bu dönemin bütçesinden düşülen kart kalemleri (bloke)
//  load: B modundaki, ekstresi bu dönem ödenen kalemler (bu dönemin bütçesinden düşülür)
//  pending: B modundaki, yapılmış ama ekstresi sonraki dönemlerde ödenecek kalemler (gelecek dönem yükü)
//  deferred: B modundaki, bu döneme ait kalemler (bu dönemin harcama/ödeme toplamından çıkarılır)
export function cardBudget(state, period, base = a => a) {
  const cards = Object.values(state.accounts).filter(a => a.type === "credit").map(a => {
    const items = cardItems(state, a, addPeriods(period, -3), period, base);
    const blockedItems = items.filter(i => i.mode === "spend" && i.period === period);
    const loadItems = items.filter(i => i.mode === "pay" && i.payPeriod === period);
    const pendingItems = items.filter(i => i.mode === "pay" && i.payPeriod > period);
    const statements = [...new Map(blockedItems.filter(i => i.cutoff).map(i => [i.cutoff, { cutoff: i.cutoff, dueDate: i.dueDate }])).values()];
    return {
      accountId: a.id, name: a.name, mode: cardBudgetModeAt(state, a, periodRange(period, state.settings?.payDay || 1).start),
      blocked: total(blockedItems), blockedItems, load: total(loadItems), loadItems, pending: total(pendingItems), pendingItems,
      deferred: items.filter(i => i.mode === "pay" && i.period === period), statements
    };
  });
  return {
    cards,
    blocked: sum(cards.map(c => c.blocked)),
    load: sum(cards.map(c => c.load)),
    pending: sum(cards.map(c => c.pending))
  };
}

// Mod değişikliğinin geçiş dönemindeki etkisi. B'den A'ya geçişte eski (B) harcamaların ekstresi
// geçiş döneminde ve sonrasında ödenmeye devam ederken yeni harcamalar da hemen bloke edilir:
// extra = geçiş döneminde ve sonrasında ödenecek B kalemlerinin toplamı (ek yük). A'dan B'ye geçişte 0.
export function cardModeChangeImpact(state, { accountId = null, mode, from }, base = a => a) {
  const payDay = state.settings?.payDay || 1;
  const period = periodOf(from, payDay);
  const next = setCardBudgetMode(state, { accountId, mode, from });
  const cards = Object.values(next.accounts)
    .filter(a => a.type === "credit" && (!accountId || a.id === accountId))
    .filter(a => cardBudgetModeAt(state, state.accounts[a.id], from) === "pay" && cardBudgetModeAt(next, a, from) === "spend")
    .map(a => {
      const items = cardItems(next, a, addPeriods(period, -3), period, base).filter(i => i.mode === "pay" && i.payPeriod >= period);
      return { accountId: a.id, name: a.name, extra: total(items) };
    })
    .filter(c => c.extra > 0);
  return { period, extra: sum(cards.map(c => c.extra)), cards };
}
