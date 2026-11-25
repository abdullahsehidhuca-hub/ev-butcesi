// v3 alt çekmeceleri. Her kayıt çekirdek fonksiyonlarıyla yapılır; doğrulama hatası
// (ValidationError) çekmecede gösterilir, veri değişmez.

import React, { useState } from "react";
import {
  quickAdd, payObligation, favorites, defaultAccountFor, suggestCategory, learnCategory,
  addAccount, addObligation, addInstallmentPurchase, putRecord, emptyState, setPayDay, periodOf, setAllowance
} from "../core/index.js";
import { parseAmount, amountText, fmtMoney, symbolOf } from "./format.js";
import { newId } from "./store.js";
import { Sheet, Field, SelectField, Chips, Actions, ErrorText, Form } from "./ui.jsx";
import { INCOME_PURPOSES, EXPENSE_PURPOSES, CATEGORY_GROUPS, LATER_NOTE, purposeOf, isExpenseAccount, isSavingsAccount, groupOf } from "./setupGuide.js";

const AMOUNT_HINT = "tutarı girin, örneğin 345 ya da 1.250,50";
const byName = (a, b) => a.name.localeCompare(b.name, "tr");
const activeCategories = state => Object.values(state.categories).filter(c => !c.archived).sort(byName);
const accountOptions = (list, empty) => [...(empty ? [{ value: "", label: empty }] : []), ...list.map(a => ({ value: a.id, label: a.name }))];
const categoryOptions = state => [{ value: "", label: "Kategorisiz" }, ...activeCategories(state).map(c => ({ value: c.id, label: c.name }))];
const DAYS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}` }));
const DAYS_OPT = [{ value: "", label: "Belirtilmedi" }, ...DAYS];
// Kayıt saati: tarih uygulamanın bugün değerinden (today), saat cihazdan; örnek veri kipinde de doğru güne yazılır.
const nowOn = day => new Date(`${day}T${new Date().toTimeString().slice(0, 8)}`);

// Bakiye gibi sıfır ya da eksi olabilen tutar: boş → 0, "-1.250" → -125000, geçersiz → null.
export function parseBalance(text) {
  const s = String(text ?? "").trim();
  if (!s || /^[-−]?0+([.,]0+)?$/.test(s)) return 0;
  const negative = /^[-−]/.test(s);
  const v = parseAmount(s.replace(/^[-−]/, ""));
  return v == null ? null : negative ? -v : v;
}

// ── Hızlı harcama ──────────────────────────────────────────────────────────────
// Tutar → kategori → Kaydet. Hesap, kategoride en son kullanılandan gelir; açıklama
// yazılırsa kategori önerilir, kullanıcının seçimi öğrenilir.
export function QuickAddSheet({ state, commit, onClose, onNeedAccount, today }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [picked, setPicked] = useState(false);
  const [accountId, setAccountId] = useState(null);
  const [errors, setErrors] = useState(null);
  const accounts = Object.values(state.accounts);

  if (!accounts.length) {
    return (
      <Sheet title="Hızlı harcama ekle" onClose={onClose}>
        <p className="v3-sheet-text">Harcamanın hangi hesaptan çıktığını bilmemiz gerekiyor. Önce bir banka hesabı ya da kart ekleyin.</p>
        <Form onSubmit={onNeedAccount}><Actions submit="Hesap ekle" onCancel={onClose} /></Form>
      </Sheet>
    );
  }

  const favs = favorites(state).map(f => state.categories[f.categoryId]);
  const cats = [...favs, ...activeCategories(state).filter(c => !favs.some(f => f.id === c.id))];
  const account = accountId || defaultAccountFor(state, categoryId);

  const onNote = v => {
    setNote(v);
    if (!picked) setCategoryId(suggestCategory(state, v)?.categoryId ?? null);
  };
  const save = () => {
    const minor = parseAmount(amount);
    if (!minor) return setErrors([AMOUNT_HINT]);
    const text = note.trim();
    const errs = commit(s => {
      let next = quickAdd(s, { amount: minor, categoryId, accountId: account, note: text }, { id: newId(), now: nowOn(today) }).state;
      if (categoryId && text) next = learnCategory(next, text, categoryId);
      return next;
    });
    if (errs) setErrors(errs); else onClose();
  };

  return (
    <Sheet title="Hızlı harcama ekle" onClose={onClose}>
      <Form onSubmit={save}>
        <Field label="Tutar (₺)" value={amount} onChange={setAmount} inputMode="decimal" placeholder="0,00" invalid={!!errors && !parseAmount(amount)} />
        <Field label="Açıklama" value={note} onChange={onNote} placeholder="Örn: Market alışverişi" />
        {cats.length
          ? <Chips label="Kategori" value={categoryId} options={cats.map(c => ({ value: c.id, label: c.name }))}
              onChange={v => { setCategoryId(v); setPicked(true); }} />
          : <p className="v3-hint" style={{ marginBottom: 14 }}>Henüz kategori yok; Ayarlar'dan ekleyebilirsiniz. Kategorisiz de kaydedilir.</p>}
        {accounts.length > 1 && (
          <SelectField label="Hesap" value={account} onChange={setAccountId} options={accountOptions(accounts)}
            hint={accountId ? null : "Bu kategoride en son kullandığınız hesap seçildi."} />
        )}
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
    </Sheet>
  );
}

// ── Ödendi / alındı ve kart ödemesi ────────────────────────────────────────────
// target: { type: "obligation", item } (computePeriod kalemi) ya da { type: "card", card }
export function PaySheet({ state, commit, onClose, period, target, today }) {
  const isCard = target.type === "card";
  const item = target.item;
  const income = !isCard && item.kind === "income";
  const bankAccounts = Object.values(state.accounts).filter(a => a.type !== "credit");
  const firstAccount = isCard ? bankAccounts[0]?.id : item.accountId;
  const startAmount = isCard ? target.card.due : item.currency === "TRY" ? item.open : item.amount;
  const [amount, setAmount] = useState(startAmount > 0 ? amountText(startAmount) : "");
  const [accountId, setAccountId] = useState(firstAccount || "");
  const [partial, setPartial] = useState(false);
  const [errors, setErrors] = useState(null);

  const title = isCard ? `${target.card.name} ödemesi` : income ? `${item.name} alındı mı?` : `${item.name} ödendi mi?`;
  const save = () => {
    const minor = parseAmount(amount);
    if (!minor) return setErrors([AMOUNT_HINT]);
    const errs = commit(s => isCard
      ? quickAdd(s, { type: "transfer", amount: minor, accountId, toAccountId: target.card.accountId, note: title }, { id: newId(), now: nowOn(today) }).state
      : payObligation(s, item.obligationId, period, { amount: minor, accountId, partial }, { id: newId(), now: nowOn(today) }).state);
    if (errs) setErrors(errs); else onClose();
  };

  const choices = isCard ? bankAccounts : Object.values(state.accounts);
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="v3-sheet-text">
        {isCard
          ? `Bu dönem ödenecek kart borcu ${fmtMoney(target.card.due)}. Ödeme seçtiğiniz hesaptan karta aktarılır.`
          : `Planlanan tutar ${fmtMoney(item.amount, item.currency)}. Fatura farklı geldiyse gerçek tutarı yazın.`}
      </p>
      <Form onSubmit={save}>
        <Field label={`Tutar (${symbolOf(state.accounts[accountId]?.currency || "TRY")})`}
          value={amount} onChange={setAmount} inputMode="decimal" placeholder="0,00" />
        {isCard && !choices.length
          ? <p className="v3-error" role="alert">Ödemeyi yapacak bir banka hesabı yok; önce Ayarlar'dan ekleyin.</p>
          : <SelectField label={isCard || !income ? "Ödenen hesap" : "Yatan hesap"} value={accountId} onChange={setAccountId} options={accountOptions(choices)} />}
        {!isCard && (
          <label className="v3-check">
            <input type="checkbox" checked={partial} onChange={e => setPartial(e.target.checked)} />
            <span>Kısmi ödeme — kalan tutar açık kalsın</span>
          </label>
        )}
        <ErrorText errors={errors} />
        <Actions submit={income ? "Alındı" : isCard ? "Ödemeyi kaydet" : "Ödendi"} onCancel={onClose} disabled={isCard && !choices.length} />
      </Form>
    </Sheet>
  );
}

// ── Hesap ──────────────────────────────────────────────────────────────────────
// Banka kartı ayrı hesap değildir: harcaması bağlı olduğu banka hesabından düşer. Ön ödemeli kart: konfor kartı, yemek kartı
// (Setcard, Multinet) gibi önceden para yüklenen kart.
const ACCOUNT_TYPES = [{ value: "bank", label: "Banka hesabı" }, { value: "cash", label: "Nakit" }, { value: "credit", label: "Kredi kartı" }, { value: "prepaid", label: "Ön ödemeli kart" }];
const CURRENCY_OPTIONS = [{ value: "TRY", label: "Türk lirası (₺)" }, { value: "USD", label: "Dolar ($)" }, { value: "EUR", label: "Euro (€)" }];

// ── Haftalık yükleme (konfor kartı gibi) ──────────────────────────────────────
// Kart dışı hesaba her hafta aynı gün aynı tutar başka bir hesaptan aktarılır; aktarım kendiliğinden yazılır.
const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"].map((label, i) => ({ value: String(i + 1), label }));
export function useAllowance(state, account) {
  const al = account?.allowance;
  const [amount, setAmount] = useState(al ? amountText(al.amount) : "");
  const [weekday, setWeekday] = useState(String(al?.weekday || 1));
  const [fromId, setFromId] = useState(al?.fromAccountId || "");
  return { amount, setAmount, weekday, setWeekday, fromId, setFromId };
}
// Dönüş: null (yükleme yok), { amount, weekday, fromAccountId } ya da { error }.
export function allowanceValue(f, sources) {
  if (!f.amount.trim()) return null;
  const minor = parseAmount(f.amount);
  if (!minor) return { error: "haftalık yükleme tutarını rakamla yazın ya da boş bırakın" };
  const from = f.fromId || sources[0]?.id;
  if (!from) return { error: "yüklemenin yapılacağı başka bir hesap ekleyin" };
  return { amount: minor, weekday: Number(f.weekday), fromAccountId: from };
}
export function AllowanceFields({ f, sources }) {
  if (!sources.length) return null;
  return <>
    <Field label="Haftalık yükleme (isteğe bağlı)" value={f.amount} onChange={f.setAmount} inputMode="decimal" placeholder="Örn: 1.500"
      hint="Konfor kartı gibi her hafta para gönderdiğiniz hesaplar için. Aktarım o gün kendiliğinden kaydedilir." />
    {!!f.amount.trim() && <>
      <SelectField label="Yükleme günü" value={f.weekday} onChange={f.setWeekday} options={WEEKDAYS} />
      <SelectField label="Hangi hesaptan yüklenir?" value={f.fromId || sources[0].id} onChange={f.setFromId} options={accountOptions(sources)} />
    </>}
  </>;
}
// Yükleme kaynağı olabilecek hesaplar: gelir tarafında, kart dışı, aynı para birimli, kendisi hariç.
export const allowanceSources = (state, id, currency) => Object.values(state.accounts).filter(a => a.id !== id && a.type !== "credit" && !isExpenseAccount(a) && !a.archived && a.currency === currency).sort(byName);

// initialType ve payMethod: hızlı harcamadaki "Konfor kartı ekle" gibi düğmelerden gelir; yeni hesap o düğmede görünür.
// side: kurulumdan açılınca hesabın tarafı. "income" maaş · birikim · nakit, "expense" otomatik ödemeler · kredi kartı
// aktarımları · günlük harcama türlerini sunar ve hesaba purpose yazar; "card" yalnız kredi kartı ekler.
const PLACEHOLDER = { salary: "Örn: Ziraat maaş hesabı", savings: "Örn: Vadeli birikim", cash: "Örn: Cüzdan", autopay: "Örn: Talimat hesabı", cardTransfer: "Örn: Kart ödeme hesabı", daily: "Örn: Konfor kartı" };
export function AccountSheet({ state, commit, onClose, today, initialType, payMethod, side }) {
  const purposes = side === "income" ? INCOME_PURPOSES : side === "expense" ? EXPENSE_PURPOSES : null;
  const [purpose, setPurpose] = useState(purposes?.[0].value || null);
  const [typesInfo, setTypesInfo] = useState(false);
  const [name, setName] = useState("");
  const [pickedType, setType] = useState(side === "card" ? "credit" : ACCOUNT_TYPES.some(t => t.value === initialType) ? initialType : "bank");
  const type = purposes ? purposeOf(purpose).type : pickedType;
  const [currency, setCurrency] = useState("TRY");
  const [balance, setBalance] = useState("");
  const [cutoff, setCutoff] = useState("");
  const [payment, setPayment] = useState("");
  const [errors, setErrors] = useState(null);
  const allowance = useAllowance(state, null);
  const credit = type === "credit";
  const prepaid = type === "prepaid";
  // Haftalık yükleme kurulumda yalnız günlük harcama hesabında sorulur.
  const sources = credit || (purposes && purpose !== "daily") ? [] : allowanceSources(state, null, prepaid ? "TRY" : currency);

  const save = () => {
    if (!name.trim()) return setErrors(["hesabın adını yazın"]);
    const minor = parseBalance(balance);
    if (minor == null) return setErrors(["bakiyeyi rakamla yazın, örneğin 48.265,44"]);
    const weekly = sources.length ? allowanceValue(allowance, sources) : null;
    if (weekly?.error) return setErrors([weekly.error]);
    const errs = commit(s => {
      const id = newId();
      // Kartta borç eksi bakiye olarak tutulur (çekirdek kuralı); kesim ve son ödeme günü isteğe bağlıdır.
      const card = credit ? { ...(cutoff ? { cutoffDay: Number(cutoff) } : {}), ...(payment ? { paymentDay: Number(payment) } : {}) } : {};
      let next = addAccount(s, { id, name: name.trim(), type, currency: prepaid ? "TRY" : currency, ...card, ...(purposes ? { purpose } : {}), ...(payMethod ? { payMethod } : {}), opening: { date: today, balance: credit ? -Math.abs(minor) : minor } });
      if (!s.settings.defaultAccountId && !credit && !prepaid && side !== "expense" && purpose !== "savings") next = { ...next, settings: { ...next.settings, defaultAccountId: id } };
      if (weekly) next = setAllowance(next, id, weekly, today);
      return next;
    });
    if (errs) setErrors(errs); else onClose();
  };

  return (
    <Sheet title={side === "card" ? "Kredi kartı ekle" : side === "expense" ? "Gider takibi hesabı ekle" : "Hesap ekle"} onClose={onClose}>
      {typesInfo ? (
        <>
          <dl className="setup-types">
            {purposes.map(t => <div key={t.value}><dt className="t-sub b">{t.label}</dt><dd className="t-meta">{t.info}</dd></div>)}
          </dl>
          <div className="v3-actions"><button type="button" className="v3-submit" style={{ flex: 1 }} onClick={() => setTypesInfo(false)}>Tamam</button></div>
        </>
      ) : (
      <Form onSubmit={save}>
        <Field label="Hesap adı" value={name} onChange={setName} placeholder={purposes ? PLACEHOLDER[purpose] : credit ? "Örn: Bonus kart" : prepaid ? "Örn: Konfor kartı, Multinet" : "Örn: Maaş hesabı"} />
        {purposes ? <>
          <Chips label="Tür" value={purpose} options={purposes} onChange={v => v && setPurpose(v)} wrap />
          <p className="v3-hint" style={{ margin: "-8px 4px 4px" }}>{purposeOf(purpose).info}</p>
          <button type="button" className="v3-link" style={{ minHeight: 44, margin: "0 4px 8px" }} onClick={() => setTypesInfo(true)}>Türler hakkında bilgi</button>
        </> : side !== "card" && <Chips label="Tür" value={type} options={ACCOUNT_TYPES} onChange={v => v && setType(v)} wrap />}
        {prepaid && <p className="v3-hint" style={{ margin: "-8px 4px 14px" }}>Konfor kartı, yemek kartı (Setcard, Multinet) gibi önceden para yüklenen kart.</p>}
        {!credit && !prepaid && <SelectField label="Para birimi" value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />}
        <Field label={credit ? "Güncel kart borcu" : "Bugünkü bakiye"} value={balance} onChange={setBalance} inputMode="decimal" placeholder="0,00"
          hint={credit ? "Bankanın gösterdiği borç; ödenmemiş harcamalar dahil." : prepaid ? "Kartta şu an yüklü tutar. Uygulama bu rakamdan devam eder." : "Bankada şu an görünen tutar. Uygulama bu rakamdan devam eder."} />
        {credit && <>
          <SelectField label="Hesap kesim günü" value={cutoff} onChange={setCutoff} options={DAYS_OPT} hint="Ekstrenin kesildiği gün; bloke ve ekstre dönemi buna göre hesaplanır. Sonradan da girebilirsiniz." />
          <SelectField label="Son ödeme günü" value={payment} onChange={setPayment} options={DAYS_OPT} hint="Boş bırakılırsa kesimden 10 gün sonrası sayılır." />
        </>}
        <AllowanceFields f={allowance} sources={sources} />
        {side && <p className="v3-hint" style={{ margin: "0 4px 12px" }}>{LATER_NOTE}</p>}
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
      )}
    </Sheet>
  );
}

// ── Kategori ───────────────────────────────────────────────────────────────────
// group: kurulumdan gelen dal ("fixed" sabit gider, "variable" değişken gider); verilmezse Ayarlar'dan eklenir ve seçilir.
export function CategorySheet({ commit, onClose, group: initialGroup }) {
  const [group, setGroup] = useState(initialGroup || "variable");
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [keywords, setKeywords] = useState("");
  const [errors, setErrors] = useState(null);

  const save = () => {
    if (!name.trim()) return setErrors(["kategorinin adını yazın"]);
    const limit = budget.trim() ? parseAmount(budget) : null;
    if (budget.trim() && !limit) return setErrors(["aylık bütçeyi rakamla yazın ya da boş bırakın"]);
    const words = keywords.split(",").map(w => w.trim()).filter(Boolean);
    const errs = commit(s => putRecord(s, "categories", { id: newId(), name: name.trim(), group, budget: limit, keywords: words }));
    if (errs) setErrors(errs); else onClose();
  };
  const fixed = group === "fixed";

  return (
    <Sheet title={initialGroup ? (fixed ? "Sabit gider kategorisi ekle" : "Değişken gider kategorisi ekle") : "Kategori ekle"} onClose={onClose}>
      <Form onSubmit={save}>
        <Field label="Kategori adı" value={name} onChange={setName} placeholder={fixed ? "Örn: Kira, faturalar" : "Örn: Market"} />
        {!initialGroup && <Chips label="Dal" value={group} options={CATEGORY_GROUPS} onChange={v => v && setGroup(v)} />}
        <Field label="Aylık bütçe (isteğe bağlı)" value={budget} onChange={setBudget} inputMode="decimal" placeholder="Örn: 5.000" />
        <Field label="Tanıma kelimeleri (isteğe bağlı)" value={keywords} onChange={setKeywords} placeholder="Örn: migros, bim, a101"
          hint="Açıklamada bu kelimeler geçerse kategori kendiliğinden seçilir. Virgülle ayırın." />
        {initialGroup && <p className="v3-hint" style={{ margin: "0 4px 12px" }}>{LATER_NOTE}</p>}
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
    </Sheet>
  );
}

// ── Düzenli ödeme ya da gelir (her ay) ─────────────────────────────────────────
// İlk maaş, henüz işlem yokken girilirse bütçe ayı maaş gününden başlar (settings.payDay).
// Talimatlı ödeme (autopayFrom) banka hesabında işaret beklemeden düşer; kredi kartında zaten kendiliğindendir.
// Gelir yalnız gelir tarafındaki hesaplara yatar; gider birikim hesabından ödenmez. Sabit ödemede önce sabit gider
// kategorileri listelenir. setup: kurulumdan açıldı (düzenleme notu gösterilir).
export function ObligationSheet({ state, commit, onClose, kind, period, today, setup }) {
  const income = kind === "income";
  const accounts = Object.values(state.accounts).filter(a => income ? a.type !== "credit" && !isExpenseAccount(a) : !isSavingsAccount(a));
  const fixedCats = activeCategories(state).filter(c => groupOf(c) === "fixed");
  const firstSalary = income && !Object.values(state.obligations).some(o => o.kind === "income") && !Object.keys(state.transactions).length;
  const [name, setName] = useState(income ? "Maaş" : "");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts.find(a => a.id === state.settings.defaultAccountId)?.id || accounts[0]?.id || "");
  const [categoryId, setCategoryId] = useState(!income && kind === "fixed" ? fixedCats[0]?.id || "" : "");
  const [day, setDay] = useState(String(income ? state.settings.payDay : 1));
  const [autopay, setAutopay] = useState(false);
  const [errors, setErrors] = useState(null);
  const canAutopay = !income && state.accounts[accountId]?.type !== "credit";

  const save = () => {
    if (!name.trim()) return setErrors(["adını yazın"]);
    const minor = parseAmount(amount);
    if (!minor) return setErrors([AMOUNT_HINT]);
    const errs = commit(s => {
      const next = firstSalary ? setPayDay(s, Number(day)) : s;
      const start = firstSalary ? periodOf(today, Number(day)) : period;
      return addObligation(next, {
        id: newId(), kind, name: name.trim(), amount: minor, currency: s.accounts[accountId]?.currency || "TRY",
        accountId, categoryId: categoryId || null, startPeriod: start, count: null, dueDay: Number(day),
        ...(autopay && canAutopay ? { autopayFrom: start } : {})
      });
    });
    if (errs) setErrors(errs); else onClose();
  };

  return (
    <Sheet title={income ? "Maaş / düzenli gelir ekle" : "Sabit ödeme ekle"} onClose={onClose}>
      <Form onSubmit={save}>
        <Field label="Adı" value={name} onChange={setName} placeholder={income ? "Maaş" : "Örn: Kira, elektrik"} />
        <Field label="Aylık tutar" value={amount} onChange={setAmount} inputMode="decimal" placeholder="0,00"
          hint={income ? null : "Fatura gibi değişen tutarlarda ortalamayı yazın; öderken gerçeğini girersiniz."} />
        <SelectField label={income ? "Yattığı hesap" : "Ödendiği hesap"} value={accountId} onChange={setAccountId} options={accountOptions(accounts)} />
        {!income && <SelectField label="Kategori" value={categoryId} onChange={setCategoryId}
          options={kind === "fixed" ? [{ value: "", label: "Kategorisiz" }, ...fixedCats.map(c => ({ value: c.id, label: c.name })), ...activeCategories(state).filter(c => groupOf(c) !== "fixed").map(c => ({ value: c.id, label: `${c.name} · değişken` }))] : categoryOptions(state)} />}
        <SelectField label={income ? "Ayın kaçında yatıyor?" : "Son ödeme günü"} value={day} onChange={setDay} options={DAYS}
          hint={firstSalary ? "Bütçe ayınız bu günden başlar ve her ay tekrarlanır." : "Bu dönemden başlayarak her ay tekrarlanır."} />
        {canAutopay && (
          <label className="v3-check">
            <input type="checkbox" checked={autopay} onChange={e => setAutopay(e.target.checked)} />
            <span>Otomatik talimatla ödeniyor: ödeme günü gelince işaretlemeden düşer</span>
          </label>
        )}
        {setup && <p className="v3-hint" style={{ margin: "0 4px 12px" }}>{LATER_NOTE}</p>}
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
    </Sheet>
  );
}

// ── Taksitli alışveriş ─────────────────────────────────────────────────────────
const COUNTS = [2, 3, 4, 5, 6, 8, 9, 10, 12, 18, 24, 36].map(n => ({ value: String(n), label: `${n} taksit` }));

// initial: taksit denemesinden (TaksitDeneSheet) gelen ön değerler { total, count, accountId, startPeriod }.
export function InstallmentSheet({ state, commit, onClose, today, initial }) {
  const accounts = Object.values(state.accounts).sort((a, b) => (b.type === "credit") - (a.type === "credit"));
  const [name, setName] = useState("");
  const [total, setTotal] = useState(initial?.total ? amountText(initial.total) : "");
  const [count, setCount] = useState(initial?.count ? String(initial.count) : "6");
  const [accountId, setAccountId] = useState(initial?.accountId && state.accounts[initial.accountId] ? initial.accountId : accounts[0]?.id || "");
  const [categoryId, setCategoryId] = useState("");
  const [errors, setErrors] = useState(null);

  const minor = parseAmount(total);
  const save = () => {
    if (!name.trim()) return setErrors(["ne aldığınızı yazın"]);
    if (!minor) return setErrors(["toplam tutarı girin, örneğin 12.000"]);
    const errs = commit(s => addInstallmentPurchase(s, { id: newId(), name: name.trim(), total: minor, count: Number(count), accountId, categoryId: categoryId || null, date: today, startPeriod: initial?.startPeriod || null }));
    if (errs) setErrors(errs); else onClose();
  };

  return (
    <Sheet title="Taksitli alışveriş ekle" onClose={onClose}>
      <Form onSubmit={save}>
        <Field label="Ne alındı?" value={name} onChange={setName} placeholder="Örn: Buzdolabı" />
        <Field label="Toplam tutar" value={total} onChange={setTotal} inputMode="decimal" placeholder="0,00" />
        <SelectField label="Taksit sayısı" value={count} onChange={setCount} options={COUNTS}
          hint={minor ? `Aylık yaklaşık ${fmtMoney(Math.floor(minor / Number(count)))}; kuruş farkı ilk taksite eklenir.` : null} />
        <SelectField label="Kart / hesap" value={accountId} onChange={setAccountId} options={accountOptions(accounts)} />
        <SelectField label="Kategori" value={categoryId} onChange={setCategoryId} options={categoryOptions(state)} />
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
    </Sheet>
  );
}

// ── Maaş günü (dönem başlangıcı) ───────────────────────────────────────────────
export function PayDaySheet({ state, commit, onClose }) {
  const [day, setDay] = useState(String(state.settings.payDay));
  const save = () => {
    const errs = commit(s => setPayDay(s, Number(day)));
    if (!errs) onClose();
  };
  return (
    <Sheet title="Ay döngüsü" onClose={onClose}>
      <Form onSubmit={save}>
        <SelectField label="Bütçe ayı her ayın kaçında başlasın?" value={day} onChange={setDay} options={DAYS}
          hint="Genelde maaş günü seçilir. Değişiklik yalnız yeni kayıtları etkiler; girilmiş kayıtlar dönemini korur." />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
    </Sheet>
  );
}

// ── Bu cihazdaki v3 verisini silme ─────────────────────────────────────────────
export function ResetSheet({ commit, onClose, synced }) {
  const save = () => { commit(() => emptyState()); onClose(); };
  return (
    <Sheet title="Tüm verileri sil" onClose={onClose}>
      <p className="v3-sheet-text">{synced
        ? "Aile hesabındaki hesaplar, kategoriler, ödemeler ve harcamalar tüm üyeler için silinir. Geri alınamaz; önce yedek indirin."
        : "Bu cihazdaki hesaplar, kategoriler, ödemeler ve harcamalar silinir. Geri alınamaz; önce yedek indirin."}</p>
      <Form onSubmit={save}><Actions submit="Sil" onCancel={onClose} danger /></Form>
    </Sheet>
  );
}

// ── Silme onayı (karşılamadaki ×) ──────────────────────────────────────────────
// Sistemin uyarı kutusu yerine "Tüm verileri sil" düzeninde: başlık neyin silineceğini, gövde neyin kaybolacağını söyler.
export function ConfirmSheet({ title, text, submit, onConfirm, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="v3-sheet-text">{text}</p>
      <Form onSubmit={onConfirm}><Actions submit={submit} onCancel={onClose} danger /></Form>
    </Sheet>
  );
}
