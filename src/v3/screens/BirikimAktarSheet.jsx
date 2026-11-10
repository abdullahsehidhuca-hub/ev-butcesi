// Birikimden serbest tutara aktarım: birikim hesabından harcama hesabına para geçer ve bu dönemin serbest
// tutarına eklenir. Gelir sayılmaz; birikim hesabının bakiyesi düştüğü için hedefin biriken tutarı da düşer.
import { useState } from "react";
import { savingsToBudget, balanceOf, ratesOf, toBase, formatUnits } from "../../core/index.js";
import { Sheet, Field, SelectField, ErrorText, Actions, Form } from "../ui.jsx";
import { parseAmount } from "../format.js";
import { newId } from "../store.js";
import { mainAccountId, fmt } from "../selectors.js";

const UNIT = { TRY: "₺", USD: "$", EUR: "€", XAU: "gram" };

export default function BirikimAktarSheet({ state, commit, onClose, today, onToast }) {
  const main = mainAccountId(state);
  const rates = ratesOf(state);
  const accounts = Object.values(state.accounts).filter(a => a.type !== "credit" && !a.archived).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const goalAccounts = new Set(Object.values(state.goals || {}).flatMap(g => g.accountIds || []));
  // Önce hedefe bağlı birikim hesapları, sonra diğerleri.
  const sources = accounts.filter(a => a.id !== main).sort((a, b) => goalAccounts.has(b.id) - goalAccounts.has(a.id));
  const [fromAccountId, setFrom] = useState(sources[0]?.id || "");
  const [toAccountId, setTo] = useState(main);
  const [amount, setAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [errors, setErrors] = useState(null);
  const from = state.accounts[fromAccountId];
  const to = state.accounts[toAccountId];
  const foreign = from && to && from.currency !== to.currency;
  const minor = parseAmount(amount);
  const tl = from && minor ? toBase(minor, from.currency, rates) : null;
  const balance = from ? balanceOf(state, from.id, today) : 0;

  const save = () => {
    if (!from) return setErrors(["birikim hesabını seçin"]);
    if (!minor) return setErrors([`aktarılan tutarı girin (${UNIT[from.currency]})`]);
    const into = foreign ? parseAmount(toAmount) : undefined;
    if (foreign && !into && tl == null) return setErrors([`${from.currency} kuru girilmemiş; hesaba giren tutarı yazın`]);
    const errs = commit(s => savingsToBudget(s, { fromAccountId, toAccountId, amount: minor, toAmount: into || undefined, id: newId(), date: today, now: new Date() }));
    if (errs) return setErrors(errs);
    onToast?.("Birikimden serbest tutara aktarıldı");
    onClose();
  };

  return (
    <Sheet title="Birikimden serbest tutara aktar" onClose={onClose}>
      <p className="v3-sheet-text">Aktarılan tutar bu dönemin serbest tutarına eklenir ve birikimden düşer. Gelir olarak sayılmaz.</p>
      {!sources.length ? (
        <>
          <p className="v3-sheet-text">Birikim hesabı yok. Önce Ayarlar'dan bir birikim hesabı ekleyin.</p>
          <Form onSubmit={onClose}><Actions submit="Tamam" onCancel={onClose} /></Form>
        </>
      ) : (
        <Form onSubmit={save}>
          <SelectField label="Hangi birikimden" value={fromAccountId} onChange={setFrom}
            options={sources.map(a => ({ value: a.id, label: `${a.name} · ${a.currency === "TRY" ? fmt(balanceOf(state, a.id, today)) : formatUnits(balanceOf(state, a.id, today), a.currency)}` }))} />
          <Field label={`Tutar (${UNIT[from?.currency] || "₺"})`} value={amount} onChange={setAmount} inputMode="decimal" placeholder="0"
            hint={from && from.currency !== "TRY" ? (tl != null ? `Girilen kura göre yaklaşık ${fmt(tl)}.` : `${from.currency} kuru girilmemiş.`) : null} invalid={!!errors} />
          <SelectField label="Hangi hesaba" value={toAccountId} onChange={setTo}
            options={accounts.filter(a => a.id !== fromAccountId).map(a => ({ value: a.id, label: a.name }))} />
          {foreign && <Field label={`Hesaba giren tutar (${UNIT[to.currency]}, isteğe bağlı)`} value={toAmount} onChange={setToAmount} inputMode="decimal" hint="Boş bırakılırsa girilen kurdan hesaplanır." />}
          {minor > balance && <p className="v3-alert" role="status" style={{ margin: "8px 0" }}><strong>Birikim yetmiyor</strong>Aktarımdan sonra {from.name} eksiye düşer.</p>}
          <ErrorText errors={errors} />
          <Actions submit="Aktar" onCancel={onClose} />
        </Form>
      )}
    </Sheet>
  );
}
