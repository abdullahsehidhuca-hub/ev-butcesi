// C6 · Ayarlar: Apple Ayarlar düzeninde gruplu liste. Görünüm satırı temayı gerçekten değiştirir.
import { Tile, Icon, Avatar } from "../components/ui.jsx";
import { balanceOf } from "../../core/index.js";
import { fmt, mainAccountId } from "../selectors.js";

const THEMES = [["system", "Sistem"], ["light", "Açık"], ["dark", "Koyu"]];

function Row({ icon, color, title, sub, value, onClick, tint }) {
  return (
    <button className="li" onClick={onClick} style={{ minHeight: 52, padding: "10px 16px" }}>
      <Tile icon={icon} color={color} solid small />
      <span className="stack grow gap2">
        <span className={`t-body${tint ? " c-blue" : ""}`}>{title}</span>
        {sub && <span className="t-meta">{sub}</span>}
      </span>
      {value != null && <span className="t-body c-2">{value}</span>}
      <Icon name="chev" size={14} style={{ color: "var(--label3)" }} />
    </button>
  );
}

export default function Ayarlar({ state, today, members, theme, onTheme, onReset }) {
  const self = Object.values(members).find(m => m.self);
  const others = Object.values(members).filter(m => !m.self);
  const income = Object.values(state.obligations).find(o => o.kind === "income");
  const accounts = Object.values(state.accounts);
  const recurring = Object.values(state.obligations).filter(o => o.kind !== "income").length;
  const nextTheme = () => onTheme(THEMES[(THEMES.findIndex(t => t[0] === theme) + 1) % THEMES.length][0]);
  const group = { "--inset": "58px" };

  return (
    <>
      <h1 className="t-title" style={{ margin: 0, padding: "0 4px" }}>Ayarlar</h1>
      <section className="card" style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14 }}>
        <Avatar member={self} size={52} />
        <span className="stack grow gap2"><span className="b" style={{ fontSize: 19 }}>{self?.name}</span><span className="t-sub">Ev bütçesi · {Object.keys(members).length} kişi</span></span>
        <Icon name="chev" size={16} style={{ color: "var(--label3)" }} />
      </section>

      <span className="t-cap">Aile</span>
      <section className="list" style={group}>
        {others.map(m => (
          <button key={m.id} className="li" style={{ minHeight: 52 }}>
            <Avatar member={m} size={30} />
            <span className="stack grow gap2"><span className="t-body">{m.name}</span><span className="t-meta">Katıldı · kayıtlar ortak</span></span>
            <Icon name="chev" size={14} style={{ color: "var(--label3)" }} />
          </button>
        ))}
        <Row icon="plus" color="blue" title="Aile üyesi davet et" tint />
      </section>

      <span className="t-cap">Dönem</span>
      <section className="list" style={group}>
        <Row icon="cal" color="red" title="Maaş günü" value={`Her ayın ${state.settings?.payDay || 1}’i`} />
        {income && <Row icon="cash" color="green" title="Aylık gelir" value={fmt(income.amount)} />}
        <Row icon="bell" color="orange" title="Ödeme hatırlatması" value="1 gün önce" />
      </section>

      <span className="t-cap">Hesaplar ve kartlar</span>
      <section className="list" style={group}>
        {accounts.map(a => a.type === "credit"
          ? <Row key={a.id} icon="card" color="pink" title={a.name} sub={[a.cutoffDay && `Kesim ${a.cutoffDay}’i`, a.paymentDay && `son ödeme ${a.paymentDay}’u`].filter(Boolean).join(" · ") || "Kredi kartı"} />
          : <Row key={a.id} icon={a.type === "cash" ? "cash" : "home"} color={a.id === mainAccountId(state) ? "indigo" : a.type === "cash" ? "teal" : "blue"} title={a.name} value={fmt(balanceOf(state, a.id, today))} />)}
      </section>

      <span className="t-cap">Düzen</span>
      <section className="list" style={group}>
        <Row icon="tag" color="purple" title="Kategoriler ve limitler" value={Object.values(state.categories).filter(c => !c.archived).length} />
        <Row icon="repeat" color="blue" title="Tekrarlayan ödemeler" value={recurring} />
      </section>

      <span className="t-cap">Veri ve görünüm</span>
      <section className="list" style={group}>
        <Row icon="cloud" color="cyan" title="Yedekleme" value="Bağlı değil" />
        <Row icon="export" color="gray" title="Dışa aktar (CSV)" />
        <Row icon="moon" color="indigo" title="Görünüm" value={THEMES.find(t => t[0] === theme)?.[1]} onClick={nextTheme} />
        {onReset && <Row icon="repeat" color="red" title="Örnek veriye dön" onClick={onReset} />}
      </section>
    </>
  );
}
