// Ortak küçük bileşenler: ikon, renkli ikon karesi, tarih, kişi rozeti, sekme çubuğu, alttan açılan sayfa.
import { useEffect } from "react";
import { dayNum, monthShort } from "../selectors.js";

const PATHS = {
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  card: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10.5h18M7 15h4" /></>,
  cart: <><path d="M3 4h2.5l2.2 11h10.5l2-8H7" /><circle cx="9.5" cy="19.5" r="1.4" fill="currentColor" /><circle cx="17" cy="19.5" r="1.4" fill="currentColor" /></>,
  fuel: <path d="M5 20V5a1 1 0 011-1h7a1 1 0 011 1v15M4 20h11M5 10h9M14 8l3 3v6a1.5 1.5 0 003 0V9l-3-3" />,
  food: <path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M16 3c-2 1-3 4-3 7h3v11" />,
  health: <path d="M12 21s-8-5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 6-8 11-8 11z" />,
  shirt: <path d="M8 3l4 2 4-2 5 4-3 3-2-1v12H8V9l-2 1-3-3z" />,
  bolt: <path d="M13 2L5 13h6l-1 9 8-11h-6z" />,
  flame: <path d="M12 22a6 6 0 006-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8a6 6 0 006 6z" />,
  fridge: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M6 9h12M9 5v2M9 12v3" /></>,
  more: <><circle cx="6" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="18" cy="12" r="1.5" fill="currentColor" /></>,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chev: <path d="M9 5l7 7-7 7" />,
  back: <path d="M15 5l-7 7 7 7" />,
  wallet: <><path d="M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H4z" /><path d="M4 7l11-3v3" /><circle cx="16" cy="13.5" r="1.3" fill="currentColor" /></>,
  cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /></>,
  ozet: <><path d="M4 13a8 8 0 1116 0" /><path d="M12 13l3.5-4" /><path d="M4 18h16" /></>,
  cal: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  pie: <><path d="M12 3a9 9 0 109 9h-9z" /><path d="M15 3.5A9 9 0 0120.5 9H15z" /></>,
  ayarlar: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2.4" fill="var(--card)" /><circle cx="15" cy="17" r="2.4" fill="var(--card)" /></>,
  bell: <><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" fill="currentColor" /></>,
  repeat: <path d="M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5" />,
  cloud: <path d="M7 18h10a4 4 0 00.5-8A6 6 0 006 9.5 4.3 4.3 0 007 18z" />,
  export: <><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 13v7h14v-7" /></>,
  moon: <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />,
  receipt: <><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0M16 5a3 3 0 010 6M18 14a5 5 0 013 6" /></>
};

export function Icon({ name, size = 22, stroke = 2, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      {PATHS[name] || PATHS.more}
    </svg>
  );
}

// Kategori/kalem için renkli ikon karesi. color: CSS değişken adı (teal, orange…).
export function Tile({ icon, color = "gray", solid = false, small = false }) {
  return (
    <span className={`tile${solid ? " solid" : ""}${small ? " sq30" : ""}`} style={{ "--tc": `var(--${color})` }}>
      <Icon name={icon} size={small ? 18 : 20} />
    </span>
  );
}

export function DateBadge({ date, tone }) {
  const c = tone ? `var(--${tone})` : undefined;
  return (
    <span className="date" aria-label={`${dayNum(date)} ${monthShort(date)}`}>
      <span className="d" style={{ color: c }}>{dayNum(date)}</span>
      <span className="m" style={{ color: c }}>{monthShort(date)}</span>
    </span>
  );
}

export function Avatar({ member, size = 32 }) {
  if (!member) return null;
  return (
    <span className="num" title={member.name} style={{ width: size, height: size, borderRadius: size / 2, background: `var(--${member.color})`, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: Math.round(size * .42), border: "2px solid var(--bg)", flex: "none" }}>
      {member.initial}
    </span>
  );
}

// Onaylı tasarımdaki menü (mockups/v3-tasarim/a.png): Özet · Ödemeler · Rapor · Ayarlar (+ ayrı ekle düğmesi).
// Kimlikler adres çubuğundaki #home, #plan, #report, #settings değerleridir; değişmez.
export const TABS = [["home", "Özet", "ozet"], ["plan", "Ödemeler", "cal"], ["report", "Rapor", "pie"], ["settings", "Ayarlar", "ayarlar"]];

export function TabBar({ tab, onTab, onAdd }) {
  return (
    <nav className="tabbar" aria-label="Ana menü">
      <div className="tabs">
        {TABS.map(([id, label, icon]) => (
          <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => onTab(id)}>
            <Icon name={icon} size={24} />{label}
          </button>
        ))}
      </div>
      <button type="button" className="fab" aria-label="Hızlı harcama ekle" onClick={onAdd}><Icon name="plus" size={26} stroke={2.4} /></button>
    </nav>
  );
}

// Alttan açılan sayfa. Arka plana dokunmak ya da Escape kapatır; kapanınca odak açan düğmeye döner.
export function Sheet({ onClose, children, label }) {
  useEffect(() => {
    const opener = document.activeElement;
    return () => opener?.focus?.();
  }, []);
  useEffect(() => {
    const k = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <span className="grabber" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function Check({ on, onClick, label }) {
  return (
    <button type="button" className={`check${on ? " on" : ""}`} onClick={onClick} aria-pressed={!!on} aria-label={label}>
      <span>{on && <Icon name="check" size={14} stroke={3} />}</span>
    </button>
  );
}
