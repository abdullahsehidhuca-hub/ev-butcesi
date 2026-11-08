// v3 ortak bileşenleri. Görünüm v3.css'teki sınıflardan gelir; burada hesap yapılmaz.

import React, { useEffect, useId, useRef } from "react";
import { fmtNumber, symbolOf } from "./format.js";

export function SectionHead({ title, action, onAction, id }) {
  return (
    <div className="v3-head">
      <h2 className="v3-title" id={id}>{title}</h2>
      {action && <button type="button" className="v3-link" onClick={onAction}>{action}</button>}
    </div>
  );
}

// Odak rakam: "26.450 ₺" — sayı büyük, para birimi küçük ve soluk.
export function HeroValue({ minor, currency = "TRY", unit }) {
  return (
    <div className={`v3-hero-val${minor < 0 ? " is-negative" : ""}`}>
      {minor < 0 ? "-" : ""}{fmtNumber(Math.abs(minor))} <span>{unit || symbolOf(currency)}</span>
    </div>
  );
}

// Doluluk çubuğu: %80 altı marka rengi, %80-100 uyarı, aşımda kırmızı.
export function Progress({ ratio, label }) {
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  const tone = ratio > 1 ? " is-over" : ratio >= 0.8 ? " is-warn" : "";
  return (
    <div className="v3-track" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`v3-fill${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Liste satırı. onClick verilirse tüm satır dokunulabilir düğme olur (≥54 px yükseklik).
export function Row({ title, sub, value, valueClass = "", tag, tagClass = "v3-tag", onClick, label }) {
  const body = (
    <>
      <span className="v3-row-main">
        <span className="v3-row-title">{title}</span>
        {sub && <span className="v3-row-sub">{sub}</span>}
      </span>
      {(value != null || tag) && (
        <span className="v3-row-end">
          {value != null && <span className={`v3-row-val ${valueClass}`}>{value}</span>}
          {tag && <span className={tagClass}>{tag}</span>}
        </span>
      )}
    </>
  );
  if (!onClick) return <div className="v3-row">{body}</div>;
  return <button type="button" className="v3-row" onClick={onClick} aria-label={label}>{body}</button>;
}

// Alt çekmece (modal). Esc ve arka plana dokunma kapatır; açılınca ilk alana odaklanır,
// kapanınca odak açan düğmeye döner.
export function Sheet({ title, onClose, children }) {
  const titleId = useId();
  const panel = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Yalnız açılışta çalışır; her tuş vuruşunda odak ilk alana atlamasın.
  useEffect(() => {
    const opener = document.activeElement;
    // Form alanı yoksa (onay çekmecesi) odak "Vazgeç"e gider; Enter yanlışlıkla silmesin.
    const first = panel.current?.querySelector("input, select") || panel.current?.querySelector(".v3-cancel");
    first?.focus();
    const onKey = e => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, []);
  return (
    <div className="v3-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="v3-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel}>
        <div className="v3-handle" aria-hidden="true" />
        <h3 className="v3-sheet-title" id={titleId}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, value, onChange, hint, invalid, inputMode, placeholder, type = "text" }) {
  const id = useId();
  return (
    <div className="v3-field">
      <label className="v3-label" htmlFor={id}>{label}</label>
      <input id={id} className="v3-input" type={type} value={value} inputMode={inputMode} placeholder={placeholder}
        aria-invalid={invalid ? "true" : undefined} aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={e => onChange(e.target.value)} />
      {hint && <p className="v3-hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}

export function SelectField({ label, value, onChange, options, hint }) {
  const id = useId();
  return (
    <div className="v3-field">
      <label className="v3-label" htmlFor={id}>{label}</label>
      <select id={id} className="v3-input" value={value ?? ""} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="v3-hint">{hint}</p>}
    </div>
  );
}

// Tek seçimli düğme grubu (kategori, hesap türü).
export function Chips({ label, options, value, onChange, wrap = false }) {
  return (
    <fieldset className="v3-field">
      <legend className="v3-label">{label}</legend>
      <div className={`v3-pills${wrap ? " is-wrap" : ""}`}>
        {options.map(o => (
          <button key={o.value} type="button" className="v3-chip" aria-pressed={o.value === value}
            onClick={() => onChange(o.value === value ? null : o.value)}>{o.label}</button>
        ))}
      </div>
    </fieldset>
  );
}

// Form içinde kullanılır: "Kaydet" formu gönderir (klavyede Enter da çalışır).
export function Actions({ submit, onCancel, disabled, danger }) {
  return (
    <div className="v3-actions">
      <button type="button" className="v3-cancel" onClick={onCancel}>Vazgeç</button>
      <button type="submit" className={`v3-submit${danger ? " is-danger" : ""}`} disabled={disabled}>{submit}</button>
    </div>
  );
}

export function Form({ onSubmit, children }) {
  return <form noValidate onSubmit={e => { e.preventDefault(); onSubmit(); }}>{children}</form>;
}

export function ErrorText({ errors }) {
  if (!errors?.length) return null;
  return <p className="v3-error" role="alert">{errors.map(e => e.charAt(0).toLocaleUpperCase("tr-TR") + e.slice(1)).join(". ")}.</p>;
}

const ICONS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  chart: <path d="M6 20v-6M12 20V4M18 20v-10" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  plus: <path d="M12 5v14M5 12h14" />
};

export function Icon({ name, size = 21, width = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[name]}</svg>
  );
}
