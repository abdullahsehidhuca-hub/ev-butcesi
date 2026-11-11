// Taksit denemesi: "bu taksiti alırsam ne olur?" Kayıt yapmaz; motorun projeksiyonunu geçici bir taksitle
// yeniden hesaplar ve önümüzdeki 6 ayın planlanan kalanını taksitsiz / taksitli yan yana gösterir.
// Beğenilirse "Taksit olarak kaydet" aynı değerlerle kayıt çekmecesini açar.
import { useState } from "react";
import { periodOf, nextPeriod } from "../../core/index.js";
import { Sheet, Field, SelectField, Chips, ErrorText, Form } from "../ui.jsx";
import { parseAmount } from "../format.js";
import { installmentTrial, fmt, periodLabel } from "../selectors.js";

const COUNTS = [2, 3, 4, 5, 6, 8, 9, 10, 12, 18, 24, 36].map(n => ({ value: String(n), label: `${n} taksit` }));
const monthOf = p => periodLabel(p).split(" ")[0];

export default function TaksitDeneSheet({ state, onClose, today, onSave }) {
  const payDay = state.settings?.payDay || 1;
  const period = periodOf(today, payDay);
  const accounts = Object.values(state.accounts).filter(a => !a.archived).sort((a, b) => (b.type === "credit") - (a.type === "credit"));
  const [total, setTotal] = useState("");
  const [count, setCount] = useState("6");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [start, setStart] = useState(period);
  const minor = parseAmount(total);
  let trial = null, error = null;
  if (minor && accountId) {
    try { trial = installmentTrial(state, today, { total: minor, count: Number(count), accountId, startPeriod: start }); }
    catch (e) { error = e?.errors || [e?.message || "hesaplanamadı"]; }
  }
  const starts = [{ value: period, label: `Bu dönem (${monthOf(period)})` }, { value: nextPeriod(period), label: `Sonraki dönem (${monthOf(nextPeriod(period))})` }];

  return (
    <Sheet title="Taksit dene" onClose={onClose}>
      <p className="v3-sheet-text">Kayıt yapılmaz. Planlanan gelirden ödemeler ve kategori bütçeleri düşüldükten sonra ay sonunda ne kalacağı, bu taksitle ve taksitsiz gösterilir.</p>
      <Form onSubmit={() => {}}>
        <Field label="Toplam tutar (₺)" value={total} onChange={setTotal} inputMode="decimal" placeholder="Örn: 24.000" />
        <SelectField label="Taksit sayısı" value={count} onChange={setCount} options={COUNTS} />
        {accounts.length > 1 && <SelectField label="Kart / hesap" value={accountId} onChange={setAccountId} options={accounts.map(a => ({ value: a.id, label: a.name }))} />}
        <Chips label="İlk taksit" value={start} options={starts} onChange={v => v && setStart(v)} wrap />
        <ErrorText errors={error} />
      </Form>

      {trial && (
        <section className="stack" style={{ gap: 12, margin: "4px 4px 0" }} aria-live="polite">
          <div className="stack gap2">
            <span className="num t-big" style={{ fontSize: 30 }}>{fmt(trial.monthly)} <span className="t-sub">/ay</span></span>
            <span className="t-meta">{monthOf(trial.firstPeriod)} – {periodLabel(trial.lastPeriod)} · {count} taksit{trial.firstAmount !== trial.monthly ? ` · ilk taksit ${fmt(trial.firstAmount)}` : ""}</span>
          </div>
          <div className={`v3-alert${trial.fits ? "" : " is-error"}`} role="status">
            <strong>{trial.fits ? "Plana sığıyor" : trial.newlyNegative ? `${monthOf(trial.newlyNegative.period)} döneminde plan eksiye düşer` : "Plan zaten açık veriyor"}</strong>
            {trial.fits
              ? `En dar ay ${monthOf(trial.worst.period)}: ay sonunda ${fmt(trial.worst.after)} kalır.`
              : trial.newlyNegative
                ? `Taksitsiz ${fmt(trial.newlyNegative.before)} kalacakken taksitle ${fmt(trial.newlyNegative.after)} olur.`
                : `${monthOf(trial.worst.period)} döneminde taksitle ${fmt(trial.worst.after)}.`}
            {" "}Gelecek 3 ayın taksit yükü ayda {fmt(trial.loadPerMonth)} olur.
          </div>
          <div className="list">
            <div className="li" style={{ minHeight: 40, padding: "8px 16px" }}>
              <span className="t-meta grow">Ay sonunda kalan (plan)</span>
              <span className="t-meta num" style={{ width: 88, textAlign: "right" }}>Taksitsiz</span>
              <span className="t-meta num b" style={{ width: 88, textAlign: "right" }}>Taksitli</span>
            </div>
            {trial.rows.map(r => (
              <div className="li" key={r.period} style={{ minHeight: 44, padding: "8px 16px", "--inset": "16px" }}>
                <span className="t-body grow">{periodLabel(r.period)}</span>
                <span className={`num t-body${r.before < 0 ? " c-red" : " c-2"}`} style={{ width: 88, textAlign: "right" }}>{fmt(r.before)}</span>
                <span className={`num t-body b${r.after < 0 ? " c-red" : ""}`} style={{ width: 88, textAlign: "right" }}>{fmt(r.after)}</span>
              </div>
            ))}
          </div>
          <span className="t-meta">Plan görünümüdür: gerçekleşen harcamayı değil, kategori bütçelerinin tamamını düşer.</span>
        </section>
      )}

      <div className="v3-actions">
        <button type="button" className="v3-cancel" onClick={onClose}>Kapat</button>
        {onSave && <button type="button" className="v3-submit" disabled={!trial} onClick={() => onSave({ total: minor, count: Number(count), accountId, startPeriod: start })}>Taksit olarak kaydet</button>}
      </div>
    </Sheet>
  );
}
