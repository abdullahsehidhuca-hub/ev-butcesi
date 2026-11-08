// v3 arayüzünün görünüm verisi. Hepsi saf fonksiyon: core durumundan (state) ekranda
// gösterilecek sayıları üretir, state'i değiştirmez. Hesap kuralları src/core'da kalır;
// burada yalnızca ekranın sorduğu sorular (ne kadar serbest, hangi gün sıkışırım,
// maaştan önce ne ödenecek) bir araya getirilir.

import {
  computePeriod, projection, occurrencesIn, balanceOf, favorites, txPeriod,
  periodOf, periodRange, dateInPeriod, nextPeriod, prevPeriod, addPeriods, periodDistance, sum
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
      opts.push({ id: "postpone", title: `Kartı maaştan sonra öde (${dayNum(salary)} ${monthLong(salary)})`, detail: "Son ödeme gününden sonra ödemek faiz ve gecikme ücretine yol açabilir.", tone: "warn", key: neg.key, date: salary, resultMin: moved.min.balance });
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
    // safe: bütçelere ayrılan (henüz harcanmamış) pay da düşülmüş ana rakam; free: yalnız gelir − ödemeler − harcama.
    free: s.remaining, safe: s.safeToSpend, reserved: s.budgets.reserved,
    perDay: Math.floor(Math.max(0, s.safeToSpend) / daysLeft),
    pace: { plan, spent: budgetedSpent, expected, diff: budgetedSpent - expected, projected: Math.round(budgetedSpent / day * totalDays) },
    salaryBar: { income: s.income.total, received: s.income.received, obligations: s.obligations.total, paid, pending: s.obligations.open, spent: s.spending.total, reserved: s.budgets.reserved, free: s.remaining, safe: s.safeToSpend },
    summary: s
  };
}

// Dönemin henüz "alındı" işaretlenmemiş gelir kalemleri (maaş vb.).
export function incomesOf(state, period) {
  const start = periodRange(period, payDayOf(state)).start;
  return computePeriod(state, period).obligations.items
    .filter(i => i.kind === "income" && !i.settled && i.open > 0)
    .map(i => ({ key: `i:${i.obligationId}:${period}`, type: "income", obligationId: i.obligationId, period, name: i.name, kind: "income", accountId: i.accountId,
      icon: state.obligations[i.obligationId]?.icon || "cash", color: "green", date: i.dueDate || start, amount: i.planned, open: i.open, paid: false, auto: false }));
}

// Özet listesi: önümüzdeki ödemeler (bugünden sonra, ödenmemiş) ve beklenen gelirler.
// Bu dönemin günü geçmiş ama işaretlenmemiş geliri de listede kalır ("Alındı mı?").
export function upcoming(state, today, limit = 5) {
  const payDay = payDayOf(state);
  const p = periodOf(today, payDay);
  const pays = [...paymentsOf(state, p), ...paymentsOf(state, nextPeriod(p))]
    .filter(i => !i.paid && i.date >= today && (i.open > 0 || i.auto));
  const incomes = [...incomesOf(state, p), ...incomesOf(state, nextPeriod(p)).filter(i => i.date >= today)];
  return [...incomes, ...pays]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.type === "income" ? -1 : 1))
    .slice(0, limit);
}

// Son işlemler: harcama, iade, gelir, aktarım ve düzenli ödeme kayıtlarının hepsi.
export function recent(state, limit = 8) {
  return Object.values(state.transactions)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, limit);
}

// Tüm işlemler: dönem süzgeci ("all" ya da "YYYY-MM") ve arama (açıklama, kategori, hesap, düzenli ödeme adı, tutar).
// periods: kayıt bulunan dönemler, yeniden eskiye.
const fold = t => String(t ?? "").toLocaleLowerCase("tr-TR");
export function transactionsView(state, { period = "all", query = "" } = {}) {
  const payDay = payDayOf(state);
  const all = Object.values(state.transactions);
  const periods = [...new Set(all.map(t => txPeriod(t, payDay)))].sort().reverse();
  const q = fold(query.trim());
  const words = t => [t.note, categoryName(state, t.categoryId), state.accounts[t.accountId]?.name, state.accounts[t.toAccountId]?.name,
    state.obligations[t.obligationId]?.name, fmtNum(t.amount), String(t.amount / 100)].map(fold).join(" ");
  const list = all
    .filter(t => period === "all" || txPeriod(t, payDay) === period)
    .filter(t => !q || words(t).includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
  const signed = t => t.type === "income" || t.type === "refund" ? t.amount : t.type === "transfer" ? 0 : -t.amount;
  return { list, periods, net: sum(list.filter(t => t.currency === "TRY").map(signed)), closed: p => !!state.closedPeriods?.[p] };
}

// Ay kapatma: bugünkü dönemden önceki, kaydı olup henüz kapatılmamış en eski dönem. Başlangıç uygulamanın
// kullanılmaya başlandığı dönemdir (ilk işlem ya da hesap açılışı); öncesinde başlamış taksitler sorulmaz.
// Dönemler sırayla kapatılır; devreden kalem bir sonraki döneme taşındığı için sıra önemlidir.
export function closeCandidate(state, today) {
  const payDay = payDayOf(state);
  const current = periodOf(today, payDay);
  const starts = [
    ...Object.values(state.transactions).map(t => txPeriod(t, payDay)),
    ...Object.values(state.accounts).filter(a => a.opening?.date).map(a => periodOf(a.opening.date, payDay))
  ].filter(p => p < current);
  if (!starts.length) return null;
  // En çok 24 dönem geriye bakılır; daha eskisi kapatma beklemez.
  let p = starts.sort()[0];
  const floor = addPeriods(current, -24);
  if (p < floor) p = floor;
  for (; p < current; p = nextPeriod(p)) {
    if (state.closedPeriods?.[p]) continue;
    const s = computePeriod(state, p);
    const open = s.obligations.items.filter(i => i.kind !== "income" && i.open > 0);
    const pending = Object.values(state.transactions).some(t => txPeriod(t, payDay) === p) || s.obligations.items.length > 0;
    if (!pending) continue;
    return { period: p, summary: s, open, waiting: periodDistance(p, current) - 1 };
  }
  return null;
}

// Başlık dökümü (eski uygulamadaki "Bankadaki tutar / Bloke edilen tutar" karşılığı).
// bank: uygulamanın kayıtlarına göre banka ve nakit hesaplarda olması gereken para; bankadaki gerçek
// bakiyeyle karşılaştırılarak eksik ya da hatalı kayıt yakalanır. blocked: bu dönem bu hesaplardan
// çıkacak ama henüz çıkmamış ödemeler (düzenli ödemeler + kart ekstresi). Karttan otomatik çekilenler hariç.
export function balanceView(state, today) {
  const o = overview(state, today);
  const banks = Object.values(state.accounts)
    .filter(a => a.type !== "credit" && a.currency === "TRY")
    .map(a => ({ id: a.id, name: a.name, type: a.type, balance: balanceOf(state, a.id, today), lastCheck: (a.reconciliations || []).at(-1) || null }));
  const bank = sum(banks.map(b => b.balance));
  const blockedItems = paymentsOf(state, o.period).filter(i => !i.paid && !i.auto && i.open > 0);
  const blocked = sum(blockedItems.map(i => i.open));
  return { available: o.safe, bank, banks, blocked, blockedItems, afterBlocked: bank - blocked, bar: o.salaryBar };
}

// Hesap bakiyeleri ve TL hesapların toplamı (kredi kartı borcu eksi olarak düşer).
export function accountsView(state, today) {
  const list = Object.values(state.accounts).map(a => ({ ...a, balance: balanceOf(state, a.id, today) }));
  return { list, total: sum(list.filter(a => a.currency === "TRY").map(a => a.balance)) };
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
  const proj = projection(state, o.period, months).map(m => ({ period: m.period, income: m.income, obligations: m.obligations, budgets: m.budgets, free: m.free, ending: m.ending }));
  const prev = computePeriod(state, prevPeriod(o.period));
  // Tüm kategoriler tutarıyla (halkadaki "Diğer" birleştirmesi olmadan) ve önceki dönemle karşılaştırma.
  const rows = Object.entries(s.spending.byCategory)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => ({ categoryId: k, name: categoryName(state, k), value: v, prev: prev.spending.byCategory[k] || 0 }))
    .sort((a, b) => b.value - a.value);
  const limits = s.budgets.items.map(b => ({ ...b, name: cats[b.categoryId]?.name, projected: Math.round(b.spent / o.day * o.totalDays), expected: Math.round(b.budget * o.day / o.totalDays) }));
  const insights = [];
  for (const l of limits) if (l.projected > l.budget) insights.push({ tone: "warn", categoryId: l.categoryId, title: `${l.name} limiti aşılacak`, detail: `Bu hızla ${fmt(l.projected)}, limit ${fmt(l.budget)}` });
  for (const m of proj) if (m.free < 0) {
    const later = proj.find(x => x.period > m.period && x.free >= 0);
    insights.push({ tone: "danger", title: `${periodLabel(m.period).split(" ")[0]} döneminde ${fmt(-m.free)} açık`, detail: later ? `${periodLabel(later.period).split(" ")[0]} döneminde kapanıyor` : "Plan sonrası da açık sürüyor" });
  }
  return { total: s.spending.total, prevTotal: prev.spending.total, obligations: s.obligations.total, rows, parts: top, projection: proj, limits, insights, pace: o.pace, day: o.day, totalDays: o.totalDays };
}

export function categoryName(state, key) {
  if (key === "_none" || key == null) return "Kategorisiz";
  if (key === "_adjustment") return "Bakiye düzeltme";
  return state.categories[key]?.name || "Silinmiş kategori";
}

export function favoritesFor(state, today) {
  return favorites(state, { now: new Date(today + "T12:00:00") });
}

const FMT = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
export const fmt = minor => `${minor < 0 ? "−" : ""}${FMT.format(Math.abs(Math.round(minor / 100)))} ₺`;
export const fmtNum = minor => `${minor < 0 ? "−" : ""}${FMT.format(Math.abs(Math.round(minor / 100)))}`;
export const fmtK = minor => (minor / 100000).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace("-", "−");
export { prevPeriod, nextPeriod, addPeriods };
