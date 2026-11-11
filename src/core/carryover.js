// Dönem devredeni: dönem kapanınca artan (ya da açık kalan) para ve kullanıcının bu para için kararı.
//
// Devreden yeni dönemin serbest tutarına EKLENMEZ. Dönem açıkken yalnız tahmin olarak gösterilir;
// kapanışta kesinleşir ve kullanıcı çoktan seçmeli bir karar verir:
//   artı:  saving (birikime aktar) · later (kararı sonra ver) · ignore (kayıt hatası, yok say)
//   eksi:  nextBudget (sonraki ayın bütçesinden düş) · saving (birikimden karşıla) · debt (borç alındı)
//          · ignoreError (kayıt hatası, yok say) · ignoreOk (sorun değil, yok say)
// Karar carryovers koleksiyonunda dönem anahtarıyla tutulur: { id: dönem, period, amount, choice, ... }.
// Verilen karar undoCarryover ile geri alınır (oluşan kayıtlarla birlikte); dönem yeniden karar bekler.
// Para hareketi gerekiyorsa ayrı kayıt oluşur (aktarım, döviz/altın alımı, borç); bunlar gelir ya da
// gider sayılmaz, böylece aynı para raporlarda iki kez görünmez.
//
// Devreden = kapanış özetindeki dönem sonucu (remaining) + sonraki döneme taşınan ya da ertelenen açık
// ödemeler. Taşınan ödeme sonraki dönemde yeniden gider sayıldığı için bu dönemin sonucuna geri eklenir.

import { BASE, toBase, sum } from "./money.js";
import { isDate, periodOf, nextPeriod } from "./period.js";
import { computePeriod } from "./engine.js";
import { addTransaction, addObligation, deleteTransaction, deleteObligation, putRecord, removeRecord, ValidationError } from "./model.js";
import { addGoal, updateGoal, deleteGoal, ratesOf } from "./savings.js";

export const SURPLUS_CHOICES = ["saving", "later", "ignore"];
export const DEFICIT_CHOICES = ["nextBudget", "saving", "debt", "ignoreError", "ignoreOk"];
export const CARRYOVER_GOAL_ID = "carryover";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const monthOf = period => MONTHS[Number(period.slice(5, 7)) - 1];
const UNIT = { TRY: "₺", USD: "$", EUR: "€", XAU: "gr altın" };
const NUM = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
export const formatUnits = (minor, currency) => `${NUM.format(minor / 100)} ${UNIT[currency] || currency}`;

const fail = msg => { throw new ValidationError([msg]); };

// Dönemin devredeni. Kapalı dönemde kesin (final), açık dönemde tahmini.
// pending: kapanmış, tutarı sıfırdan farklı ve kararı verilmemiş (ya da "sonra" denmiş).
export function carryoverOf(state, period, { rates = {} } = {}) {
  const closed = state.closedPeriods?.[period];
  const s = closed || computePeriod(state, period, { rates });
  const decided = closed ? Object.fromEntries((s.decisions || []).map(d => [d.obligationId, d.decision])) : null;
  const heldOver = sum((s.obligations?.items || [])
    .filter(i => i.kind !== "income" && i.open > 0 && ["carry", "defer"].includes(decided ? decided[i.obligationId] : "carry"))
    .map(i => i.open));
  const amount = (s.remaining || 0) + heldOver;
  const decision = state.carryovers?.[period] || null;
  return { period, amount, final: !!closed, decision, pending: !!closed && amount !== 0 && (!decision || decision.choice === "later") };
}

// Karar bekleyen en eski kapanmış dönem; yoksa null.
export function pendingCarryover(state) {
  for (const p of Object.keys(state.closedPeriods || {}).sort()) {
    const c = carryoverOf(state, p);
    if (c.pending) return c;
  }
  return null;
}

// B modunda (ekstre ödendiği ayın bütçesinden) devreden birikime aktarılırken uyarı: sonraki dönemin
// beklenen geliri, düzenli ödemeler ile o dönem ödenecek kart ekstresini karşılıyor mu?
export function carryoverCardWarning(state, period, { rates = {} } = {}) {
  const next = nextPeriod(period);
  const s = computePeriod(state, next, { rates });
  const load = s.cardBudget?.load || 0;
  if (load <= 0) return null;
  const short = s.obligations.total + load - s.income.total;
  return short > 0 ? { period: next, load, income: s.income.total, short } : null;
}

function moneyAccount(state, id, label) {
  const a = state.accounts[id];
  if (!a) fail(`${label} bulunamadı`);
  if (a.type === "credit") fail(`${label} kredi kartı olamaz`);
  return a;
}

function guardOpen(state, date) {
  if (!isDate(date)) fail("tarih geçersiz");
  const p = periodOf(date, state.settings?.payDay || 1);
  if (state.closedPeriods?.[p]) fail(`${p} dönemi kapalı; kayıt eklenemez`);
  return p;
}

const txBase = (state, { id, date, now, userId }) => {
  if (!id) fail("id eksik");
  return { id, date, period: periodOf(date, state.settings?.payDay || 1), createdAt: (now || new Date()).toISOString(), createdBy: userId || null };
};

// Bir hesaptan ötekine para: aynı para biriminde aktarım, farklıysa döviz/altın alım-satımı.
function moveMoney(state, from, to, { amount, toAmount, note, extra = {}, meta }) {
  const t = from.currency === to.currency
    ? { ...txBase(state, meta), type: "transfer", amount, currency: from.currency, accountId: from.id, toAccountId: to.id, note, ...extra }
    : { ...txBase(state, meta), type: "exchange", amount, currency: from.currency, accountId: from.id, toAccountId: to.id, toAmount, note, ...extra };
  return { state: addTransaction(state, t), txId: t.id };
}

// Tutarı (from biriminde) to birimine kurla çevirir; kur yoksa null.
function convert(amount, fromCur, toCur, rates) {
  const tl = toBase(amount, fromCur, rates);
  if (tl == null) return null;
  if (toCur === BASE) return tl;
  const r = rates?.[toCur];
  return r > 0 ? Math.round(tl / r) : null;
}

// Kararı uygular. input.choice zorunlu; seçeneğe göre:
//  artı saving: { fromAccountId (TL, devredenin durduğu hesap), toAccountId (birikim hesabı), units (birikim
//     hesabının biriminde alınan miktar), tlAmount? (dövizde/altında harcanan TL; verilmezse devredenin tamamı),
//     goalId? (yoksa "Devreden birikim" hedefi) }. Aktarılan TL devredeni aşamaz.
//  eksi saving: { fromAccountId (birikim hesabı), toAccountId (TL harcama hesabı), units? (dövizde bozdurulan
//     miktar; verilmezse kurdan hesaplanır) }
//  debt: { currency, amount (kendi biriminde), dueDate, lender?, accountId (geri ödenecek hesap) }
// opts: { id (yeni kayıt kimliği), date (kayıt tarihi, açık dönem), now, userId, rates }
export function decideCarryover(state, period, input, { id, date, now = new Date(), userId = null, rates = ratesOf(state) } = {}) {
  const c = carryoverOf(state, period);
  if (!c.final) fail("dönem kapanmadan devreden kararı verilemez");
  if (c.amount === 0) fail("bu dönemde devreden tutar yok");
  if (c.decision && c.decision.choice !== "later") fail("bu dönemin devreden kararı zaten verildi");
  const surplus = c.amount > 0;
  const abs = Math.abs(c.amount);
  const choice = input?.choice;
  if (!(surplus ? SURPLUS_CHOICES : DEFICIT_CHOICES).includes(choice)) fail("geçersiz devreden kararı");

  const rec = { id: period, period, amount: c.amount, choice, decidedAt: now.toISOString(), ...(userId ? { decidedBy: userId } : {}) };
  const meta = { id, date, now, userId };
  let next = state;

  if (choice === "saving" && surplus) {
    const from = moneyAccount(state, input.fromAccountId, "kaynak hesap");
    const to = moneyAccount(state, input.toAccountId, "birikim hesabı");
    const units = input.units;
    if (!(Number.isSafeInteger(units) && units > 0)) fail("birikime aktarılan miktar sıfırdan büyük olmalı");
    if (from.currency !== BASE) fail("devreden TL hesabından aktarılır");
    // Harcanan TL: TL birikimde alınan miktarın kendisi; döviz/altında verilen tutar ya da devredenin tamamı.
    const tl = to.currency === BASE ? units : input.tlAmount ?? abs;
    if (!(Number.isSafeInteger(tl) && tl > 0)) fail("harcanan TL tutarı sıfırdan büyük olmalı");
    if (tl > abs) fail(`aktarılan tutar devredeni (${formatUnits(abs, BASE)}) aşamaz`);
    const note = to.currency === BASE
      ? `${monthOf(period)} ayından devreden ${formatUnits(tl, BASE)} birikime aktarıldı`
      : `${monthOf(period)} ayından devreden ${formatUnits(tl, BASE)} ile ${formatUnits(units, to.currency)} alındı`;
    if (from.id !== to.id) {
      guardOpen(state, date);
      const r = moveMoney(next, from, to, { amount: tl, toAmount: units, note, extra: { carryover: period }, meta });
      next = r.state; rec.txId = r.txId;
    }
    // Hedef: seçilen hedef ya da "Devreden birikim" (hedef tutarı aktarılan devredenlerin toplamıdır).
    const goalId = input.goalId || CARRYOVER_GOAL_ID;
    const g = next.goals?.[goalId];
    if (input.goalId && !g) fail("hedef bulunamadı");
    const accountIds = [...new Set([...(g?.accountIds || []), to.id])];
    // Hesap hedefe bu kararla bağlandıysa geri almada çıkarılır.
    if (!(g?.accountIds || []).includes(to.id)) rec.goalAccountAdded = true;
    next = g
      ? updateGoal(next, goalId, { accountIds, ...(goalId === CARRYOVER_GOAL_ID ? { target: g.target + tl } : {}) })
      : addGoal(next, { id: CARRYOVER_GOAL_ID, name: "Devreden birikim", target: tl, accountIds, kind: "saving" });
    Object.assign(rec, { goalId, toAccountId: to.id, units, tlAmount: tl, currency: to.currency, note });
  } else if (choice === "saving") {
    const from = moneyAccount(state, input.fromAccountId, "birikim hesabı");
    const to = moneyAccount(state, input.toAccountId, "harcama hesabı");
    if (from.id === to.id) fail("birikim hesabı ile harcama hesabı aynı olamaz");
    if (to.currency !== BASE) fail("açık TL hesabına karşılanır");
    const units = from.currency === BASE ? abs : input.units ?? convert(abs, BASE, from.currency, rates);
    if (units == null) fail(`${from.currency} kuru eksik; bozdurulan miktarı girin`);
    if (!(Number.isSafeInteger(units) && units > 0)) fail("bozdurulan miktar sıfırdan büyük olmalı");
    guardOpen(state, date);
    const note = `${monthOf(period)} ayının ${formatUnits(abs, BASE)} açığı birikimden karşılandı`;
    const r = moveMoney(next, from, to, { amount: units, toAmount: abs, note, extra: { carryover: period }, meta });
    next = r.state;
    Object.assign(rec, { txId: r.txId, fromAccountId: from.id, units, currency: from.currency, note });
  } else if (choice === "debt") {
    if (!isDate(input.dueDate)) fail("vade tarihi geçersiz");
    if (!id) fail("id eksik");
    const lender = String(input.lender || "").trim();
    const payDay = state.settings?.payDay || 1;
    next = addObligation(next, {
      id, kind: "debt", name: lender ? `Borç · ${lender}` : `Borç · ${monthOf(period)} açığı`,
      amount: input.amount, currency: input.currency, accountId: input.accountId,
      startPeriod: periodOf(input.dueDate, payDay), count: 1, dueDay: Number(input.dueDate.slice(8, 10)),
      ...(lender ? { lender } : {}), carriedFrom: { carryover: period }
    });
    Object.assign(rec, { obligationId: id, currency: input.currency, units: input.amount, dueDate: input.dueDate, ...(lender ? { lender } : {}) });
  } else if (choice === "nextBudget") {
    if (state.closedPeriods?.[nextPeriod(period)]) fail("sonraki dönem kapalı; açık oradan düşülemez");
  }
  return putRecord({ ...next, carryovers: next.carryovers || {} }, "carryovers", rec);
}

// Verilen devreden kararını geri alır: kararla oluşan aktarım/alım-satım ve borç silinir, "Devreden birikim"
// hedefinin tutarı geri düşülür, hedefe bu kararla bağlanan hesap çıkarılır ve dönem yeniden karar bekler.
// Kayıt kapanmış bir döneme düştüyse, borcun ödemesi girildiyse ya da açığın düşüldüğü sonraki dönem
// kapandıysa geri alınamaz (kapalı dönemin rakamları değişmez).
export function undoCarryover(state, period) {
  const rec = state.carryovers?.[period];
  if (!rec) fail("bu dönem için verilmiş devreden kararı yok");
  const payDay = state.settings?.payDay || 1;
  if (rec.choice === "nextBudget" && state.closedPeriods?.[nextPeriod(period)]) fail("açığın düşüldüğü sonraki dönem kapandı; karar geri alınamaz");
  let next = state;
  const t = rec.txId && state.transactions[rec.txId];
  if (t) {
    const p = t.period || periodOf(t.date, payDay);
    if (state.closedPeriods?.[p]) fail(`kararla oluşan kayıt kapanmış ${p} dönemine düşüyor; karar geri alınamaz`);
    next = deleteTransaction(next, t.id, { allowCarryover: true });
  }
  if (rec.obligationId && next.obligations[rec.obligationId]) {
    if (Object.values(next.transactions).some(x => x.obligationId === rec.obligationId)) fail("borcun ödemesi girildi; karar geri alınamaz");
    next = deleteObligation(next, rec.obligationId, { allowCarryover: true });
  }
  const g = rec.goalId && next.goals?.[rec.goalId];
  if (g) {
    const others = Object.values(next.carryovers || {}).filter(c => c.id !== period && c.goalId === g.id);
    const accountIds = rec.goalAccountAdded && !others.some(c => c.toAccountId === rec.toAccountId)
      ? g.accountIds.filter(id => id !== rec.toAccountId) : g.accountIds;
    if (g.id === CARRYOVER_GOAL_ID) {
      const target = g.target - (rec.tlAmount ?? Math.abs(rec.amount));
      next = target > 0 ? updateGoal(next, g.id, { target, accountIds }) : deleteGoal(next, g.id);
    } else {
      next = updateGoal(next, g.id, { accountIds });
    }
  }
  return removeRecord(next, "carryovers", period);
}

// Birikimden serbest tutara aktarım: birikim hesabından harcama hesabına para geçer ve tutar bu dönemin
// serbest tutarına eklenir (gelir sayılmaz). Birikim hesabının bakiyesi düştüğü için hedefin biriken
// tutarı da kendiliğinden düşer. toAmount: dövizde/altında hedef hesaba giren tutar (verilmezse kurdan).
export function savingsToBudget(state, { fromAccountId, toAccountId, amount, toAmount, id, date, now = new Date(), userId = null, rates = ratesOf(state) }) {
  const from = moneyAccount(state, fromAccountId, "birikim hesabı");
  const to = moneyAccount(state, toAccountId, "harcama hesabı");
  if (from.id === to.id) fail("birikim hesabı ile harcama hesabı aynı olamaz");
  if (!(Number.isSafeInteger(amount) && amount > 0)) fail("aktarılan tutar sıfırdan büyük olmalı");
  guardOpen(state, date);
  const into = from.currency === to.currency ? amount : toAmount ?? convert(amount, from.currency, to.currency, rates);
  if (into == null) fail(`${from.currency} kuru eksik; hesaba giren tutarı girin`);
  return moveMoney(state, from, to, { amount, toAmount: into, note: "Birikimden serbest tutara aktarım", extra: { toBudget: true }, meta: { id, date, now, userId } }).state;
}

// Birikim ekranı: iki para hesabı arasında para hareketi. Aynı para biriminde aktarım (TL birikime para
// ayırma), farklı birimde döviz/altın alım-satımı (exchange). Gelir ya da gider değildir ve serbest tutara
// dokunmaz; o iş savingsToBudget'ındır. toAmount: hedef birimde giren miktar (farklı birimde zorunlu;
// verilmezse kurdan hesaplanır, kur yoksa hata). Kredi kartı iki tarafta da olamaz; kapalı döneme yazılmaz.
export function moveFunds(state, { fromAccountId, toAccountId, amount, toAmount, note, id, date, now = new Date(), userId = null, rates = ratesOf(state) }) {
  const from = moneyAccount(state, fromAccountId, "kaynak hesap");
  const to = moneyAccount(state, toAccountId, "hedef hesap");
  if (from.id === to.id) fail("kaynak ve hedef hesap aynı olamaz");
  if (!(Number.isSafeInteger(amount) && amount > 0)) fail("tutar sıfırdan büyük olmalı");
  guardOpen(state, date);
  const into = from.currency === to.currency ? amount : toAmount ?? convert(amount, from.currency, to.currency, rates);
  if (into == null) fail(`${from.currency === BASE ? to.currency : from.currency} kuru eksik; alınan miktarı girin`);
  if (!(Number.isSafeInteger(into) && into > 0)) fail("alınan miktar sıfırdan büyük olmalı");
  const label = from.currency === to.currency ? "Birikime aktarım" : to.currency === BASE ? `${formatUnits(amount, from.currency)} bozduruldu` : `${formatUnits(into, to.currency)} alındı`;
  const r = moveMoney(state, from, to, { amount, toAmount: into, note: String(note || "").trim() || label, meta: { id, date, now, userId } });
  return { state: r.state, txId: r.txId };
}
