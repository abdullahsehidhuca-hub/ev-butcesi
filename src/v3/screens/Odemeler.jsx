// Ödemeler (taslak C4): dönem seçici, özet kart, süzgeç, maaştan önce / sonra listesi;
// altında gelecek 3 ayın taksit yükü ve aktif taksitler.
import { useState } from "react";
import { Tile, DateBadge, Check } from "../components/ui.jsx";
import { paymentsView, periodLabel, prevPeriod, nextPeriod, fmt, dayNum, monthShort } from "../selectors.js";
import { periodOf, installmentLoad, occurrence, remainingAfter } from "../../core/index.js";

const FILTERS = [["all", "Tümü"], ["fixed", "Faturalar"], ["installment", "Taksitler"], ["card", "Kartlar"]];
const match = (f, it) => f === "all" || (f === "installment" ? ["installment", "debt"].includes(it.kind) : it.kind === f);
const monthOf = p => periodLabel(p).split(" ")[0];

function Section({ title, items, filter, onPay, onItem }) {
  const list = items.filter(i => match(filter, i));
  if (!list.length) return null;
  const open = list.reduce((s, i) => s + i.open, 0);
  return (
    <>
      <div className="row between t-cap"><span>{title}</span><span className="num" style={{ letterSpacing: 0 }}>{fmt(open)}</span></div>
      <section className="list" aria-label={title}>
        {list.map(it => (
          <div className="li" key={it.key} style={{ padding: 0 }}>
            {/* Satıra dokununca kalemin tanımı (ya da kart blokesi) açılır; sağdaki ✓ ödeme çekmecesini açar. */}
            <button type="button" className="row grow" style={{ gap: 12, padding: "11px 0 11px 16px", minHeight: 58, textAlign: "left" }}
              onClick={() => onItem?.(it)} aria-label={`${it.name}, ${fmt(it.amount)}, ${subline(it)}. ${it.type === "card" ? "Kart blokesini aç" : "Düzenle"}`}>
              <DateBadge date={it.date} />
              <Tile icon={it.icon} color={it.color} />
              <span className="stack grow gap2">
                <span className={`t-body ellipsis${it.paid ? " c-2" : ""}`}>{it.name}</span>
                <span className="t-meta ellipsis">{subline(it)}</span>
              </span>
              <span className={`num t-body b${it.paid ? " c-2" : ""}`}>{fmt(it.amount)}</span>
            </button>
            <span style={{ padding: "0 16px 0 4px", display: "flex", alignItems: "center" }}>
              {it.auto ? <span className="auto-tag">oto</span> : <Check on={it.paid} onClick={() => !it.paid && onPay(it)} label={`${it.name} ${it.paid ? "ödendi" : "ödendi olarak işaretle"}`} />}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}

export default function Odemeler({ state, today, onPay, onAdd, onItem, onTrial }) {
  const payDay = state.settings?.payDay || 1;
  const [period, setPeriod] = useState(periodOf(today, payDay));
  const [filter, setFilter] = useState("all");
  const v = paymentsView(state, period);
  const all = v.before.concat(v.after);
  const done = all.filter(i => i.paid).length;
  const auto = all.filter(i => i.auto).length;
  const paidPct = v.total ? (v.total - v.open) / v.total * 100 : 0;
  const shown = all.filter(i => match(filter, i)).length;

  const load = installmentLoad(state, nextPeriod(period), 3);
  const endings = load.months.filter(m => m.ending.length).map(m => `${monthOf(m.period)}: ${m.ending.join(", ")}`);
  const loans = Object.values(state.obligations)
    .filter(o => o.kind === "installment" || o.kind === "debt")
    .map(o => ({ o, oc: occurrence(o, period, payDay), rest: remainingAfter(o, period) }))
    .filter(x => x.oc || x.rest?.count > 0);

  return (
    <>
      <header className="row between baseline" style={{ padding: "0 4px" }}>
        <h1 className="t-title" style={{ margin: 0 }}>Ödemeler</h1>
        {onAdd && <button type="button" className="t-sub c-blue" style={{ minHeight: 44, fontWeight: 500 }} onClick={onAdd}>Ödeme ekle</button>}
      </header>
      <nav className="row between" style={{ padding: "0 4px" }} aria-label="Dönem">
        <button type="button" className="t-sub c-blue" style={{ minHeight: 44, minWidth: 44 }} onClick={() => setPeriod(prevPeriod(period))} aria-label={`Önceki dönem: ${periodLabel(prevPeriod(period))}`}>‹ {monthOf(prevPeriod(period))}</button>
        <span className="b" style={{ fontSize: 17 }} aria-live="polite">{periodLabel(period)}</span>
        <button type="button" className="t-sub c-blue" style={{ minHeight: 44 }} onClick={() => setPeriod(nextPeriod(period))} aria-label={`Sonraki dönem: ${periodLabel(nextPeriod(period))}`}>{monthOf(nextPeriod(period))} ›</button>
      </nav>

      <section className="card" aria-label="Dönem ödemeleri">
        <div className="row between baseline"><span className="t-sub b">Kalan ödeme</span><span className="t-sub">{done} ödendi{auto ? ` · ${auto} otomatik` : ""}</span></div>
        <span className="num t-big">{fmt(v.open)}</span>
        <div className="track" style={{ height: 8, borderRadius: 4 }}><i style={{ width: `${paidPct}%`, background: "var(--green)", borderRadius: 4 }} /></div>
        <span className="t-meta">{fmt(v.total)} toplam · {fmt(v.total - v.open)} ödendi ya da otomatik</span>
      </section>

      {v.count > 0 ? (
        <>
          <div className="chips" role="group" aria-label="Süzgeç">
            {FILTERS.map(([id, label]) => <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
          </div>
          <Section title={`Maaştan önce · ${dayNum(v.salary)} ${monthShort(v.salary)}`} items={v.before} filter={filter} onPay={onPay} onItem={onItem} />
          <Section title="Maaştan sonra" items={v.after} filter={filter} onPay={onPay} onItem={onItem} />
          {!shown && <p className="t-sub" style={{ margin: 0, padding: "0 4px" }}>Bu süzgeçte ödeme yok.</p>}
        </>
      ) : (
        <p className="t-sub" style={{ margin: 0, padding: "0 4px" }}>Bu dönemde düzenli ödeme yok. Kira, fatura ve taksitleri Ayarlar’dan ekleyin.</p>
      )}

      <span className="t-cap">Gelecek 3 ayın taksit yükü</span>
      <section className="card" aria-label="Gelecek 3 ayın taksit yükü">
        <span className="num t-big" style={{ fontSize: 30 }}>{fmt(Math.round(load.total / 3))} <span className="t-sub">/ay</span></span>
        <span className="t-meta">{endings.length ? `Biten taksitler — ${endings.join(" · ")}` : "Önümüzdeki 3 ayda biten taksit yok."}</span>
        {onTrial && <button type="button" className="v3-link" style={{ padding: 0, alignSelf: "flex-start" }} onClick={onTrial}>Taksit dene: bu taksiti alırsam ne olur?</button>}
      </section>

      {loans.length > 0 && (
        <>
          <span className="t-cap">Aktif taksitler ve borçlar</span>
          <section className="list" aria-label="Aktif taksitler ve borçlar" style={{ "--inset": "64px" }}>
            {loans.map(({ o, oc, rest }) => (
              <button type="button" className="li" key={o.id} onClick={() => onItem?.({ type: "obligation", obligationId: o.id })} aria-label={`${o.name}, ${fmt(oc?.amount ?? o.amount)}. Düzenle`}>
                <Tile icon={o.icon || state.categories[o.categoryId]?.icon || "card"} color={o.color || state.categories[o.categoryId]?.color || "teal"} />
                <span className="stack grow gap2">
                  <span className="t-body ellipsis">{o.name}</span>
                  <span className="t-meta ellipsis">{[state.accounts[o.accountId]?.name, oc ? `Taksit ${oc.index}/${oc.total}` : "Bu dönem ödeme yok", rest && `sonra ${rest.count} taksit`].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="num t-body b">{fmt(oc?.amount ?? o.amount)}</span>
              </button>
            ))}
          </section>
        </>
      )}
    </>
  );
}

function subline(it) {
  if (it.paid) return "Ödendi";
  if (it.auto) return it.total ? `Taksit ${it.index}/${it.total} · karttan otomatik` : "Karttan otomatik";
  if (it.type === "card") return "Ekstre · son ödeme";
  if (it.total) return `Taksit ${it.index}/${it.total}`;
  if (it.open < it.amount) return `Kısmi · kalan ${fmt(it.open)}`;
  return "Bekliyor";
}
