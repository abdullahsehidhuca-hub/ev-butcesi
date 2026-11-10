// Kart ödeme ayarı: kredi kartı ekstresi hangi ayın bütçesinden ödensin? Genel varsayılan + kart bazında.
// Değişiklik bugünden itibaren geçerlidir; önceki harcamalar yapıldıkları gün geçerli olan kurala göre kalır.
// "Ödendiği ay"dan "harcandığı ay"a geçişte geçiş ayındaki ek yük kaydetmeden önce gösterilir.
import { useState } from "react";
import { setCardBudgetMode, cardBudgetModeAt, cardModeChangeImpact } from "../../core/index.js";
import { Sheet, SelectField, ErrorText, Actions, Form } from "../ui.jsx";
import { fmt } from "../selectors.js";

export const MODE_LABEL = { spend: "Harcamanın yapıldığı ayın bütçesinden", pay: "Ekstrenin ödendiği ayın bütçesinden" };
const MODES = [{ value: "spend", label: `${MODE_LABEL.spend} (önerilen)` }, { value: "pay", label: MODE_LABEL.pay }];
const SHORT = { spend: "harcandığı ay", pay: "ödendiği ay" };
const FOLLOW = "_default";
const latest = (list, date) => (list || []).filter(e => e.from <= date).sort((a, b) => a.from.localeCompare(b.from)).at(-1);

export const globalModeAt = (state, date) => latest(state.settings?.cardBudgetModes, date)?.mode || "spend";

export default function KartOdemeSheet({ state, commit, onClose, today, onToast }) {
  const cards = Object.values(state.accounts).filter(a => a.type === "credit" && !a.archived).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const ownOf = a => latest(a.budgetModes, today)?.mode || FOLLOW;
  const [global, setGlobal] = useState(globalModeAt(state, today));
  const [own, setOwn] = useState(() => Object.fromEntries(cards.map(a => [a.id, ownOf(a)])));
  const [errors, setErrors] = useState(null);

  const apply = s => {
    let next = s;
    if (global !== globalModeAt(s, today)) next = setCardBudgetMode(next, { mode: global, from: today });
    for (const a of cards) {
      if (own[a.id] !== ownOf(a)) next = setCardBudgetMode(next, { accountId: a.id, mode: own[a.id] === FOLLOW ? null : own[a.id], from: today });
    }
    return next;
  };
  // Geçiş etkisi: kaydedilecek durumla bugünkü durum arasında harcandığı aya geçen kartlar.
  let preview = null;
  try { preview = apply(state); } catch { preview = null; }
  const switching = preview ? cards.filter(a => cardBudgetModeAt(state, a, today) === "pay" && cardBudgetModeAt(preview, preview.accounts[a.id], today) === "spend") : [];
  const extra = switching.map(a => ({ name: a.name, extra: cardModeChangeImpact(state, { accountId: a.id, mode: "spend", from: today }).extra })).filter(x => x.extra > 0);

  const save = () => {
    const errs = commit(apply);
    if (errs) return setErrors(errs);
    onToast?.("Kart ödeme ayarı kaydedildi");
    onClose();
  };

  return (
    <Sheet title="Kart ekstresi hangi bütçeden?" onClose={onClose}>
      <p className="v3-sheet-text">
        <b>Harcamanın yapıldığı ay:</b> kartla yapılan her harcama o gün serbest tutardan düşer ve ekstreye kadar bloke edilir. Taksitte her ay yalnız o ayın taksiti düşer.
        {" "}<b>Ekstrenin ödendiği ay:</b> ekstre, ödendiği ayın başında zorunlu gider olarak düşülür; henüz ekstreye girmemiş harcamalar gelecek dönem yükü olarak görünür.
      </p>
      <Form onSubmit={save}>
        <SelectField label="Varsayılan (tüm kartlar)" value={global} onChange={setGlobal} options={MODES} />
        {cards.map(a => (
          <SelectField key={a.id} label={a.name} value={own[a.id]} onChange={v => setOwn(o => ({ ...o, [a.id]: v }))}
            options={[{ value: FOLLOW, label: `Varsayılanı izle (${SHORT[global]})` }, ...MODES]} />
        ))}
        <p className="v3-hint">Değişiklik bugünden itibaren yapılan harcamalara uygulanır; önceki harcamalar yapıldıkları günkü kurala göre kalır, iki kez sayılmaz.</p>
        {extra.length > 0 && (
          <p className="v3-alert" role="status" style={{ margin: "8px 0" }}>
            <strong>Geçiş ayında ek yük: {fmt(extra.reduce((s, x) => s + x.extra, 0))}</strong>
            {extra.map(x => `${x.name}: önceki harcamaların ekstresi ${fmt(x.extra)}`).join(" · ")}. Bu ay hem bu ekstre hem yeni kart harcamaları bütçeden düşer.
          </p>
        )}
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
    </Sheet>
  );
}
