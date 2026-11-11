// Rapor grafikleri (B3 düzeni): harcama dağılımı halkası ve 6 aylık "ay sonunda kalan" çubukları.
import { fmtK } from "../selectors.js";

// parts: [{ name, value, color }] — color CSS değişken adı.
export function Donut({ parts, size = 140, stroke = 20, center }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const c = size / 2, r = c - stroke / 2 - 1, gap = 0.05;
  let a0 = -Math.PI / 2;
  // Anahtar: aynı ad iki dilimde olabilir ("Diğer" kategorisi ile birleştirilmiş "Diğer"); kimlik ya da sıra kullanılır.
  const arcs = parts.map((p, i) => {
    const sweep = (p.value / total) * Math.PI * 2;
    const s = a0 + (parts.length > 1 ? gap / 2 : 0), e = a0 + sweep - (parts.length > 1 ? gap / 2 : 0);
    a0 += sweep;
    if (parts.length === 1) return <circle key={p.categoryId || `${p.name}-${i}`} cx={c} cy={c} r={r} fill="none" stroke={`var(--${p.color})`} strokeWidth={stroke} />;
    const large = e - s > Math.PI ? 1 : 0;
    const d = `M${c + r * Math.cos(s)} ${c + r * Math.sin(s)} A${r} ${r} 0 ${large} 1 ${c + r * Math.cos(e)} ${c + r * Math.sin(e)}`;
    return <path key={p.categoryId || `${p.name}-${i}`} d={d} fill="none" stroke={`var(--${p.color})`} strokeWidth={stroke} />;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={parts.map(p => `${p.name} yüzde ${Math.round(p.value / total * 100)}`).join(", ")}>
      {arcs}
      {center && <text x={c} y={c + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--label2)">{center}</text>}
    </svg>
  );
}

// months: [{ label, value (kuruş), current }] — eksi değer kırmızı ve kısa çubuk.
export function MonthBars({ months, height = 110 }) {
  const max = Math.max(1, ...months.map(m => Math.abs(m.value)));
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: height + 44 }} role="img"
      aria-label={months.map(m => `${m.label} ${fmtK(m.value)} bin lira`).join(", ")}>
      {months.map(m => {
        const neg = m.value < 0;
        const h = Math.max(8, Math.round(Math.abs(m.value) / max * height));
        const color = neg ? "var(--red)" : m.current ? "var(--blue)" : "var(--gray4)";
        return (
          <div key={m.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span className="num b" style={{ fontSize: 13, color: neg ? "var(--red)" : "var(--label)" }}>{fmtK(m.value)}</span>
            <span style={{ width: "100%", maxWidth: 40, height: h, borderRadius: 10, background: color, opacity: neg || m.current ? 1 : .85 }} />
            <span style={{ fontSize: 13, fontWeight: neg ? 600 : 500, color: neg ? "var(--red)" : "var(--label2)" }}>{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}
