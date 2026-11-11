// C5 · Rapor — grafik yapısı B3'teki gibi: öneri kartları, harcama dağılımı halkası,
// önümüzdeki 6 ay "ay sonunda kalan" çubukları; altında kategori limitleri.
import { Tile, Icon } from "../components/ui.jsx";
import { Donut, MonthBars } from "../components/charts.jsx";
import { report, fmt, periodLabel } from "../selectors.js";

const PALETTE = ["teal", "orange", "red", "purple", "indigo", "pink", "gray"];

export default function Rapor({ state, today }) {
  const r = report(state, today);
  const parts = r.parts.map((p, i) => ({ ...p, color: state.categories[p.categoryId]?.color || PALETTE[i % PALETTE.length] }));
  // Aynı renk iki kez gelirse paletten farklı bir renk seç.
  const used = new Set(); for (const p of parts) { if (used.has(p.color)) p.color = PALETTE.find(c => !used.has(c)) || p.color; used.add(p.color); }
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const months = r.projection.map((m, i) => ({ label: periodLabel(m.period).slice(0, 3), value: m.free, current: i === 0 }));
  const negative = r.projection.filter(m => m.free < 0);
  const ends = r.projection.find(m => m.ending.length);

  return (
    <>
      <header className="row between baseline" style={{ padding: "0 4px" }}>
        <h1 className="t-title" style={{ margin: 0 }}>Rapor</h1>
        <span className="t-sub c-blue" style={{ fontWeight: 500 }}>{periodLabel(r.projection[0].period).split(" ")[0]} dönemi</span>
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
        <span className="t-body b">Harcandı · <span className="num">{fmt(r.total)}</span></span>
        <div className="row" style={{ gap: 18 }}>
          <Donut parts={parts} center={`${parts.length} kategori`} />
          <div className="stack grow" style={{ gap: 10 }}>
            {parts.map(p => (
              <div key={p.name} className="row" style={{ gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(--${p.color})`, flex: "none" }} />
                <span className="t-meta grow ellipsis" style={{ fontSize: 14 }}>{p.name}</span>
                <span className="num b" style={{ fontSize: 14 }}>%{Math.round(p.value / total * 100)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card" style={{ gap: 12 }} aria-label="Önümüzdeki 6 ay">
        <div className="row between baseline"><span className="t-body b">Ay sonunda kalan</span><span className="t-meta">bin ₺ · plan</span></div>
        <MonthBars months={months} />
        <span className={`t-meta${negative.length ? " c-red" : ""}`}>
          {negative.length ? `${periodLabel(negative[0].period).split(" ")[0]}’ta ödemeler ve bütçeler gelirin üstünde.` : ends ? `${ends.ending.join(", ")} ${periodLabel(ends.period).split(" ")[0]}’ta bitiyor; sonraki ay rahatlıyor.` : "Gelir − ödemeler − kategori bütçeleri."}
        </span>
      </section>

      <span className="t-cap">Kategori limitleri</span>
      <section className="list" style={{ "--inset": "64px" }}>
        {r.limits.map(l => {
          const c = state.categories[l.categoryId];
          const over = l.projected > l.budget;
          return (
            <div key={l.categoryId} className="li">
              <Tile icon={c?.icon} color={c?.color} />
              <span className="stack grow" style={{ gap: 6 }}>
                <span className="row between"><span className="t-body">{l.name}</span><span className={`num ${over ? "c-orange b" : "c-2"}`} style={{ fontSize: 14 }}>{fmt(l.spent)} / {fmt(l.budget)}</span></span>
                <span className="track"><i style={{ width: `${Math.min(100, l.spent / l.budget * 100)}%`, background: `var(--${c?.color || "blue"})` }} /><b style={{ left: `${r.day / 30 * 100}%` }} /></span>
              </span>
            </div>
          );
        })}
      </section>
      <span className="t-meta" style={{ padding: "0 4px" }}>Siyah çizgi: aylık limitin bugüne düşen kısmı.</span>
    </>
  );
}
