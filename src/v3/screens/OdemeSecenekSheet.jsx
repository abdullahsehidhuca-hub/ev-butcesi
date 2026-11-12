// Ayarlar > Harcamadaki ödeme seçenekleri: hızlı harcamadaki "Nereden ödendi" düğmeleri ve hangi hesabın hangi düğmede
// çıktığı. Seçeneğin adı değişir, sırası değişir, silinir ya da yenisi eklenir (örn. Yemek kartı); hesap başka seçeneğe
// taşınır ya da harcamada gizlenir. Kayıt çekirdekte doğrulanır (src/core/payMethods.js).
import { useState } from "react";
import { payMethodsOf, accountPayMethod, setPayMethods, HIDDEN_PAY_METHOD } from "../../core/index.js";
import { Sheet, Field, SelectField, Actions, ErrorText, Form } from "../ui.jsx";
import { newId } from "../store.js";

const TYPE_LABEL = { bank: "Banka hesabı", cash: "Nakit", credit: "Kredi kartı", debit: "Banka kartı", prepaid: "Ön ödemeli kart" };
const byName = (a, b) => a.name.localeCompare(b.name, "tr");

export default function OdemeSecenekSheet({ state, commit, onClose, onToast }) {
  const accounts = Object.values(state.accounts).filter(a => a.currency === "TRY" && !a.archived).sort(byName);
  const [methods, setMethods] = useState(() => payMethodsOf(state).map(m => ({ ...m })));
  const [assign, setAssign] = useState(() => Object.fromEntries(accounts.map(a => [a.id, accountPayMethod(state, a) ?? HIDDEN_PAY_METHOD])));
  const [errors, setErrors] = useState(null);

  const rename = (i, name) => setMethods(ms => ms.map((m, j) => j === i ? { ...m, name } : m));
  const move = (i, d) => setMethods(ms => { const n = [...ms]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  // Silinen seçenekteki hesaplar ilk seçeneğe geçer; aşağıdaki listeden değiştirilebilir.
  const remove = i => {
    const gone = methods[i].id;
    const rest = methods.filter((_, j) => j !== i);
    setMethods(rest);
    setAssign(a => Object.fromEntries(Object.entries(a).map(([id, m]) => [id, m === gone ? rest[0].id : m])));
  };
  // Yeni seçenekler çoğunlukla yemek ya da hediye kartı gibi ön ödemeli kartlardır; "ekle" bu türle açılır.
  const add = () => setMethods(ms => [...ms, { id: newId(), name: "", accountType: "prepaid" }]);
  const save = () => {
    // Yalnız yeni listeye göre seçeneği değişen hesaplar yazılır; diğer hesaplar türlerinin varsayılanında kalır.
    const next = { ...state, settings: { ...state.settings, payMethods: methods } };
    const changed = Object.fromEntries(Object.entries(assign).filter(([id, m]) => (accountPayMethod(next, state.accounts[id], methods) ?? HIDDEN_PAY_METHOD) !== m));
    const errs = commit(s => setPayMethods(s, methods, changed));
    if (errs) setErrors(errs); else { onToast?.("Ödeme seçenekleri kaydedildi"); onClose(); }
  };
  const options = [...methods.map(m => ({ value: m.id, label: m.name.trim() || "Adsız seçenek" })), { value: HIDDEN_PAY_METHOD, label: "Harcamada gösterme" }];

  return (
    <Sheet title="Harcamadaki ödeme seçenekleri" onClose={onClose}>
      <p className="v3-sheet-text">Harcama eklerken "Nereden ödendi" satırında görünen düğmeler. Adlarını değiştirebilir, sıralayabilir, silebilir ya da yeni seçenek (örneğin Yemek kartı) ekleyebilirsiniz.</p>
      <Form onSubmit={save}>
        {methods.map((m, i) => (
          <div key={m.id} className="pm-item">
            <Field label={`${i + 1}. seçenek`} value={m.name} onChange={v => rename(i, v)} placeholder="Örn: Yemek kartı" invalid={!!errors && !m.name.trim()} />
            <div className="pm-tools">
              <button type="button" className="v3-link" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${m.name || "Seçeneği"} yukarı taşı`}>Yukarı</button>
              <button type="button" className="v3-link" disabled={i === methods.length - 1} onClick={() => move(i, 1)} aria-label={`${m.name || "Seçeneği"} aşağı taşı`}>Aşağı</button>
              <button type="button" className="v3-link c-red" disabled={methods.length === 1} onClick={() => remove(i)} aria-label={`${m.name || "Seçeneği"} sil`}>Sil</button>
            </div>
          </div>
        ))}
        <button type="button" className="v3-link" style={{ margin: "0 4px 14px" }} onClick={add}>+ Seçenek ekle</button>

        {accounts.length > 0 && <>
          <p className="v3-sheet-text" style={{ marginTop: 6 }}>Hangi hesap hangi düğmede görünsün? Aynı düğmede birden çok hesap olabilir; harcamada hangisi olduğu ayrıca seçilir.</p>
          {accounts.map(a => (
            <SelectField key={a.id} label={`${a.name} · ${TYPE_LABEL[a.type] || a.type}`} value={assign[a.id]} options={options}
              onChange={v => setAssign(x => ({ ...x, [a.id]: v }))} />
          ))}
        </>}
        {Object.values(state.accounts).some(a => a.currency !== "TRY") && <p className="v3-hint" style={{ marginBottom: 8 }}>Döviz ve altın hesapları harcamada listelenmez.</p>}
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
    </Sheet>
  );
}
