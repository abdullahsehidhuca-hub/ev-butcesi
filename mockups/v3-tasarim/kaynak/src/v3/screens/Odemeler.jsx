// C4 · Ödemeler: dönem seçici, özet kart, süzgeç, maaştan önce / sonra listesi.
import { useState } from "react";
import { Tile, DateBadge, Check } from "../components/ui.jsx";
import { paymentsView, periodLabel, prevPeriod, nextPeriod, fmt, dayNum, monthShort } from "../selectors.js";
import { periodOf } from "../../core/index.js";

const FILTERS = [["all", "Tümü"], ["fixed", "Faturalar"], ["installment", "Taksitler"], ["card", "Kartlar"]];
const match = (f, it) => f === "all" || (f === "installment" ? ["installment", "debt"].includes(it.kind) : it.kind === f);

export default function Odemeler({ state, today, onPay, onAdd }) {
  const [period, setPeriod] = useState(periodOf(today, state.settings?.payDay || 1));
  const [filter, setFilter] = useState("all");
  const v = paymentsView(state, period);
  const done = v.before.concat(v.after).filter(i => i.paid).length;
  const auto = v.before.concat(v.after).filter(i => i.auto).length;
  const paidPct = v.total ? (v.total - v.open) / v.total * 100 : 0;

  const Section = ({ title, items }) => {
    const list = items.filter(i => match(filter, i));
    if (!list.length) return null;
    const open = list.reduce((s, i) => s + i.open, 0);
    return (
      <>
        <div className="row between t-cap"><span>{title}</span><span className="num" style={{ letterSpacing: 0 }}>{fmt(open)}</span></div>
        <section className="list" aria-label={title}>
          {list.map(it => (
            <div className="li" key={it.key}>
              <DateBadge date={it.date} tone={it.paid ? undefined : undefined} />
              <Tile icon={it.icon} color={it.color} />
              <span className="stack grow gap2">
                <span className={`t-body ellipsis${it.paid ? " c-2" : ""}`}>{it.name}</span>
                <span className="t-meta ellipsis">{subline(it)}</span>
              </span>
              <span className={`num t-body b${it.paid ? " c-2" : ""}`}>{fmt(it.amount)}</span>
              {it.auto ? <span className="auto-tag">oto</span> : <Check on={it.paid} onClick={() => !it.paid && onPay(it)} label={`${it.name} ${it.paid ? "ödendi" : "ödendi olarak işaretle"}`} />}
            </div>
          ))}
        </section>
      </>
    );
  };

  return (
    <>
      <header className="row between baseline" style={{ padding: "0 4px" }}>
        <h1 className="t-title" style={{ margin: 0 }}>Ödemeler</h1>
        <button className="t-sub c-blue" style={{ minHeight: 44, fontWeight: 500 }} onClick={onAdd}>Ekle</button>
      </header>
      <nav className="row between" style={{ padding: "0 4px" }} aria-label="Dönem">
        <button className="t-sub c-blue" style={{ minHeight: 44 }} onClick={() => setPeriod(prevPeriod(period))}>‹ {periodLabel(prevPeriod(period)).split(" ")[0]}</button>
        <span className="b" style={{ fontSize: 17 }}>{periodLabel(period)}</span>
        <button className="t-sub c-blue" style={{ minHeight: 44 }} onClick={() => setPeriod(nextPeriod(period))}>{periodLabel(nextPeriod(period)).split(" ")[0]} ›</button>
      </nav>

      <section className="card" aria-label="Dönem ödemeleri">
        <div className="row between baseline"><span className="t-sub b">Kalan ödeme</span><span className="t-sub">{done} ödendi{auto ? ` · ${auto} otomatik` : ""}</span></div>
        <span className="num t-big">{fmt(v.open)}</span>
        <div className="track" style={{ height: 8, borderRadius: 4 }}><i style={{ width: `${paidPct}%`, background: "var(--green)", borderRadius: 4 }} /></div>
        <span className="t-meta">{fmt(v.total)} toplam · {fmt(v.total - v.open)} ödendi ya da otomatik</span>
      </section>

      <div className="chips" role="group" aria-label="Süzgeç">
        {FILTERS.map(([id, label]) => <button key={id} className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
      </div>

      <Section title={`Maaştan önce · ${dayNum(v.salary)} ${monthShort(v.salary)}`} items={v.before} />
      <Section title="Maaştan sonra" items={v.after} />
    </>
  );
}

function subline(it) {
  if (it.paid) return "Ödendi";
  if (it.auto) return `Taksit ${it.index}/${it.total} · karttan otomatik`;
  if (it.type === "card") return "Ekstre · son ödeme";
  if (it.total) return `Taksit ${it.index}/${it.total}`;
  return "Bekliyor";
}
