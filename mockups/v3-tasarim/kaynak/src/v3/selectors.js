// v3 arayüzünün görünüm verisi. Hepsi saf fonksiyon: core durumundan (state) ekranda
// gösterilecek sayıları üretir, state'i değiştirmez. Hesap kuralları src/core'da kalır;
// burada yalnızca ekranın sorduğu sorular (ne kadar serbest, hangi gün sıkışırım,
// maaştan önce ne ödenecek) bir araya getirilir.

import {
  computePeriod, projection, occurrencesIn, balanceOf, favorites,
  periodOf, periodRange, dateInPeriod, nextPeriod, prevPeriod, addPeriods, sum
} from "../core/index.js";

const payDayOf = state => state.settings?.payDay || 1;
const DAY = 86400000;
const toUTC = d => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);
export const addDays = (d, n) => new Date(toUTC(d) + n * DAY).toISOString().slice(0, 10);

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTHS_LONG = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const monthShort = d => MONTHS[Number(d.slice(5, 7)) - 1];
export const monthLong = d => MONTHS_LONG[Number(d.slice(5, 7)) - 1];
export const dayNum = d => String(Number(d.slice(8, 10)));
export const periodLabel = p => `${MONTHS_LONG[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

// Bankada maaşın yattığı hesap: gelir yükümlülüğünün hesabı, yoksa varsayılan hesap.
export function mainAccountId(state) {
  const income = Object.values(state.obligations).find(o => o.kind === "income");
  return income?.accountId || state.settings?.defaultAccountId || Object.keys(state.accounts)[0];
}

// Kartın son ödeme tarihi. Motorda henüz yok; hesapta paymentDay alanı varsa kullanılır.
const cardDueDate = (account, period, payDay) => account.paymentDay ? dateInPeriod(period, account.paymentDay, payDay) : periodRange(period, payDay).end;

// Dönemin ödeme kalemleri: yükümlülükler + kredi kartı ekstresi, tarih sırasıyla.
export function paymentsOf(state, period) {
  const payDay = payDayOf(state);
  const s = computePeriod(state, period);
  const start = periodRange(period, payDay).start;
  const items = s.obligations.items.filter(i => i.kind !== "income").map(i => ({
    key: `o:${i.obligationId}:${period}`, type: "obligation", obligationId: i.obligationId, period,
    name: i.name, kind: i.kind, categoryId: i.categoryId, accountId: i.accountId,
    icon: state.obligations[i.obligationId]?.icon || state.categories[i.categoryId]?.icon || "more",
    color: state.obligations[i.obligationId]?.color || state.categories[i.categoryId]?.color || "gray",
    date: i.dueDate || start, amount: i.paid && i.settled ? i.paid : i.planned,
    paid: i.settled && !i.auto, auto: i.auto, open: i.open, index: i.index, total: i.total
  }));
  for (const c of s.cards) {
    if (c.charges <= 0) continue;
    const acc = state.accounts[c.accountId];
    items.push({ key: `c:${c.accountId}:${period}`, type: "card", accountId: c.accountId, period, name: `${c.name} ekstresi`, kind: "card", icon: "card", color: "pink",
      date: cardDueDate(acc, period, payDay), amount: c.charges, paid: c.due === 0, auto: false, open: c.due });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "tr"));
}

// Sonraki maaş tarihi (bugünden sonra ilk gelir kalemi).
export function nextSalaryDate(state, today) {
  const payDay = payDayOf(state);
  let p = periodOf(today, payDay);
  for (let i = 0; i < 3; i++, p = nextPeriod(p)) {
    const inc = occurrencesIn(state, p).find(o => o.kind === "income");
    const d = inc && (inc.dueDate || periodRange(p, payDay).start);
    if (d && d > today) return d;
  }
  return null;
}

// Ana hesabın bugünden itibaren gün gün planlanan bakiyesi (günlük harcamalar hariç).
// Dönüş: { start, points:[{date, balance, label, delta}], firstNegative, min }
export function forecast(state, today, { days = 35, overrides = {} } = {}) {
  const acc = mainAccountId(state);
  const payDay = payDayOf(state);
  const start = balanceOf(state, acc, today);
  const until = addDays(today, days);
  const events = [];
  let p = periodOf(today, payDay);
  for (let i = 0; i < 3; i++, p = nextPeriod(p)) {
    for (const it of paymentsOf(state, p)) {
      if (it.paid || it.auto || it.open <= 0) continue;
      if (!(it.type === "card" || it.accountId === acc)) continue;
      // overrides[key]: yeni tarih ("YYYY-MM-DD") ya da bölünmüş plan [{ date, amount }].
      const ov = overrides[it.key];
      const parts = Array.isArray(ov) ? ov : [{ date: ov || it.date, amount: it.open }];
      for (const part of parts) {
        if (part.date <= today || part.date > until) continue;
        events.push({ date: part.date, delta: -part.amount, label: it.name, key: it.key });
      }
    }
    for (const inc of occurrencesIn(state, p).filter(o => o.kind === "income" && o.accountId === acc)) {
      const date = inc.dueDate || periodRange(p, payDay).start;
      const received = Object.values(state.transactions).some(t => t.obligationId === inc.obligationId && t.period === p);
      if (!received && date > today && date <= until) events.push({ date, delta: inc.amount, label: inc.name, key: `i:${inc.obligationId}:${p}` });
    }
  }
  // Aynı gün maaş ödemelerden önce yatar kabul edilir.
  events.sort((a, b) => a.date.localeCompare(b.date) || b.delta - a.delta);
  let bal = start; let firstNegative = null; let min = { date: today, balance: start };
  const points = [{ date: today, balance: start, label: "Bugün", delta: 0 }];
  for (const e of events) {
    bal += e.delta;
    points.push({ date: e.date, balance: bal, label: e.label, delta: e.delta, key: e.key });
    if (bal < 0 && !firstNegative) firstNegative = { date: e.date, balance: bal, label: e.label, key: e.key };
    if (bal < min.balance) min = { date: e.date, balance: bal };
  }
  return { accountId: acc, start, points, firstNegative, min };
}

// Eksiye düşüşü çözmek için seçenekler ve her birinin sonucu.
export function resolveOptions(state, today, overrides = {}) {
  const fc = forecast(state, today, { overrides });
  if (!fc.firstNegative) return [];
  const need = Math.ceil(-fc.min.balance / 10000) * 10000; // yukarı, 100 ₺'ye yuvarla
  const opts = [];
  const cash = Object.values(state.accounts).find(a => a.type === "cash" && a.id !== fc.accountId);
  if (cash) {
    const cashBal = balanceOf(state, cash.id, today);
    if (cashBal >= need) opts.push({ id: "transfer", title: `Nakitten ${fmt(need)} aktar`, detail: `Nakit ${fmt(cashBal)} → ${fmt(cashBal - need)} olur`, fromAccountId: cash.id, amount: need, resultMin: fc.min.balance + need });
  }
  const neg = fc.firstNegative;
  if (neg.key?.startsWith("c:")) {
    const salary = nextSalaryDate(state, today);
    if (salary) {
      const moved = forecast(state, today, { overrides: { ...overrides, [neg.key]: salary } });
      opts.push({ id: "postpone", title: `Kartı ${dayNum(salary)} ${monthLong(salary)}’ta öde`, detail: "Son ödeme gününden sonra ödemek faiz ve gecikme ücretine yol açabilir.", tone: "warn", key: neg.key, date: salary, resultMin: moved.min.balance });
    }
    const acc = state.accounts[neg.key.split(":")[1]];
    if (acc?.minPaymentRate) {
      const item = fc.points.find(pt => pt.key === neg.key);
      const minPay = Math.round(-item.delta * acc.minPaymentRate);
      const salary = nextSalaryDate(state, today);
      const plan = [{ date: item.date, amount: minPay }, { date: salary, amount: -item.delta - minPay }];
      const split = forecast(state, today, { overrides: { ...overrides, [neg.key]: plan } });
      opts.push({ id: "minimum", title: "Asgari tutarı öde, kalanı maaştan sonra", detail: `Bu ay ${fmt(minPay)} (oran: %${Math.round(acc.minPaymentRate * 100)}). Kalan borca faiz işler; bankanla kontrol et.`, tone: "warn", key: neg.key, plan, resultMin: split.min.balance });
    }
  }
  return opts;
}

// Özet ekranı: serbest para, tempo, maaş çubuğu.
export function overview(state, today) {
  const payDay = payDayOf(state);
  const period = periodOf(today, payDay);
  const { start, end } = periodRange(period, payDay);
  const s = computePeriod(state, period);
  const totalDays = daysBetween(start, end) + 1;
  const day = daysBetween(start, today) + 1;
  const daysLeft = Math.max(1, totalDays - day + 1);
  const plan = sum(s.budgets.items.map(b => b.budget));
  const budgetedSpent = sum(s.budgets.items.map(b => b.spent));
  const expected = Math.round(plan * day / totalDays);
  const paid = s.obligations.total - s.obligations.open;
  return {
    period, start, end, day, totalDays, daysLeft,
    free: s.remaining, perDay: Math.floor(Math.max(0, s.remaining) / daysLeft),
    pace: { plan, spent: budgetedSpent, expected, diff: budgetedSpent - expected, projected: Math.round(budgetedSpent / day * totalDays) },
    salaryBar: { income: s.income.total, paid, pending: s.obligations.open, spent: s.spending.total, free: s.remaining },
    summary: s
  };
}

// Özet listesi: önümüzdeki ödemeler (bugünden sonra, ödenmemiş).
export function upcoming(state, today, limit = 4) {
  const payDay = payDayOf(state);
  const p = periodOf(today, payDay);
  return [...paymentsOf(state, p), ...paymentsOf(state, nextPeriod(p))]
    .filter(i => !i.paid && i.date >= today && (i.open > 0 || i.auto))
    .slice(0, limit);
}

// Son işlemler (yükümlülüğe bağlı olmayan giderler, iadeler, aktarımlar hariç gelir).
export function recent(state, limit = 8) {
  return Object.values(state.transactions)
    .filter(t => !t.obligationId && (t.type === "expense" || t.type === "refund"))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, limit);
}

// Ödemeler ekranı: seçili dönemin kalemleri, maaştan önce / sonra.
export function paymentsView(state, period) {
  const items = paymentsOf(state, period);
  const payDay = payDayOf(state);
  const next = nextPeriod(period);
  const inc = occurrencesIn(state, next).find(o => o.kind === "income");
  const salary = inc ? (inc.dueDate || periodRange(next, payDay).start) : periodRange(next, payDay).start;
  const total = sum(items.map(i => i.amount));
  const open = sum(items.map(i => i.open));
  return {
    period, salary, total, open, paidCount: items.filter(i => i.paid).length, count: items.length,
    before: items.filter(i => i.date < salary), after: items.filter(i => i.date >= salary)
  };
}

// Rapor ekranı: kategori dağılımı (halka), 6 ay (çubuk), limitler ve öneriler.
export function report(state, today, months = 6) {
  const o = overview(state, today);
  const s = o.summary;
  const cats = state.categories;
  const parts = Object.entries(s.spending.byCategory)
    .filter(([k, v]) => v > 0 && !k.startsWith("_"))
    .map(([k, v]) => ({ categoryId: k, name: cats[k]?.name || "Diğer", value: v }))
    .sort((a, b) => b.value - a.value);
  const top = parts.slice(0, 4);
  const rest = sum(parts.slice(4).map(p => p.value));
  if (rest > 0) top.push({ categoryId: "_rest", name: "Diğer", value: rest });
  const proj = projection(state, o.period, months).map(m => ({ period: m.period, free: m.free, ending: m.ending }));
  const limits = s.budgets.items.map(b => ({ ...b, name: cats[b.categoryId]?.name, projected: Math.round(b.spent / o.day * o.totalDays), expected: Math.round(b.budget * o.day / o.totalDays) }));
  const insights = [];
  for (const l of limits) if (l.projected > l.budget) insights.push({ tone: "warn", categoryId: l.categoryId, title: `${l.name} limiti aşılacak`, detail: `Bu hızla ${fmt(l.projected)}, limit ${fmt(l.budget)}` });
  for (const m of proj) if (m.free < 0) {
    const later = proj.find(x => x.period > m.period && x.free >= 0);
    insights.push({ tone: "danger", title: `${periodLabel(m.period).split(" ")[0]}’ta ${fmt(-m.free)} açık`, detail: later ? `${periodLabel(later.period).split(" ")[0]}’ta kapanıyor` : "Plan sonrası da açık sürüyor" });
  }
  return { total: s.spending.total, parts: top, projection: proj, limits, insights, pace: o.pace, day: o.day };
}

export function favoritesFor(state, today) {
  return favorites(state, { now: new Date(today + "T12:00:00") });
}

const FMT = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
export const fmt = minor => `${minor < 0 ? "−" : ""}${FMT.format(Math.abs(Math.round(minor / 100)))} ₺`;
export const fmtNum = minor => `${minor < 0 ? "−" : ""}${FMT.format(Math.abs(Math.round(minor / 100)))}`;
export const fmtK = minor => (minor / 100000).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace("-", "−");
export { prevPeriod, nextPeriod, addPeriods };
