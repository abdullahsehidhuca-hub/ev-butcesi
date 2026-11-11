// C3 · Uyarıyı çöz: eksiye düşüş, mini akış, seçenekler ve her birinin sonucu.
import { useState } from "react";
import { Sheet, Icon } from "../components/ui.jsx";
import { forecast, resolveOptions, fmt, fmtNum, dayNum, monthShort, monthLong } from "../selectors.js";

export default function CozSheet({ state, today, overrides, onClose, onApply }) {
  const fc = forecast(state, today, { overrides });
  const opts = resolveOptions(state, today, overrides);
  const [sel, setSel] = useState(opts[0]?.id);
  const neg = fc.firstNegative;
  if (!neg) return null;
  const chosen = opts.find(o => o.id === sel);
  // Mini akış: bugün, eksiye düşüş öncesi son nokta, düşüş günü, maaş (varsa).
  const iNeg = fc.points.findIndex(p => p.key === neg.key);
  const salary = fc.points.find(p => p.delta > 0);
  const pts = [fc.points[0], fc.points[iNeg - 1], fc.points[iNeg], salary].filter((p, i, a) => p && a.indexOf(p) === i);
  const ptLabel = p => p.delta === 0 ? "Bugün" : `${dayNum(p.date)} ${monthShort(p.date)}`;
  const tone = b => b < 0 ? "c-red" : "";

  return (
    <Sheet onClose={onClose} label="Uyarıyı çöz">
      <div className="stack gap2" style={{ padding: "0 4px" }}>
        <span className="num" style={{ fontSize: 24, fontWeight: 700 }}>{dayNum(neg.date)} {monthLong(neg.date)}’da {fmt(neg.balance)}</span>
        <span className="t-sub">{neg.label} ({fmt(-fc.points[iNeg].delta)}) maaştan önce çekiliyor. Günlük harcamalar bu hesaba dahil değil.</span>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div className="row between" style={{ alignItems: "flex-start" }}>
          {pts.map(p => (
            <div key={p.date + p.label} className="stack" style={{ alignItems: "center", gap: 4 }}>
              <span className="dot" style={{ width: 10, height: 10, borderRadius: 5, background: p.balance < 0 ? "var(--red)" : p.delta > 0 ? "var(--green)" : "var(--label)" }} />
              <span className="t-meta">{ptLabel(p)}</span>
              <span className={`num b ${tone(p.balance)}`} style={{ fontSize: 15, color: p.delta > 0 ? "var(--green)" : undefined }}>{p.delta > 0 ? "+" : ""}{fmtNum(p.balance)}</span>
            </div>
          ))}
        </div>
      </div>

      <span className="t-cap">Nasıl çözelim?</span>
      <div className="list" role="radiogroup" aria-label="Seçenekler" style={{ "--inset": "52px" }}>
        {opts.map(o => (
          <button key={o.id} className="li" role="radio" aria-checked={sel === o.id} onClick={() => setSel(o.id)} style={{ alignItems: "flex-start", padding: "13px 16px" }}>
            <span className={`radio${sel === o.id ? " on" : ""}`}>{sel === o.id && <Icon name="check" size={14} stroke={3} />}</span>
            <span className="stack grow gap2">
              <span className={`t-body${sel === o.id ? " b" : ""}`}>{o.title}</span>
              <span className={`t-meta${o.tone === "warn" ? " c-orange" : ""}`}>{o.detail}</span>
            </span>
          </button>
        ))}
      </div>

      {chosen && (
        <div className="row between" style={{ padding: "0 4px" }}>
          <span className="t-sub">Maaşa kadar en düşük bakiye</span>
          <span className={`num b ${chosen.resultMin < 0 ? "c-red" : "c-green"}`} style={{ fontSize: 17 }}>{chosen.resultMin >= 0 ? "+" : ""}{fmt(chosen.resultMin)}</span>
        </div>
      )}
      <button className="pill blue" style={{ justifyContent: "center", minHeight: 50, borderRadius: 14, fontSize: 17 }} disabled={!chosen} onClick={() => onApply(chosen)}>Uygula</button>
    </Sheet>
  );
}
