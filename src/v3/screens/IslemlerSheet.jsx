// Tüm işlemler (eski uygulamadaki "Aylık işlem geçmişi" karşılığı): dönem süzgeci, arama, düzenleme ve silme.
// Düzenleme çekirdekteki updateTransaction / deleteTransaction ile yapılır; kapalı dönemin kaydı değişmez.
import { useState } from "react";
import { updateTransaction, deleteTransaction, txPeriod } from "../../core/index.js";
import { Sheet, Field, SelectField, ErrorText, Actions, Form } from "../ui.jsx";
import { parseAmount, amountText } from "../format.js";
import { transactionsView, periodLabel, fmt } from "../selectors.js";
import { TxRow } from "./Ozet.jsx";

export function TxListSheet({ state, onClose, onEdit, members = {}, initial }) {
  const [period, setPeriod] = useState(initial?.period || "all");
  const [query, setQuery] = useState(initial?.query || "");
  const v = transactionsView(state, { period, query });
  const memberList = Object.values(members);
  const options = [{ value: "all", label: "Tüm dönemler" }, ...v.periods.map(p => ({ value: p, label: `${periodLabel(p)}${v.closed(p) ? " · kapalı" : ""}` }))];
  return (
    <Sheet title="Tüm işlemler" onClose={onClose}>
      <Field label="Ara" value={query} onChange={setQuery} type="search" placeholder="Açıklama, kategori, hesap ya da tutar" />
      <SelectField label="Dönem" value={period} onChange={setPeriod} options={options} />
      <p className="t-meta" role="status" style={{ margin: "0 4px 8px" }}>
        {v.list.length} işlem{v.list.length ? ` · net ${fmt(v.net)}` : ""}
      </p>
      <section className="list" aria-label="İşlemler" style={{ "--inset": "64px" }}>
        {v.list.map(t => (
          <TxRow key={t.id} t={t} state={state} member={memberList.length > 1 ? members[t.createdBy] : null}
            onClick={() => onEdit(t.id, { period, query })} />
        ))}
        {!v.list.length && <p className="t-sub" style={{ margin: 0, padding: 16 }}>{query ? "Aramaya uyan işlem yok." : "Bu dönemde işlem yok."}</p>}
      </section>
    </Sheet>
  );
}

const byName = (a, b) => a.name.localeCompare(b.name, "tr");
const TYPE = { expense: "Harcama", income: "Gelir", refund: "İade", transfer: "Aktarım" };

export function TxEditSheet({ state, commit, onClose, id, onToast }) {
  const t = state.transactions[id];
  const [amount, setAmount] = useState(t ? amountText(t.amount) : "");
  const [date, setDate] = useState(t?.date || "");
  const [note, setNote] = useState(t?.note || "");
  const [categoryId, setCategoryId] = useState(t?.categoryId || "");
  const [accountId, setAccountId] = useState(t?.accountId || "");
  const [toAccountId, setToAccountId] = useState(t?.toAccountId || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState(null);

  if (!t) {
    return (
      <Sheet title="İşlem bulunamadı" onClose={onClose}>
        <p className="v3-sheet-text">Bu işlem silinmiş olabilir.</p>
        <Form onSubmit={onClose}><Actions submit="Tamam" onCancel={onClose} /></Form>
      </Sheet>
    );
  }

  const period = txPeriod(t, state.settings.payDay);
  const closed = !!state.closedPeriods?.[period];
  const ob = t.obligationId && state.obligations[t.obligationId];
  const transfer = t.type === "transfer";
  const hasCategory = !ob && !t.adjustment && (t.type === "expense" || t.type === "refund");
  const accounts = Object.values(state.accounts).sort(byName).map(a => ({ value: a.id, label: a.name }));
  const categories = [{ value: "", label: "Kategorisiz" }, ...Object.values(state.categories)
    .filter(c => !c.archived || c.id === t.categoryId).sort(byName).map(c => ({ value: c.id, label: c.name }))];
  const title = `${TYPE[t.type] || "İşlem"} · ${ob ? ob.name : t.note || "düzenle"}`;

  if (closed) {
    return (
      <Sheet title={title} onClose={onClose}>
        <p className="v3-sheet-text">{periodLabel(period)} dönemi kapatıldı; rakamları dondurulduğu için bu kayıt değiştirilemez. Bir düzeltme gerekiyorsa bu döneme yeni bir kayıt ekleyin.</p>
        <p className="v3-sheet-text">Tutar <b className="num">{fmt(t.amount)}</b> · {t.date} · {state.accounts[t.accountId]?.name}</p>
        <Form onSubmit={onClose}><Actions submit="Tamam" onCancel={onClose} /></Form>
      </Sheet>
    );
  }

  const save = () => {
    const minor = parseAmount(amount);
    if (!minor) return setErrors(["tutarı girin, örneğin 345 ya da 1.250,50"]);
    if (!date) return setErrors(["tarihi seçin"]);
    const changes = { amount: minor, date, note: note.trim() || undefined, accountId, currency: state.accounts[accountId]?.currency || t.currency };
    if (hasCategory) changes.categoryId = categoryId || null;
    if (transfer) changes.toAccountId = toAccountId;
    const errs = commit(s => updateTransaction(s, id, changes));
    if (errs) setErrors(errs); else { onToast?.("İşlem güncellendi"); onClose(); }
  };
  const remove = () => {
    const errs = commit(s => deleteTransaction(s, id));
    if (errs) setErrors(errs); else { onToast?.("İşlem silindi"); onClose(); }
  };

  return (
    <Sheet title={title} onClose={onClose}>
      {ob && <p className="v3-sheet-text">{ob.name} için {periodLabel(period)} dönemine ait {t.type === "income" ? "gelir kaydı. Silerseniz yeniden beklenen gelir olarak görünür." : "ödeme. Silerseniz kalem yeniden ödenecek olarak görünür."}</p>}
      <Form onSubmit={save}>
        <Field label="Tutar (₺)" value={amount} onChange={setAmount} inputMode="decimal" placeholder="0,00" invalid={!!errors && !parseAmount(amount)} />
        <Field label="Tarih" type="date" value={date} onChange={setDate}
          hint={ob ? "Tarih değişse de ödeme ait olduğu dönemde kalır." : "Tarih başka bir döneme düşerse işlem o döneme geçer."} />
        <Field label="Açıklama" value={note} onChange={setNote} placeholder="Örn: Market alışverişi" />
        {hasCategory && <SelectField label="Kategori" value={categoryId} onChange={setCategoryId} options={categories} />}
        <SelectField label={transfer ? "Çıkan hesap" : t.type === "income" ? "Yatan hesap" : "Hesap"} value={accountId} onChange={setAccountId} options={accounts} />
        {transfer && <SelectField label="Giden hesap" value={toAccountId} onChange={setToAccountId} options={accounts} />}
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
      <div className="v3-actions" style={{ marginTop: 8 }}>
        {confirmDelete ? (
          <>
            <button type="button" className="v3-cancel" onClick={() => setConfirmDelete(false)}>Silme</button>
            <button type="button" className="v3-submit is-danger" onClick={remove}>Evet, sil</button>
          </>
        ) : (
          <button type="button" className="v3-cancel c-red" style={{ flex: 1 }} onClick={() => setConfirmDelete(true)}>İşlemi sil</button>
        )}
      </div>
    </Sheet>
  );
}
