// Analiz (taslak C5 · Rapor) — grafik yapısı B3'teki gibi: öneri kartları, harcama dağılımı halkası,
// önümüzdeki 6 ay "ay sonunda kalan" çubukları; altında kategori limitleri.
// Halka en büyük 4 kategoriyi gösterir; yanındaki liste tüm kategorileri tutarıyla verir.
import { Tile, Icon } from "../components/ui.jsx";
import { Donut, MonthBars } from "../components/charts.jsx";
import { report, fmt, periodLabel, prevPeriod } from "../selectors.js";

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

export default function Rapor({ state, today }) {
  const r = report(state, today);
  const parts = r.parts.map((p, i) => ({ ...p, color: state.categories[p.categoryId]?.color || PALETTE[i % PALETTE.length] }));
  // Aynı renk iki kez gelirse paletten farklı bir renk seç.
  const used = new Set(); for (const p of parts) { if (used.has(p.color)) p.color = PALETTE.find(c => !used.has(c)) || p.color; used.add(p.color); }
  const colorOf = id => parts.find(p => p.categoryId === id)?.color || parts.find(p => p.categoryId === "_rest")?.color || "gray";
  const total = r.total || 1;
  const months = r.projection.map((m, i) => ({ label: periodLabel(m.period).slice(0, 3), value: m.free, current: i === 0 }));
  const negative = r.projection.filter(m => m.free < 0);
  const ends = r.projection.find(m => m.ending.length);
  const period = r.projection[0].period;
  const vsPrev = change(r.total, r.prevTotal);

  return (
    <>
      <header className="row between baseline" style={{ padding: "0 4px" }}>
        <h1 className="t-title" style={{ margin: 0 }}>Analiz</h1>
        <span className="t-sub c-blue" style={{ fontWeight: 500 }}>{monthOf(period)} dönemi</span>
      </header>

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
            {vsPrev ? <><span className={vsPrev.tone}>{vsPrev.text}</span> · {monthOf(prevPeriod(period))}: {fmt(r.prevTotal)}</> : "Geçen dönemde kayıt yok."}
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
                  <span className="row" style={{ gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(--${colorOf(p.categoryId)})`, flex: "none" }} />
                    <span className="grow ellipsis" style={{ fontSize: 15 }}>{p.name}</span>
                    <span className="num b" style={{ fontSize: 15 }}>{fmt(p.value)}</span>
                    <span className="num t-meta" style={{ width: 38, textAlign: "right" }}>%{Math.round(p.value / total * 100)}</span>
                  </span>
                  {ch && <span className={`t-meta ${ch.tone}`} style={{ paddingLeft: 18 }}>{ch.text}</span>}
                </li>
              );
            })}
          </ul>
        </div> : <span className="t-sub">Bu dönemde henüz harcama yok.</span>}
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
          const willOver = l.projected > l.budget;
          return (
            <div key={l.categoryId} className="li">
              <Tile icon={c?.icon} color={c?.color} />
              <span className="stack grow" style={{ gap: 6 }}>
                <span className="row between"><span className="t-body">{l.name}</span><span className={`num ${willOver ? "c-orange b" : "c-2"}`} style={{ fontSize: 14 }}>{fmt(l.spent)} / {fmt(l.budget)}</span></span>
                <span className="track"><i style={{ width: `${Math.min(100, l.spent / l.budget * 100)}%`, background: `var(--${c?.color || "blue"})` }} /><b style={{ left: `${Math.min(100, r.day / r.totalDays * 100)}%` }} /></span>
                <span className={`t-meta${over > 0 ? " c-red" : ""}`}>{over > 0 ? `${fmt(over)} aşıldı` : `${fmt(l.left)} kaldı`}</span>
              </span>
            </div>
          );
        })}
      </section>
      <span className="t-meta" style={{ padding: "0 4px" }}>Dikey çizgi: aylık limitin bugüne düşen kısmı.</span>
      </>}
    </>
  );
}
