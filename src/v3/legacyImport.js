// Eski uygulamanın (App.jsx) verisini v3 durumuna çevirir. Saf fonksiyondur: Firebase ve
// localStorage bilmez; girdi eski yedek dosyasının (ev-butcesi-YYYY.MM.DD.json) içeriğidir.
// Kayıtlar core fonksiyonlarıyla eklenir; çevrilemeyen kayıt atlanır ve uyarılarda raporlanır,
// hiçbir şey sessizce kaybolmaz. Hesap açılış bakiyeleri bilinmediği için 0 yazılır; kullanıcı
// v3'te bakiye düzeltmesiyle gerçek bakiyeyi girer.

import {
  emptyState, addAccount, addObligation, addTransaction, putRecord, payObligation,
  toMinor, isDate, isPeriodKey, periodOf, periodRange, today as todayOf
} from "../core/index.js";

const safeId = v => String(v ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
const list = v => Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [];

export function isLegacyData(data) {
  return !!data && typeof data === "object" && !!data.settings && !!data.months && typeof data.months === "object";
}

// Dönüş: { state, warnings, counts }
export function convertLegacy(data, { today = todayOf(), userId = null } = {}) {
  if (!isLegacyData(data)) throw new Error("Bu dosya eski Ev Bütçesi verisi değil.");
  const warnings = [];
  const counts = { accounts: 0, categories: 0, obligations: 0, transactions: 0, payments: 0, skipped: 0 };
  const warn = msg => { warnings.push(msg); counts.skipped++; };
  const set = data.settings;
  const payDay = Number.isInteger(+set.payDay) && +set.payDay >= 1 && +set.payDay <= 31 ? +set.payDay : 15;

  let s = emptyState();
  s = { ...s, settings: { ...s.settings, payDay, defaultAccountId: "eski-hesap" } };

  const months = Object.keys(data.months).filter(isPeriodKey).sort();
  const current = periodOf(today, payDay);
  const first = months[0] && months[0] < current ? months[0] : current;
  const opening = { date: periodRange(first, payDay).start, balance: 0 };
  const startOf = mk => periodRange(mk, payDay).start;
  const dateFor = (d, mk) => isDate(d) && periodOf(d, payDay) === mk ? d : isDate(d) ? d : startOf(mk);

  // Hesaplar: ana banka hesabı + eski kartlar.
  s = addAccount(s, { id: "eski-hesap", name: "Banka hesabı", type: "bank", currency: "TRY", opening });
  counts.accounts++;
  const cardIds = {};
  for (const c of list(set.cards)) {
    if (!c?.id) continue;
    const id = `eski-kart-${safeId(c.id)}`;
    const credit = c.type !== "debit";
    const cutoff = Number.isInteger(+c.cutoffDay) && +c.cutoffDay >= 1 && +c.cutoffDay <= 31 ? +c.cutoffDay : null;
    try {
      s = addAccount(s, { id, name: c.name || (credit ? "Kredi kartı" : "Banka kartı"), type: credit ? "credit" : "debit", currency: "TRY", ...(credit && cutoff ? { cutoffDay: cutoff } : {}), opening });
      cardIds[c.id] = id; counts.accounts++;
    } catch (e) { warn(`Kart "${c.name || c.id}" aktarılamadı: ${e.message}`); }
  }
  const firstCard = Object.values(cardIds).find(id => s.accounts[id].type === "credit") || null;
  const cardAccount = cardId => cardIds[cardId] || firstCard || "eski-hesap";

  // Kategoriler: eski değişken gider kalemleri.
  const catIds = {};
  for (const ve of list(set.variableExpenses)) {
    if (!ve?.id || !ve.name) continue;
    const id = `eski-kat-${safeId(ve.id)}`;
    const budget = toMinor(ve.expectedAmount || 0);
    s = putRecord(s, "categories", { id, name: String(ve.name), ...(budget > 0 ? { budget } : {}), ...(list(ve.keywords).length ? { keywords: list(ve.keywords).map(String) } : {}) });
    catIds[ve.id] = id; counts.categories++;
  }
  const catOf = id => (id && catIds[id]) || null;

  // Sabit giderler → süresiz yükümlülük.
  const fixedIds = {};
  for (const e of list(set.fixedExpenses)) {
    if (!e?.id) continue;
    const amount = toMinor(e.amount || 0);
    if (!(amount > 0)) { warn(`Sabit gider "${e.name || e.id}" tutarsız olduğu için atlandı.`); continue; }
    const id = `eski-sabit-${safeId(e.id)}`;
    const due = Number.isInteger(+e.paymentDay) && +e.paymentDay >= 1 && +e.paymentDay <= 31 ? +e.paymentDay : null;
    try {
      s = addObligation(s, { id, kind: "fixed", name: e.name || "Sabit gider", amount, currency: "TRY", accountId: e.paymentMethod === "cc" ? cardAccount(e.cardId) : "eski-hesap", startPeriod: first, ...(due ? { dueDay: due } : {}) });
      fixedIds[e.id] = id; counts.obligations++;
    } catch (err) { warn(`Sabit gider "${e.name || e.id}" aktarılamadı: ${err.message}`); }
  }

  // Kart taksitleri.
  for (const p of list(data.installmentPlans)) {
    const amount = toMinor(p?.monthlyPayment || 0);
    const count = parseInt(p?.months, 10);
    if (!p?.id || !(amount > 0) || !(count > 0) || !isPeriodKey(p.startMonth)) { warn(`Taksit "${p?.note || p?.id || "?"}" eksik bilgili olduğu için atlandı.`); continue; }
    try {
      s = addObligation(s, { id: `eski-taksit-${safeId(p.id)}`, kind: "installment", name: p.note || p.merchantName || "Taksit", amount, currency: "TRY", accountId: cardAccount(p.cardId), categoryId: catOf(p.categoryId), startPeriod: p.startMonth, count });
      counts.obligations++;
    } catch (err) { warn(`Taksit "${p.note || p.id}" aktarılamadı: ${err.message}`); }
  }

  // Borçlar: kalan ay sayısı bu dönemden başlar. Döviz/altın borçları için v3'te ayrı hesap gerekir.
  for (const d of list(data.debts)) {
    const amount = toMinor(d?.monthlyPayment || 0);
    const count = parseInt(d?.remainingMonths, 10);
    if (!d?.id || !(amount > 0) || !(count > 0)) { if (d?.id && !(count > 0)) continue; warn(`Borç "${d?.name || "?"}" eksik bilgili olduğu için atlandı.`); continue; }
    if ((d.currency || "TRY") !== "TRY") { warn(`Borç "${d.name}" ${d.currency} cinsinden; v3'te elle eklenmeli.`); continue; }
    const skips = list(d.deferredMonths).filter(m => isPeriodKey(m) && m >= current);
    try {
      s = addObligation(s, { id: `eski-borc-${safeId(d.id)}`, kind: "debt", name: d.name || "Borç", amount, currency: "TRY", accountId: "eski-hesap", startPeriod: current, count, skips });
      counts.obligations++;
    } catch (err) { warn(`Borç "${d.name || d.id}" aktarılamadı: ${err.message}`); }
  }

  // Aylık hareketler → işlemler. Dönem, eski ay anahtarına sabitlenir (aylar kaymasın).
  const createdAt = new Date(`${today}T12:00:00`).toISOString();
  const tx = (t, label) => {
    const amount = toMinor(t.amount || 0);
    if (!(amount > 0)) { warn(`${label} tutarsız olduğu için atlandı.`); return; }
    try {
      s = addTransaction(s, { currency: "TRY", createdAt, ...(userId ? { createdBy: userId } : {}), ...t, amount, ...(t.categoryId ? {} : { categoryId: undefined }) });
      counts.transactions++;
    } catch (err) { warn(`${label} aktarılamadı: ${err.message}`); }
  };
  for (const mk of months) {
    const md = data.months[mk] || {};
    for (const e of list(md.incomeEntries)) {
      if (!e?.id) continue;
      tx({ id: `eski-gelir-${mk}-${safeId(e.id)}`, type: "income", date: dateFor(e.date, mk), period: mk, amount: e.amount, accountId: "eski-hesap", note: e.name || "Gelir" }, `${mk} geliri "${e.name || ""}"`);
    }
    for (const e of list(md.ccSingle)) {
      if (!e?.id) continue;
      tx({ id: `eski-kk-${mk}-${safeId(e.id)}`, type: "expense", date: dateFor(e.date, mk), period: mk, amount: e.amount, accountId: cardAccount(e.cardId), categoryId: catOf(e.categoryId), note: e.note || e.merchantName || "" }, `${mk} kart harcaması "${e.note || ""}"`);
    }
    for (const e of list(md.accountEntries)) {
      if (!e?.id) continue;
      tx({ id: `eski-hes-${mk}-${safeId(e.id)}`, type: "expense", date: dateFor(e.date, mk), period: mk, amount: e.amount, accountId: "eski-hesap", categoryId: catOf(e.categoryId), note: e.note || "" }, `${mk} hesap ödemesi "${e.note || ""}"`);
    }
    for (const b of list(md.billEntries)) {
      if (!b?.id) continue;
      if (!b.paid) { warn(`${mk} faturası "${b.name || ""}" ödenmemiş; v3'te elle eklenmeli.`); continue; }
      tx({ id: `eski-fatura-${mk}-${safeId(b.id)}`, type: "expense", date: dateFor(b.date, mk), period: mk, amount: b.amount, accountId: b.paymentMethod === "cc" ? cardAccount(b.cardId) : "eski-hesap", note: b.name || "Fatura" }, `${mk} faturası "${b.name || ""}"`);
    }
    if (list(md.debitCardEntries).length || list(md.cardEntries).length) warn(`${mk} döneminde konfor kartı/banka kartı girişleri var; bunlar aktarılmadı.`);
    // Ödenmiş sabit giderler → yükümlülük ödemesi.
    for (const [eid, oid] of Object.entries(fixedIds)) {
      if (!md.fixedPaid?.[eid]) continue;
      try {
        s = payObligation(s, oid, mk, { date: startOf(mk) }, { id: `eski-odeme-${mk}-${safeId(eid)}`, now: new Date(createdAt), userId }).state;
        counts.payments++;
      } catch (err) { warn(`${mk} sabit gider ödemesi aktarılamadı: ${err.message}`); }
    }
  }
  // undefined alanları temizle (buluta ve localStorage'a yazılırken sorun çıkmasın).
  s = { ...s, transactions: JSON.parse(JSON.stringify(s.transactions)) };
  if (list(data.savings?.TRY).length || list(data.savings?.USD).length || list(data.savings?.EUR).length || list(data.savings?.XAU).length) warnings.push("Birikim havuzu aktarılmadı; v3'te birikim hesabı olarak elle girilmeli.");
  return { state: s, warnings, counts };
}
