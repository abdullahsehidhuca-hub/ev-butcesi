// C1 · Özet: tek özet kart + tek liste. İleriye dönük uyarı listenin ilk satırıdır.
import { useState } from "react";
import { Icon, Tile, DateBadge, Avatar, Check } from "../components/ui.jsx";
import { overview, upcoming, recent, forecast, paymentsView, fmt, fmtNum, dayNum, monthShort, monthLong } from "../selectors.js";

export default function Ozet({ state, today, members, overrides, onResolve, onPay, onOpenPayments }) {
  const [list, setList] = useState("upcoming");
  const o = overview(state, today);
  const fc = forecast(state, today, { overrides });
  const up = upcoming(state, today);
  const rec = recent(state, 6);
  const nextMonth = paymentsView(state, o.period);
  const bar = o.salaryBar;
  const barTotal = Math.max(1, bar.income);
  const pct = v => `${Math.max(0, v) / barTotal * 100}%`;
  const ahead = o.pace.diff > 0;
  const memberList = Object.values(members);

  return (
    <>
      <header className="row between" style={{ alignItems: "flex-end", padding: "0 4px" }}>
        <div className="stack">
          <span className="t-meta b">{dayNum(o.start)} {monthShort(o.start)} – {dayNum(o.end)} {monthShort(o.end)} · {o.day}. gün</span>
          <h1 className="t-title" style={{ margin: 0 }}>{monthLong(o.start)}</h1>
        </div>
        <div className="row" style={{ gap: 0, paddingBottom: 6 }}>
          {memberList.map((m, i) => <span key={m.id} style={{ marginLeft: i ? -6 : 0 }}><Avatar member={m} /></span>)}
        </div>
      </header>

      <section className="card" aria-label="Bu dönem özeti">
        <div className="row between baseline"><span className="t-sub b">Serbest</span><span className="t-sub">günde {fmt(o.perDay)}</span></div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <span className={`num t-big${o.free < 0 ? " c-red" : ""}`}>{fmt(o.free)}</span>
          {o.pace.plan > 0 && (
            <span className="badge" style={{ "--bc": ahead ? "var(--orange)" : "var(--green)" }}>
              {ahead ? `plandan ${fmt(o.pace.diff)} hızlı` : `plana göre ${fmt(-o.pace.diff)} geride`}
            </span>
          )}
        </div>
        <div className="bar" style={{ marginTop: 4 }} aria-hidden="true">
          <i style={{ width: pct(bar.paid), background: "var(--gray)" }} />
          <i style={{ width: pct(bar.pending), background: "var(--blue)", opacity: .35 }} />
          <i style={{ width: pct(bar.spent), background: "var(--blue)" }} />
          <i style={{ flex: 1, background: "var(--green)" }} />
        </div>
        <div className="row t-meta" style={{ gap: 12, flexWrap: "wrap" }}>
          <span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: "var(--blue)", opacity: .35 }} />Bekliyor {fmtNum(bar.pending)}</span>
          <span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: "var(--blue)" }} />Harcandı {fmtNum(bar.spent)}</span>
          <span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: "var(--green)" }} />Serbest</span>
        </div>
      </section>

      <div className="seg" role="group" aria-label="Liste">
        <button aria-pressed={list === "upcoming"} onClick={() => setList("upcoming")}>Yaklaşan · {up.length}</button>
        <button aria-pressed={list === "recent"} onClick={() => setList("recent")}>Son işlemler</button>
      </div>

      {list === "upcoming" ? (
        <section className="list" aria-label="Yaklaşan ödemeler">
          {fc.firstNegative && (
            <button className="li" onClick={onResolve} style={{ "--inset": "64px" }}>
              <Tile icon="alert" color="red" solid />
              <span className="stack grow gap2">
                <span className="t-body b">{dayNum(fc.firstNegative.date)} {monthShort(fc.firstNegative.date)}’da eksiye düşüyor</span>
                <span className="t-meta c-red">{fmt(fc.firstNegative.balance)} · {fc.firstNegative.label}</span>
              </span>
              <span className="pill blue sm" aria-hidden="true">Çöz</span>
            </button>
          )}
          {up.map(it => (
            <div className="li" key={it.key}>
              <DateBadge date={it.date} tone={fc.firstNegative?.key === it.key ? "red" : undefined} />
              <Tile icon={it.icon} color={it.color} />
              <span className="stack grow gap2">
                <span className="t-body ellipsis">{it.name}</span>
                <span className="t-meta ellipsis">{it.auto ? `Taksit ${it.index}/${it.total} · otomatik` : it.type === "card" ? "Ekstre · son ödeme" : daysText(today, it.date)}</span>
              </span>
              <span className="num t-body b">{fmt(it.auto ? it.amount : it.open)}</span>
              {it.auto ? <span className="auto-tag">oto</span> : <Check on={false} onClick={() => onPay(it)} label={`${it.name} ödendi olarak işaretle`} />}
            </div>
          ))}
        </section>
      ) : (
        <section className="list" aria-label="Son işlemler" style={{ "--inset": "64px" }}>
          {rec.map(t => {
            const c = state.categories[t.categoryId];
            const m = members[t.createdBy];
            return (
              <div className="li" key={t.id}>
                <Tile icon={c?.icon || "more"} color={c?.color || "gray"} />
                <span className="stack grow gap2">
                  <span className="t-body ellipsis">{t.note || c?.name || "Harcama"}</span>
                  <span className="t-meta ellipsis">{dayNum(t.date)} {monthShort(t.date)} · {c?.name || "Kategorisiz"} · {state.accounts[t.accountId]?.name}</span>
                </span>
                <span className={`num t-body b${t.type === "refund" ? " c-green" : ""}`}>{t.type === "refund" ? "+" : "−"}{fmt(t.amount)}</span>
                {m && <Avatar member={m} size={24} />}
              </div>
            );
          })}
        </section>
      )}

      <button className="row between" onClick={onOpenPayments} style={{ padding: "0 4px", minHeight: 44 }}>
        <span className="t-meta">Bu dönem {fmt(nextMonth.open)} ödeme kaldı</span>
        <span className="t-sub c-blue" style={{ fontWeight: 500 }}>Tümü</span>
      </button>
    </>
  );
}

function daysText(today, date) {
  const [a, b] = [today, date].map(d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
  const n = Math.round((b - a) / 86400000);
  return n === 0 ? "Bugün" : n === 1 ? "Yarın" : `${n} gün sonra`;
}
