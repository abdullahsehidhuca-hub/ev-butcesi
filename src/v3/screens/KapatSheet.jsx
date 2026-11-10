// Ay kapatma (eski uygulamadaki ay kapatma ritüeli). Dönemin özetini gösterir, açık kalan her ödeme için
// karar alır ve çekirdekteki closePeriod ile dönemi dondurur. Kararlar:
//  carry: sonraki döneme tek seferlik kalem olarak taşı · defer: bu dönemi atla (taksit/borçta takvim uzar)
//  drop: yok say (ödendi ama girilmedi ya da gerek kalmadı)
// Kapanıştan sonra devreden (artan ya da açık kalan para) için karar ekranı açılır (DevredenSheet);
// devreden yeni dönemin serbest tutarına eklenmez.
import { useState } from "react";
import { closePeriod } from "../../core/index.js";
import { Sheet, ErrorText, Actions, Form } from "../ui.jsx";
import { closeCandidate, periodLabel, nextPeriod, fmt } from "../selectors.js";

const CHOICES = {
  carry: "Gelecek aya taşı",
  defer: "Ertele (taksit bir ay uzar)",
  drop: "Yok say"
};
const choicesFor = item => item.kind === "installment" || item.kind === "debt" ? ["carry", "defer", "drop"] : ["carry", "drop"];

export default function KapatSheet({ state, commit, onClose, today, onToast, onPay, onCarryover }) {
  const c = closeCandidate(state, today);
  const [decisions, setDecisions] = useState({});
  const [errors, setErrors] = useState(null);

  if (!c) {
    return (
      <Sheet title="Ay kapatma" onClose={onClose}>
        <p className="v3-sheet-text">Kapatılmayı bekleyen geçmiş dönem yok. Bu dönem bittiğinde burada sizi bekleyecek.</p>
        <Form onSubmit={onClose}><Actions submit="Tamam" onCancel={onClose} /></Form>
      </Sheet>
    );
  }

  const s = c.summary;
  const next = periodLabel(nextPeriod(c.period));
  const carried = c.open.filter(i => (decisions[i.obligationId] || "carry") === "carry");
  // Taşınan ya da ertelenen ödeme sonraki dönemde yeniden gider sayılır; devredene geri eklenir.
  const carryover = s.remaining + c.open.filter(i => (decisions[i.obligationId] || "carry") !== "drop").reduce((a, i) => a + i.open, 0);
  const save = () => {
    const errs = commit(st => closePeriod(st, c.period, { decisions, closedAt: new Date().toISOString() }));
    if (errs) return setErrors(errs);
    onToast?.(`${periodLabel(c.period)} kapatıldı`);
    if (carryover !== 0 && onCarryover) onCarryover(c.period); else onClose();
  };
  const line = (label, value, cls = "") => (
    <div className="row between" style={{ minHeight: 32 }}><span className="t-sub">{label}</span><span className={`num t-body b ${cls}`}>{value}</span></div>
  );

  return (
    <Sheet title={`${periodLabel(c.period)} dönemini kapat`} onClose={onClose}>
      <p className="v3-sheet-text">
        Kapatılan dönemin rakamları dondurulur; sonradan ayar ya da kayıt değişse de raporu değişmez.
        {c.waiting > 0 && ` Ardından ${c.waiting} dönem daha sırayla kapatılacak.`}
      </p>
      <section className="card" aria-label="Dönem özeti" style={{ marginBottom: 14 }}>
        {line("Gelir", fmt(s.income.total), "c-green")}
        {line("Düzenli ödemeler", `−${fmt(s.obligations.total)}`)}
        {line("Harcamalar", `−${fmt(s.spending.total)}`)}
        {line("Dönem sonucu", fmt(s.remaining), s.remaining < 0 ? "c-red" : "")}
        {line(carryover < 0 ? "Devreden açık" : "Devreden", fmt(carryover), carryover < 0 ? "c-red" : "")}
        {carryover !== 0 && <p className="t-meta" style={{ margin: "4px 0 0" }}>Serbest tutara eklenmez. Dönemi kapatınca ne yapılacağını seçeceksiniz.</p>}
      </section>

      {c.open.length > 0 ? (
        <fieldset className="v3-field" style={{ border: 0, padding: 0, margin: "0 0 8px" }}>
          <legend className="v3-label">Açık kalan ödemeler · {fmt(c.open.reduce((a, i) => a + i.open, 0))}</legend>
          <p className="v3-hint" style={{ marginTop: 0 }}>Ödediyseniz ama girmediyseniz önce "Ödendi" deyin; bankadaki tutar ancak böyle doğru kalır.</p>
          {c.open.map(item => {
            const value = decisions[item.obligationId] || "carry";
            const id = `close-${item.obligationId}`;
            return (
              <div key={item.obligationId} className="card stack gap8" style={{ marginBottom: 10 }}>
                <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
                  <span className="stack gap2">
                    <span className="t-body b">{item.name}</span>
                    <span className="t-meta">{item.index && item.total ? `Taksit ${item.index}/${item.total} · ` : ""}açık {fmt(item.open)}</span>
                  </span>
                  {onPay && <button type="button" className="v3-link" onClick={() => onPay(item, c.period)}>Ödendi</button>}
                </div>
                <label className="v3-label" htmlFor={id} style={{ margin: 0 }}>Ne olsun?</label>
                <select id={id} className="v3-input" value={value} onChange={e => setDecisions(d => ({ ...d, [item.obligationId]: e.target.value }))}>
                  {choicesFor(item).map(k => <option key={k} value={k}>{CHOICES[k]}</option>)}
                </select>
              </div>
            );
          })}
          {carried.length > 0 && <p className="v3-hint">{carried.length} kalem {next} dönemine "(devir)" olarak eklenecek.</p>}
        </fieldset>
      ) : (
        <p className="v3-sheet-text">Bu dönemde açık ödeme kalmadı.</p>
      )}

      <Form onSubmit={save}>
        <ErrorText errors={errors} />
        <Actions submit="Dönemi kapat" onCancel={onClose} />
      </Form>
    </Sheet>
  );
}
