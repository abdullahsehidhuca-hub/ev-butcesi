// Tüm işlemler (eski uygulamadaki "Aylık işlem geçmişi" karşılığı): dönem süzgeci, arama, düzenleme ve silme.
// Düzenleme çekirdekteki updateTransaction / deleteTransaction ile yapılır; kapalı dönemin kaydı değişmez.
// Döviz/altın alım-satımında çıkan tutar ve alınan miktar ayrı düzenlenir. Devreden kararıyla oluşan kayıt
// silinince karar da geri alınır (undoCarryover) ve dönem yeniden karar bekler.
import { useState } from "react";
import { updateTransaction, deleteTransaction, undoCarryover, txPeriod, isCardExpense, markCardTransferred } from "../../core/index.js";
import { Sheet, Field, SelectField, ErrorText, Actions, Form } from "../ui.jsx";
import { parseAmount, amountText, symbolOf } from "../format.js";
import { transactionsView, periodLabel, fmt } from "../selectors.js";
import { TxRow } from "./Ozet.jsx";

export function TxListSheet({ state, onClose, onEdit, members = {}, initial }) {
  const [period, setPeriod] = useState(initial?.period || "all");
  const [query, setQuery] = useState(initial?.query || "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "all");
  const v = transactionsView(state, { period, query, categoryId });
  const memberList = Object.values(members);
  const options = [{ value: "all", label: "Tüm dönemler" }, ...v.periods.map(p => ({ value: p, label: `${periodLabel(p)}${v.closed(p) ? " · kapalı" : ""}` }))];
  const cats = [{ value: "all", label: "Tüm kategoriler" }, ...Object.values(state.categories).sort(byName).map(c => ({ value: c.id, label: c.archived ? `${c.name} · arşiv` : c.name })), { value: "_none", label: "Kategorisiz harcamalar" }];
  const title = categoryId !== "all" ? `${cats.find(c => c.value === categoryId)?.label.replace(" · arşiv", "") || "Kategori"} işlemleri` : "Tüm işlemler";
  return (
    <Sheet title={title} onClose={onClose}>
      <Field label="Ara" value={query} onChange={setQuery} type="search" placeholder="Açıklama, kategori, hesap ya da tutar" />
      <SelectField label="Dönem" value={period} onChange={setPeriod} options={options} />
      <SelectField label="Kategori" value={categoryId} onChange={setCategoryId} options={cats} />
      <p className="t-meta" role="status" style={{ margin: "0 4px 8px" }}>
        {v.list.length} işlem{v.list.length ? ` · net ${fmt(v.net)}` : ""}
      </p>
      <section className="list" aria-label="İşlemler" style={{ "--inset": "64px" }}>
        {v.list.map(t => (
          <TxRow key={t.id} t={t} state={state} member={memberList.length > 1 ? members[t.createdBy] : null}
            onClick={() => onEdit(t.id, { period, query, categoryId })} />
        ))}
        {!v.list.length && <p className="t-sub" style={{ margin: 0, padding: 16 }}>{query ? "Aramaya uyan işlem yok." : categoryId !== "all" ? "Bu kategoride işlem yok." : "Bu dönemde işlem yok."}</p>}
      </section>
    </Sheet>
  );
}

const byName = (a, b) => a.name.localeCompare(b.name, "tr");
const TYPE = { expense: "Harcama", income: "Gelir", refund: "İade", transfer: "Aktarım", exchange: "Döviz/altın alım-satımı" };

// "Karta aktarıldı" onay kutusu: kredi kartı harcamasının karşılığı bankadan karta aktarıldı mı.
function TransferCheck({ checked, onChange, since }) {
  return (
    <label className="row" style={{ gap: 12, minHeight: 44, margin: "4px 0 8px", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
      <span className="stack gap2">
        <span className="t-sub" style={{ color: "var(--label)" }}>Karta aktarıldı</span>
        <span className="t-meta">{checked && since ? `${since} tarihinde işaretlendi` : "Karşılığı bankadan kart hesabına aktarıldıysa işaretleyin."}</span>
      </span>
    </label>
  );
}

export function TxEditSheet({ state, commit, onClose, id, onToast, today }) {
  const t = state.transactions[id];
  const [amount, setAmount] = useState(t ? amountText(t.amount) : "");
  const [date, setDate] = useState(t?.date || "");
  const [note, setNote] = useState(t?.note || "");
  const [categoryId, setCategoryId] = useState(t?.categoryId || "");
  const [accountId, setAccountId] = useState(t?.accountId || "");
  const [toAccountId, setToAccountId] = useState(t?.toAccountId || "");
  const [toAmount, setToAmount] = useState(t?.toAmount ? amountText(t.toAmount) : "");
  const [transferred, setTransferred] = useState(!!t?.cardTransferredAt);
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
  const transfer = t.type === "transfer" || t.type === "exchange";
  const exchange = t.type === "exchange";
  const unit = id => symbolOf(state.accounts[id]?.currency || t.currency);
  const hasCategory = !ob && !t.adjustment && (t.type === "expense" || t.type === "refund");
  // Seçili hesap kredi kartıysa bayrak gösterilir (hesap değiştirildikçe güncellenir).
  const cardExpense = isCardExpense(state, { ...t, accountId });
  const flagDate = today || date;
  const accounts = Object.values(state.accounts).sort(byName).map(a => ({ value: a.id, label: a.name }));
  const categories = [{ value: "", label: "Kategorisiz" }, ...Object.values(state.categories)
    .filter(c => !c.archived || c.id === t.categoryId).sort(byName).map(c => ({ value: c.id, label: c.name }))];
  const title = `${TYPE[t.type] || "İşlem"} · ${ob ? ob.name : t.note || "düzenle"}`;

  if (closed) {
    // Kapalı dönemde rakamlar donmuştur; aktarım bayrağı tutarı değiştirmediği için yine de işaretlenebilir.
    const toggle = () => {
      const errs = commit(s => markCardTransferred(s, id, t.cardTransferredAt ? null : flagDate));
      if (errs) setErrors(errs); else onToast?.(t.cardTransferredAt ? "Aktarım işareti kaldırıldı" : "Karta aktarıldı olarak işaretlendi");
    };
    return (
      <Sheet title={title} onClose={onClose}>
        <p className="v3-sheet-text">{periodLabel(period)} dönemi kapatıldı; rakamları dondurulduğu için bu kayıt değiştirilemez. Bir düzeltme gerekiyorsa bu döneme yeni bir kayıt ekleyin.</p>
        <p className="v3-sheet-text">Tutar <b className="num">{fmt(t.amount)}</b> · {t.date} · {state.accounts[t.accountId]?.name}</p>
        {isCardExpense(state, t) && (
          <p className="v3-sheet-text">
            {t.cardTransferredAt ? `Karta aktarıldı (${t.cardTransferredAt}). ` : "Karta aktarıldı olarak işaretlenmedi. "}
            <button type="button" className="v3-link" style={{ padding: 0, minHeight: 44 }} onClick={toggle}>
              {t.cardTransferredAt ? "İşareti kaldır" : "Karta aktarıldı işaretle"}
            </button>
          </p>
        )}
        <ErrorText errors={errors} />
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
    if (exchange) {
      const into = parseAmount(toAmount);
      if (!into) return setErrors([`alınan miktarı girin (${unit(toAccountId)})`]);
      changes.toAmount = into;
    }
    const errs = commit(s => {
      let next = updateTransaction(s, id, changes);
      const nt = next.transactions[id];
      if (isCardExpense(next, nt) && transferred !== !!nt.cardTransferredAt) {
        next = markCardTransferred(next, id, transferred ? flagDate : null);
      }
      return next;
    });
    if (errs) setErrors(errs); else { onToast?.("İşlem güncellendi"); onClose(); }
  };
  const remove = () => {
    const errs = commit(s => t.carryover ? undoCarryover(s, t.carryover) : deleteTransaction(s, id));
    if (errs) setErrors(errs); else { onToast?.(t.carryover ? "İşlem silindi; devreden kararı geri alındı" : "İşlem silindi"); onClose(); }
  };

  return (
    <Sheet title={title} onClose={onClose}>
      {t.carryover && <p className="v3-sheet-text">Bu kayıt {periodLabel(t.carryover)} devredeni kararıyla oluştu. Silerseniz karar da geri alınır ve devreden yeniden karar bekler.</p>}
      {ob && <p className="v3-sheet-text">{ob.name} için {periodLabel(period)} dönemine ait {t.type === "income" ? "gelir kaydı. Silerseniz yeniden beklenen gelir olarak görünür." : "ödeme. Silerseniz kalem yeniden ödenecek olarak görünür."}</p>}
      <Form onSubmit={save}>
        <Field label={exchange ? `Çıkan tutar (${unit(accountId)})` : `Tutar (${unit(accountId)})`} value={amount} onChange={setAmount} inputMode="decimal" placeholder="0,00" invalid={!!errors && !parseAmount(amount)} />
        <Field label="Tarih" type="date" value={date} onChange={setDate}
          hint={ob ? "Tarih değişse de ödeme ait olduğu dönemde kalır." : "Tarih başka bir döneme düşerse işlem o döneme geçer."} />
        <Field label="Açıklama" value={note} onChange={setNote} placeholder="Örn: Market alışverişi" />
        {hasCategory && <SelectField label="Kategori" value={categoryId} onChange={setCategoryId} options={categories} />}
        <SelectField label={transfer ? "Çıkan hesap" : t.type === "income" ? "Yatan hesap" : "Hesap"} value={accountId} onChange={setAccountId} options={accounts} />
        {transfer && <SelectField label="Giden hesap" value={toAccountId} onChange={setToAccountId} options={accounts} />}
        {exchange && <Field label={`Alınan miktar (${unit(toAccountId)})`} value={toAmount} onChange={setToAmount} inputMode="decimal" placeholder="0"
          hint="Giden hesaba giren miktar, kendi cinsinden." invalid={!!errors && !parseAmount(toAmount)} />}
        {cardExpense && <TransferCheck checked={transferred} onChange={setTransferred} since={t.cardTransferredAt} />}
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
