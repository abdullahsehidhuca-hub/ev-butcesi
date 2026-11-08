// Ayarlar (taslak C6): Apple Ayarlar düzeninde gruplu liste. Satırlar mevcut v3 çekmecelerini açar;
// dokunulmayan satır düğme değildir. Görünüm satırı temayı değiştirir.
import { useRef } from "react";
import { Tile, Icon } from "../components/ui.jsx";
import { balanceOf } from "../../core/index.js";
import { fmt, mainAccountId } from "../selectors.js";

const THEMES = [["system", "Sistem"], ["light", "Açık"], ["dark", "Koyu"]];
const KIND = { fixed: "Sabit ödeme", installment: "Taksit", debt: "Borç", income: "Gelir" };
const ACCOUNT_TYPE = { bank: "Banka hesabı", cash: "Nakit", credit: "Kredi kartı", debit: "Banka kartı" };
const join = (...parts) => parts.filter(Boolean).join(" · ");
const byName = (a, b) => a.name.localeCompare(b.name, "tr");

function Row({ icon, color, title, sub, value, onClick, tint, danger, href }) {
  const body = (
    <>
      <Tile icon={icon} color={color} solid small />
      <span className="stack grow gap2" style={{ minWidth: 0 }}>
        <span className={`t-body${tint ? " c-blue" : danger ? " c-red" : ""}`}>{title}</span>
        {sub && <span className="t-meta">{sub}</span>}
      </span>
      {value != null && <span className="t-body c-2 num" style={{ whiteSpace: "nowrap" }}>{value}</span>}
      {(onClick || href) && <Icon name="chev" size={14} style={{ color: "var(--label3)", flex: "none" }} />}
    </>
  );
  const style = { minHeight: 52, padding: "10px 16px" };
  if (href) return <a className="li" href={href} style={{ ...style, color: "inherit", textDecoration: "none" }}>{body}</a>;
  if (onClick) return <button type="button" className="li" onClick={onClick} style={style}>{body}</button>;
  return <div className="li" style={style}>{body}</div>;
}

export default function Ayarlar({ state, today, open, theme, onTheme, backup }) {
  const fileRef = useRef(null);
  const accounts = Object.values(state.accounts);
  const categories = Object.values(state.categories).filter(c => !c.archived).sort(byName);
  const obligations = Object.values(state.obligations).sort(byName);
  const hasAccount = accounts.length > 0;
  const main = hasAccount ? mainAccountId(state) : null;
  const nextTheme = () => onTheme(THEMES[(THEMES.findIndex(t => t[0] === theme) + 1) % THEMES.length][0]);
  const group = { "--inset": "58px" };

  return (
    <>
      <h1 className="t-title" style={{ margin: 0, padding: "0 4px" }}>Ayarlar</h1>

      <span className="t-cap">Dönem</span>
      <section className="list" style={group} aria-label="Dönem">
        <Row icon="cal" color="red" title="Maaş / ay döngüsü" value={`Her ayın ${state.settings.payDay}. günü`} onClick={() => open({ name: "payday" })} />
      </section>

      <span className="t-cap">Hesaplar ve kartlar</span>
      <section className="list" style={group} aria-label="Hesaplar ve kartlar">
        {accounts.map(a => (
          <Row key={a.id}
            icon={a.type === "credit" ? "card" : a.type === "cash" ? "cash" : "wallet"}
            color={a.type === "credit" ? "pink" : a.id === main ? "indigo" : a.type === "cash" ? "teal" : "blue"}
            title={a.name}
            sub={join(ACCOUNT_TYPE[a.type], a.currency !== "TRY" && a.currency, a.cutoffDay && `Kesim günü ${a.cutoffDay}`, state.settings.defaultAccountId === a.id && "Varsayılan")}
            value={a.currency === "TRY" ? fmt(balanceOf(state, a.id, today)) : null} />
        ))}
        <Row icon="plus" color="blue" title="Hesap ekle" tint onClick={() => open({ name: "account" })} />
      </section>

      <span className="t-cap">Kategoriler ve limitler</span>
      <section className="list" style={group} aria-label="Kategoriler">
        {categories.map(c => (
          <Row key={c.id} icon={c.icon || "tag"} color={c.color || "purple"} title={c.name}
            sub={c.keywords?.length ? `Tanıma: ${c.keywords.join(", ")}` : null} value={c.budget ? `${fmt(c.budget)} /ay` : null} />
        ))}
        <Row icon="plus" color="blue" title="Kategori ekle" tint onClick={() => open({ name: "category" })} />
      </section>

      <span className="t-cap">Düzenli ödemeler ve gelirler</span>
      <section className="list" style={group} aria-label="Düzenli ödemeler ve gelirler">
        {obligations.map(o => (
          <Row key={o.id} icon={o.icon || (o.kind === "income" ? "cash" : o.kind === "fixed" ? "repeat" : "card")}
            color={o.color || (o.kind === "income" ? "green" : o.kind === "fixed" ? "orange" : "teal")}
            title={o.name}
            sub={join(KIND[o.kind], state.accounts[o.accountId]?.name, o.count ? `${o.count} taksit` : o.dueDay && `Her ayın ${o.dueDay}. günü`, o.endPeriod && "Sonlandırıldı")}
            value={`${o.kind === "income" ? "+" : ""}${fmt(o.amount)}`} />
        ))}
        {hasAccount ? (
          <>
            <Row icon="plus" color="green" title="Maaş / gelir ekle" tint onClick={() => open({ name: "obligation", kind: "income" })} />
            <Row icon="plus" color="orange" title="Sabit ödeme ekle" tint onClick={() => open({ name: "obligation", kind: "fixed" })} />
            <Row icon="plus" color="teal" title="Taksitli alışveriş ekle" tint onClick={() => open({ name: "installment" })} />
          </>
        ) : (
          <p className="t-sub" style={{ margin: 0, padding: 16 }}>Düzenli ödeme eklemek için önce bir hesap ekleyin.</p>
        )}
      </section>

      <span className="t-cap">Veri ve görünüm</span>
      <section className="list" style={group} aria-label="Veri ve görünüm">
        <Row icon="moon" color="indigo" title="Görünüm" value={THEMES.find(t => t[0] === theme)?.[1]} onClick={nextTheme} />
        <Row icon="cloud" color="cyan" title="Bu cihazda saklanıyor" sub="Bulut eşitleme ve aile paylaşımı sonraki adımda; düzenli yedek alın." />
        {backup && <>
          <Row icon="export" color="green" title="Yedek indir" sub="Tüm v3 verisi tek dosyada (JSON)" onClick={backup.exportJson} />
          <Row icon="repeat" color="orange" title="Yedekten geri yükle" sub="Bu cihazdaki v3 verisinin yerine geçer; önce sorar" onClick={() => fileRef.current?.click()} />
          <Row icon="export" color="teal" title="İşlemleri CSV olarak indir" sub={`${Object.keys(state.transactions).length} işlem · Excel ve Numbers ile açılır`} onClick={backup.exportCsv} />
          <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-hidden="true" tabIndex={-1}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) backup.restore(f); }} />
        </>}
        <Row icon="alert" color="red" title="Tüm verileri sil" sub="Yalnız bu sürümün verisi; eski uygulama etkilenmez" danger onClick={() => open({ name: "reset" })} />
        <Row icon="back" color="gray" title="Eski sürüme dön" sub="Yayındaki uygulama değişmedi" href="/" />
      </section>
    </>
  );
}
