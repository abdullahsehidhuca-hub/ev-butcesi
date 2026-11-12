// Tanım düzenleme çekmeceleri: hesap, kategori ve düzenli ödeme (yükümlülük).
// Ayarlar'daki satırlardan açılır. Her kayıt çekirdek fonksiyonlarıyla değişir; kullanımdaki hesap ve kategori
// silinemez (kategori arşivlenir), ödemesi girilmiş kalem silinemez (sonlandırılır). Tutar değişikliği yalnız
// bu dönemden sonrasını etkiler; kapanmış dönemlerin rakamı değişmez.
import { useState } from "react";
import {
  addAccount, deleteAccount, putRecord, validateObligation, ValidationError, changeObligationAmount, endObligation,
  deleteObligation, archiveCategory, deleteCategory, amountFor, lastPeriod
} from "../../core/index.js";
import { Sheet, Field, SelectField, Chips, Actions, ErrorText, Form } from "../ui.jsx";
import { parseAmount, amountText, symbolOf } from "../format.js";
import { parseBalance } from "../Sheets.jsx";
import { periodLabel, prevPeriod, fmt, dayNum, monthShort } from "../selectors.js";

const byName = (a, b) => a.name.localeCompare(b.name, "tr");
const DAYS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}` }));
const DAYS_OPT = [{ value: "", label: "Belirtilmedi" }, ...DAYS];
const ACCOUNT_TYPES = [{ value: "bank", label: "Banka hesabı" }, { value: "cash", label: "Nakit" }, { value: "credit", label: "Kredi kartı" }, { value: "prepaid", label: "Ön ödemeli kart" }];
const CURRENCY_OPTIONS = [{ value: "TRY", label: "Türk lirası (₺)" }, { value: "USD", label: "Dolar ($)" }, { value: "EUR", label: "Euro (€)" }, { value: "XAU", label: "Altın (gram)" }];
const KIND = { fixed: "Sabit ödeme", installment: "Taksit", debt: "Borç", income: "Gelir" };
const dateText = d => d ? `${dayNum(d)} ${monthShort(d)} ${d.slice(0, 4)}` : "";

// İki adımlı silme: önce "Sil", sonra "Evet, sil". Yanlışlıkla silinmesin diye onay aynı yerde açılır.
function DeleteRow({ label, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="v3-actions" style={{ marginTop: 8 }}>
      {confirm ? (
        <>
          <button type="button" className="v3-cancel" onClick={() => setConfirm(false)}>Silme</button>
          <button type="button" className="v3-submit is-danger" onClick={onDelete}>Evet, sil</button>
        </>
      ) : (
        <button type="button" className="v3-cancel c-red" style={{ flex: 1 }} onClick={() => setConfirm(true)}>{label}</button>
      )}
    </div>
  );
}

// ── Hesap ──────────────────────────────────────────────────────────────────────
export function AccountEditSheet({ state, commit, onClose, id, onToast }) {
  const a = state.accounts[id];
  const used = Object.values(state.transactions).some(t => t.accountId === id || t.toAccountId === id)
    || Object.values(state.obligations).some(o => o.accountId === id);
  const [name, setName] = useState(a?.name || "");
  const [type, setType] = useState(a?.type || "bank");
  const [currency, setCurrency] = useState(a?.currency || "TRY");
  const [balance, setBalance] = useState(a?.opening ? amountText(Math.abs(a.opening.balance)) : "");
  const [cutoff, setCutoff] = useState(a?.cutoffDay ? String(a.cutoffDay) : "");
  const [payment, setPayment] = useState(a?.paymentDay ? String(a.paymentDay) : "");
  const [minRate, setMinRate] = useState(a?.minPaymentRate ? String(Math.round(a.minPaymentRate * 100)) : "");
  const [isDefault, setIsDefault] = useState(state.settings.defaultAccountId === id);
  const [errors, setErrors] = useState(null);
  if (!a) return <Sheet title="Hesap" onClose={onClose}><p className="v3-sheet-text">Hesap bulunamadı.</p></Sheet>;
  const credit = type === "credit";
  const prepaid = type === "prepaid";

  const save = () => {
    if (!name.trim()) return setErrors(["hesabın adını yazın"]);
    const minor = a.opening ? parseBalance(balance) : null;
    if (a.opening && minor == null) return setErrors(["açılış bakiyesini rakamla yazın, örneğin 48.265,44"]);
    const rate = minRate.trim() ? Number(minRate.replace(",", ".")) : null;
    if (credit && minRate.trim() && !(rate > 0 && rate <= 100)) return setErrors(["asgari ödeme oranı 1-100 arası yüzde olmalı"]);
    const errs = commit(s => {
      const rec = { ...a, name: name.trim(), type, currency: prepaid ? "TRY" : currency };
      if (a.opening) rec.opening = { ...a.opening, balance: credit ? -Math.abs(minor) : minor };
      delete rec.cutoffDay; delete rec.paymentDay; delete rec.minPaymentRate;
      if (credit) {
        if (cutoff) rec.cutoffDay = Number(cutoff);
        if (payment) rec.paymentDay = Number(payment);
        if (rate) rec.minPaymentRate = rate / 100;
      }
      let next = addAccount(s, rec);
      const def = next.settings.defaultAccountId;
      if (isDefault && !credit && !prepaid) next = { ...next, settings: { ...next.settings, defaultAccountId: id } };
      else if (def === id && (!isDefault || credit || prepaid)) next = { ...next, settings: { ...next.settings, defaultAccountId: null } };
      return next;
    });
    if (errs) setErrors(errs); else { onToast?.("Hesap güncellendi"); onClose(); }
  };
  const remove = () => {
    const errs = commit(s => {
      const next = deleteAccount(s, id);
      return next.settings.defaultAccountId === id ? { ...next, settings: { ...next.settings, defaultAccountId: null } } : next;
    });
    if (errs) setErrors(errs); else { onToast?.("Hesap silindi"); onClose(); }
  };

  return (
    <Sheet title={`Hesap · ${a.name}`} onClose={onClose}>
      <Form onSubmit={save}>
        <Field label="Hesap adı" value={name} onChange={setName} placeholder={credit ? "Örn: Bonus kart" : "Örn: Maaş hesabı"} />
        {used
          ? <p className="v3-hint" style={{ margin: "0 4px 12px" }}>{ACCOUNT_TYPES.find(t => t.value === type)?.label}{currency !== "TRY" ? ` · ${currency}` : ""}. Kayıtları olan hesabın türü ve para birimi değiştirilemez.</p>
          : <>
            <Chips label="Tür" value={type} options={ACCOUNT_TYPES} onChange={v => v && setType(v)} wrap />
            {!credit && !prepaid && <SelectField label="Para birimi" value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />}
          </>}
        {a.opening && (
          <Field label={credit ? `Kart borcu · ${dateText(a.opening.date)}` : `Açılış bakiyesi · ${dateText(a.opening.date)}`} value={balance} onChange={setBalance} inputMode="decimal" placeholder="0,00"
            hint={credit ? "Hesabı eklediğiniz gündeki borç. Değişirse bugünkü bakiye de buna göre yeniden hesaplanır." : "Hesabı eklediğiniz gündeki bakiye. Yanlış yazıldıysa buradan düzeltin; bugünkü bakiye yeniden hesaplanır."} />
        )}
        {credit && <>
          <SelectField label="Hesap kesim günü" value={cutoff} onChange={setCutoff} options={DAYS_OPT}
            hint="Ekstrenin kesildiği gün. Girilirse bloke ve ekstre dönemi buna göre hesaplanır." />
          <SelectField label="Son ödeme günü" value={payment} onChange={setPayment} options={DAYS_OPT}
            hint="Boş bırakılırsa kesimden 10 gün sonrası sayılır." />
          <Field label="Asgari ödeme oranı (%)" value={minRate} onChange={setMinRate} inputMode="decimal" placeholder="Örn: 40"
            hint="Eksiye düşme uyarısındaki 'asgari öde' seçeneği için. Boş bırakılabilir." />
        </>}
        {!credit && !prepaid && (
          <label className="v3-check">
            <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
            <span>Varsayılan hesap — harcamalar ve ödemeler önce bu hesaptan önerilir</span>
          </label>
        )}
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
      {used
        ? <p className="v3-hint" style={{ margin: "12px 4px 0" }}>Bu hesapta kayıt olduğu için silinemez.</p>
        : <DeleteRow label="Hesabı sil" onDelete={remove} />}
    </Sheet>
  );
}

// ── Kategori ───────────────────────────────────────────────────────────────────
export function CategoryEditSheet({ state, commit, onClose, id, onToast }) {
  const c = state.categories[id];
  const used = Object.values(state.transactions).some(t => t.categoryId === id) || Object.values(state.obligations).some(o => o.categoryId === id);
  const [name, setName] = useState(c?.name || "");
  const [budget, setBudget] = useState(c?.budget ? amountText(c.budget) : "");
  const [keywords, setKeywords] = useState((c?.keywords || []).join(", "));
  const [errors, setErrors] = useState(null);
  if (!c) return <Sheet title="Kategori" onClose={onClose}><p className="v3-sheet-text">Kategori bulunamadı.</p></Sheet>;

  const save = () => {
    if (!name.trim()) return setErrors(["kategorinin adını yazın"]);
    const limit = budget.trim() ? parseAmount(budget) : null;
    if (budget.trim() && !limit) return setErrors(["aylık bütçeyi rakamla yazın ya da boş bırakın"]);
    const words = keywords.split(",").map(w => w.trim()).filter(Boolean);
    const errs = commit(s => putRecord(s, "categories", { ...c, name: name.trim(), budget: limit, keywords: words }));
    if (errs) setErrors(errs); else { onToast?.("Kategori güncellendi"); onClose(); }
  };
  const archive = () => {
    const errs = commit(s => archiveCategory(s, id, !c.archived));
    if (errs) setErrors(errs); else { onToast?.(c.archived ? "Kategori arşivden çıkarıldı" : "Kategori arşivlendi"); onClose(); }
  };
  const remove = () => {
    const errs = commit(s => deleteCategory(s, id));
    if (errs) setErrors(errs); else { onToast?.("Kategori silindi"); onClose(); }
  };

  return (
    <Sheet title={`Kategori · ${c.name}`} onClose={onClose}>
      <Form onSubmit={save}>
        <Field label="Kategori adı" value={name} onChange={setName} placeholder="Örn: Market" />
        <Field label="Aylık bütçe (isteğe bağlı)" value={budget} onChange={setBudget} inputMode="decimal" placeholder="Örn: 5.000"
          hint="Limit bu dönemden itibaren geçerli olur; kapanmış dönemlerin raporu değişmez." />
        <Field label="Tanıma kelimeleri (isteğe bağlı)" value={keywords} onChange={setKeywords} placeholder="Örn: migros, bim, a101"
          hint="Açıklamada bu kelimeler geçerse kategori kendiliğinden seçilir. Virgülle ayırın." />
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
      <div className="v3-actions" style={{ marginTop: 8 }}>
        <button type="button" className="v3-cancel" style={{ flex: 1 }} onClick={archive}>{c.archived ? "Arşivden çıkar" : "Arşivle"}</button>
      </div>
      {used
        ? <p className="v3-hint" style={{ margin: "12px 4px 0" }}>Bu kategoride kayıt var; silinemez. Arşivlerseniz listelerde görünmez, geçmiş raporlar bozulmaz.</p>
        : <DeleteRow label="Kategoriyi sil" onDelete={remove} />}
    </Sheet>
  );
}

// ── Düzenli ödeme / gelir / taksit / borç ──────────────────────────────────────
export function ObligationEditSheet({ state, commit, onClose, id, period, onToast }) {
  const o = state.obligations[id];
  const payments = Object.values(state.transactions).filter(t => t.obligationId === id);
  const income = o?.kind === "income";
  const loan = o?.kind === "installment" || o?.kind === "debt";
  const current = o ? amountFor(o, period) : 0;
  const accounts = Object.values(state.accounts).sort(byName);
  const categories = [{ value: "", label: "Kategorisiz" }, ...Object.values(state.categories).filter(c => !c.archived || c.id === o?.categoryId).sort(byName).map(c => ({ value: c.id, label: c.name }))];
  const [name, setName] = useState(o?.name || "");
  const [amount, setAmount] = useState(o ? amountText(current) : "");
  const [accountId, setAccountId] = useState(o?.accountId || "");
  const [categoryId, setCategoryId] = useState(o?.categoryId || "");
  const [day, setDay] = useState(o?.dueDay ? String(o.dueDay) : "");
  const [endAt, setEndAt] = useState("prev");
  const [errors, setErrors] = useState(null);
  if (!o) return <Sheet title="Düzenli ödeme" onClose={onClose}><p className="v3-sheet-text">Kayıt bulunamadı.</p></Sheet>;

  const unit = symbolOf(state.accounts[accountId]?.currency || o.currency);
  const last = lastPeriod(o);
  const info = [
    KIND[o.kind],
    `${periodLabel(o.startPeriod)} döneminden beri`,
    o.count ? `${o.count} taksit${last ? `, son: ${periodLabel(last)}` : ""}` : o.endPeriod ? `son ödeme ${periodLabel(o.endPeriod)}` : "süresiz",
    payments.length ? `${payments.length} ödeme girildi` : "henüz ödeme girilmedi"
  ].join(" · ");
  const changedAmount = o => o.changes?.length ? ` (${periodLabel(o.changes.at(-1).fromPeriod)} döneminden itibaren)` : "";

  const save = () => {
    if (!name.trim()) return setErrors(["adını yazın"]);
    const minor = parseAmount(amount);
    if (!minor) return setErrors(["tutarı girin, örneğin 345 ya da 1.250,50"]);
    const errs = commit(s => {
      const acc = s.accounts[accountId];
      let rec = { ...o, name: name.trim(), accountId, currency: acc?.currency || o.currency, categoryId: income ? null : categoryId || null, dueDay: day ? Number(day) : null };
      if (minor !== current) {
        // Ödeme girilmemişse ana tutar düzelir; girildiyse önceki dönemler korunur, bu dönemden sonrası değişir.
        if (!payments.length) rec = { ...rec, amount: minor, changes: [] };
      }
      const e = validateObligation(s, rec);
      if (e.length) throw new ValidationError(e);
      let next = putRecord(s, "obligations", rec);
      if (minor !== current && payments.length) next = changeObligationAmount(next, id, period, minor);
      return next;
    });
    if (errs) setErrors(errs); else { onToast?.("Kayıt güncellendi"); onClose(); }
  };
  const end = () => {
    const lastP = endAt === "this" ? period : prevPeriod(period);
    const errs = commit(s => endObligation(s, id, lastP));
    if (errs) setErrors(errs); else { onToast?.(`${o.name} sonlandırıldı`); onClose(); }
  };
  const resume = () => {
    const errs = commit(s => { const { endPeriod, ...rest } = s.obligations[id]; return putRecord(s, "obligations", rest); });
    if (errs) setErrors(errs); else { onToast?.(`${o.name} yeniden başlatıldı`); onClose(); }
  };
  const remove = () => {
    const errs = commit(s => deleteObligation(s, id));
    if (errs) setErrors(errs); else { onToast?.("Kayıt silindi"); onClose(); }
  };
  const ended = !!o.endPeriod && o.endPeriod < period;

  return (
    <Sheet title={`${KIND[o.kind]} · ${o.name}`} onClose={onClose}>
      <p className="v3-sheet-text">{info}.</p>
      <Form onSubmit={save}>
        <Field label="Adı" value={name} onChange={setName} placeholder={income ? "Maaş" : "Örn: Kira, elektrik"} />
        <Field label={loan ? `Taksit tutarı (${unit})` : `${periodLabel(period)} döneminden itibaren tutar (${unit})`} value={amount} onChange={setAmount} inputMode="decimal" placeholder="0,00"
          hint={payments.length
            ? `Şu an ${fmt(current)}${changedAmount(o)}. Değişiklik bu dönemden sonrasını etkiler; önceki dönemlerin kaydı korunur.`
            : "Henüz ödeme girilmediği için tutar doğrudan düzeltilir."} />
        <SelectField label={income ? "Yattığı hesap" : "Ödendiği hesap"} value={accountId} onChange={setAccountId} options={accounts.map(a => ({ value: a.id, label: a.name }))} />
        {!income && <SelectField label="Kategori" value={categoryId} onChange={setCategoryId} options={categories} />}
        <SelectField label={income ? "Ayın kaçında yatıyor?" : "Son ödeme günü"} value={day} onChange={setDay} options={DAYS_OPT} />
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
      {ended ? (
        <div className="v3-actions" style={{ marginTop: 8 }}>
          <button type="button" className="v3-cancel" style={{ flex: 1 }} onClick={resume}>Sonlandırmayı kaldır (yeniden başlat)</button>
        </div>
      ) : (
        <>
          <SelectField label="Sonlandırma" value={endAt} onChange={setEndAt}
            options={[{ value: "prev", label: `Bu dönemden itibaren ödeme yok (son: ${periodLabel(prevPeriod(period))})` }, { value: "this", label: `Bu dönem son kez ödensin (son: ${periodLabel(period)})` }]}
            hint="Geçmiş ödemeler silinmez; kalem seçilen dönemden sonra listelerde görünmez." />
          <div className="v3-actions" style={{ marginTop: 0 }}>
            <button type="button" className="v3-cancel" style={{ flex: 1 }} onClick={end}>Sonlandır</button>
          </div>
        </>
      )}
      {payments.length
        ? <p className="v3-hint" style={{ margin: "12px 4px 0" }}>Ödemesi girilmiş kalem silinemez; sonlandırın. Yanlış girilmiş ödemeyi Tüm işlemler'den silebilirsiniz.</p>
        : <DeleteRow label="Kaydı sil" onDelete={remove} />}
    </Sheet>
  );
}
