// Rapor (taslak C5) — grafik yapısı B3'teki gibi: öneri kartları, harcama dağılımı halkası,
// önümüzdeki 6 ay "ay sonunda kalan" çubukları; altında kategori limitleri.
// Halka en büyük 4 kategoriyi gösterir; yanındaki liste tüm kategorileri tutarıyla verir.
// Dönem seçici geçmiş aylara gider (kapalı dönemler dondurulmuş özetten); "Son 6 ay" harcama trendini gösterir.
import { useState } from "react";
import { Tile, Icon } from "../components/ui.jsx";
import { Donut, MonthBars } from "../components/charts.jsx";
import { periodOf } from "../../core/index.js";
import { report, spendingTrend, savingsView, fmt, periodLabel, prevPeriod, nextPeriod } from "../selectors.js";
import { GoalRow } from "./BirikimSheet.jsx";

const PALETTE = ["teal", "orange", "red", "purple", "indigo", "pink", "gray"];
const monthOf = p => periodLabel(p).split(" ")[0];

// Önceki döneme göre değişim metni. Önceki dönem boşsa gösterilmez.
function change(now, before) {
  if (!before) return null;
  const d = now - before;
  if (Math.abs(d) < 100) return { text: "geçen dönemle aynı", tone: "c-2" };
  const pctText = `%${Math.round(Math.abs(d) / before * 100)}`;
  return d > 0 ? { text: `${pctText} fazla (${fmt(d)})`, tone: "c-orange" } : { text: `${pctText} az (${fmt(-d)})`, tone: "c-green" };
}

// onCategory(categoryId, period): kategori satırına dokununca o kategorinin işlem listesi açılır.
// onGoal(id): hedef satırı düzenlemeyi, onSavings: Birikim çekmecesini açar.
export default function Rapor({ state, today, onCategory, onGoal, onSavings }) {
  const current = periodOf(today, state.settings?.payDay || 1);
  const [period, setPeriod] = useState(current);
  const r = report(state, today, 6, period);
  const parts = r.parts.map((p, i) => ({ ...p, color: state.categories[p.categoryId]?.color || PALETTE[i % PALETTE.length] }));
  // Aynı renk iki kez gelirse paletten farklı bir renk seç.
  const used = new Set(); for (const p of parts) { if (used.has(p.color)) p.color = PALETTE.find(c => !used.has(c)) || p.color; used.add(p.color); }
  const colorOf = id => parts.find(p => p.categoryId === id)?.color || parts.find(p => p.categoryId === "_rest")?.color || "gray";
  const total = r.total || 1;
  const months = r.projection.map((m, i) => ({ label: periodLabel(m.period).slice(0, 3), value: m.free, current: i === 0 }));
  const negative = r.projection.filter(m => m.free < 0);
  const ends = r.projection.find(m => m.ending.length);
  const vsPrev = change(r.total, r.prevTotal);
  const trend = spendingTrend(state, today, 6);
  const trendMonths = trend.map(t => ({ label: periodLabel(t.period).slice(0, 3), value: t.spent, current: t.current }));
  const trendPast = trend.filter(t => !t.current && t.spent > 0);
  const avg = trendPast.length ? Math.round(trendPast.reduce((s, t) => s + t.spent, 0) / trendPast.length) : 0;
  const goals = savingsView(state, today).goals;

  return (
    <>
      <header className="row between baseline" style={{ padding: "0 4px" }}>
        <h1 className="t-title" style={{ margin: 0 }}>Rapor</h1>
        <span className="t-sub c-blue" style={{ fontWeight: 500 }}>{monthOf(r.period)} dönemi{r.closed ? " · kapalı" : ""}</span>
      </header>
      <nav className="row between" style={{ padding: "0 4px" }} aria-label="Dönem">
        <button type="button" className="t-sub c-blue" style={{ minHeight: 44, minWidth: 44 }} onClick={() => setPeriod(prevPeriod(period))} aria-label={`Önceki dönem: ${periodLabel(prevPeriod(period))}`}>‹ {monthOf(prevPeriod(period))}</button>
        <span className="b" style={{ fontSize: 17 }} aria-live="polite">{periodLabel(period)}</span>
        {r.current
          ? <span className="t-sub" style={{ minHeight: 44, minWidth: 44, display: "inline-flex", alignItems: "center", justifyContent: "flex-end" }}>Bu dönem</span>
          : <button type="button" className="t-sub c-blue" style={{ minHeight: 44, minWidth: 44 }} onClick={() => setPeriod(nextPeriod(period))} aria-label={`Sonraki dönem: ${periodLabel(nextPeriod(period))}`}>{monthOf(nextPeriod(period))} ›</button>}
      </nav>

      {r.insights.length > 0 && <>
        <span className="t-cap">Sana özel</span>
        {r.insights.slice(0, 3).map(ins => {
          const cat = state.categories[ins.categoryId];
          return (
            <section key={ins.title} className="card" style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
              <Tile icon={cat?.icon || (ins.tone === "danger" ? "alert" : "spark")} color={ins.tone === "danger" ? "red" : "orange"} />
              <span className="stack grow gap2">
                <span className="t-body b">{ins.title}</span>
                <span className="t-sub">{ins.detail}</span>
              </span>
            </section>
          );
        })}
      </>}

      <section className="card" style={{ gap: 14 }} aria-label="Harcama dağılımı">
        <div className="stack gap2">
          <span className="t-sub b">Harcandı</span>
          <span className="num t-big" style={{ fontSize: 32 }}>{fmt(r.total)}</span>
          <span className="t-meta">
            {vsPrev ? <><span className={vsPrev.tone}>{vsPrev.text}</span> · {monthOf(prevPeriod(r.period))}: {fmt(r.prevTotal)}</> : "Önceki dönemde kayıt yok."}
          </span>
          <span className="t-meta">Düzenli ödemeler ayrıca: {fmt(r.obligations)}</span>
        </div>
        {r.rows.length ? <div className="row" style={{ gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          {parts.length > 0 && <Donut parts={parts} center={`${r.rows.length} kategori`} />}
          <ul className="stack grow" style={{ gap: 10, margin: 0, padding: 0, listStyle: "none", minWidth: 200 }}>
            {r.rows.map(p => {
              const ch = change(p.value, p.prev);
              return (
                <li key={p.categoryId} className="stack gap2">
                  <button type="button" className="row" style={{ gap: 8, minHeight: 44, width: "100%", textAlign: "left" }} onClick={() => onCategory?.(p.categoryId, r.period)} aria-label={`${p.name} harcamaları, ${fmt(p.value)}. İşlemleri aç`}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(--${colorOf(p.categoryId)})`, flex: "none" }} />
                    <span className="grow ellipsis" style={{ fontSize: 15 }}>{p.name}</span>
                    <span className="num b" style={{ fontSize: 15 }}>{fmt(p.value)}</span>
                    <span className="num t-meta" style={{ width: 38, textAlign: "right" }}>%{Math.round(p.value / total * 100)}</span>
                  </button>
                  {ch && <span className={`t-meta ${ch.tone}`} style={{ paddingLeft: 18 }}>{ch.text}</span>}
                </li>
              );
            })}
          </ul>
        </div> : <span className="t-sub">{r.current ? "Bu dönemde henüz harcama yok." : "Bu dönemde harcama kaydı yok."}</span>}
      </section>

      <section className="card" style={{ gap: 12 }} aria-label="Son 6 ay harcama">
        <div className="row between baseline"><span className="t-body b">Son 6 ay harcama</span><span className="t-meta">bin ₺ · gerçekleşen</span></div>
        <MonthBars months={trendMonths} />
        <span className="t-meta">
          {avg > 0
            ? `Önceki ayların ortalaması ${fmt(avg)}; bu ay şimdiye kadar ${fmt(trend.at(-1).spent)}${trend.at(-1).spent > avg ? ", ortalamanın üstünde." : "."}`
            : "Serbest harcamalar (düzenli ödemeler hariç); önceki aylar birikince ortalama görünür."}
        </span>
      </section>

      <section className="card" style={{ gap: 12 }} aria-label="Önümüzdeki 6 ay">
        <div className="row between baseline"><span className="t-body b">Ay sonunda kalan</span><span className="t-meta">bin ₺ · plan</span></div>
        <MonthBars months={months} />
        <span className={`t-meta${negative.length ? " c-red" : ""}`}>
          {negative.length ? `${monthOf(negative[0].period)} döneminde ödemeler ve bütçeler gelirin üstünde.` : ends ? `${ends.ending.join(", ")} ${monthOf(ends.period)} döneminde bitiyor; sonraki ay rahatlıyor.` : "Gelir − ödemeler − kategori bütçeleri."}
        </span>
        <details className="why">
          <summary className="t-sub c-blue">Aylık döküm</summary>
          <ul className="stack" style={{ gap: 10, margin: 0, padding: 0, listStyle: "none" }}>
            {r.projection.map(m => (
              <li key={m.period} className="stack gap2">
                <span className="row between"><span className="t-body">{periodLabel(m.period)}</span><span className={`num t-body b${m.free < 0 ? " c-red" : ""}`}>{fmt(m.free)}</span></span>
                <span className="t-meta">Gelir {fmt(m.income)} · Ödemeler {fmt(m.obligations)}{m.budgets > 0 ? ` · Bütçeler ${fmt(m.budgets)}` : ""}</span>
                {m.ending.length > 0 && <span className="t-meta c-green">Biter: {m.ending.join(", ")}</span>}
              </li>
            ))}
          </ul>
          <span className="t-meta">Plan görünümüdür: beklenen gelirden ödemeler ve kategori bütçeleri düşülür, gerçekleşen harcamayı içermez.</span>
        </details>
      </section>

      {r.limits.length > 0 && <>
      <span className="t-cap">Kategori limitleri</span>
      <section className="list" style={{ "--inset": "64px" }}>
        {r.limits.map(l => {
          const c = state.categories[l.categoryId];
          const over = l.spent - l.budget;
          const willOver = r.current && l.projected > l.budget;
          return (
            <button type="button" key={l.categoryId} className="li" onClick={() => onCategory?.(l.categoryId, r.period)} aria-label={`${l.name} limiti: ${fmt(l.spent)} / ${fmt(l.budget)}. İşlemleri aç`}>
              <Tile icon={c?.icon} color={c?.color} />
              <span className="stack grow" style={{ gap: 6 }}>
                <span className="row between"><span className="t-body">{l.name}</span><span className={`num ${willOver ? "c-orange b" : "c-2"}`} style={{ fontSize: 14 }}>{fmt(l.spent)} / {fmt(l.budget)}</span></span>
                <span className="track"><i style={{ width: `${Math.min(100, l.spent / l.budget * 100)}%`, background: `var(--${c?.color || "blue"})` }} />{r.current && <b style={{ left: `${Math.min(100, r.day / r.totalDays * 100)}%` }} />}</span>
                <span className={`t-meta${over > 0 ? " c-red" : ""}`}>{over > 0 ? `${fmt(over)} aşıldı` : `${fmt(l.left)} kaldı`}</span>
              </span>
            </button>
          );
        })}
      </section>
      {r.current && <span className="t-meta" style={{ padding: "0 4px" }}>Dikey çizgi: aylık limitin bugüne düşen kısmı.</span>}
      </>}

      {goals.length > 0 && <>
        <div className="row between" style={{ padding: "6px 4px 0" }}>
          <span className="t-cap" style={{ padding: 0 }}>Hedefler</span>
          {onSavings && <button type="button" className="t-sub c-blue" style={{ minHeight: 44, fontWeight: 500 }} onClick={onSavings}>Birikim ›</button>}
        </div>
        <section className="list" style={{ "--inset": "64px" }} aria-label="Hedefler">
          {goals.map(g => <GoalRow key={g.goalId} g={g} onClick={onGoal ? () => onGoal(g.goalId) : undefined} />)}
        </section>
      </>}
    </>
  );
}
