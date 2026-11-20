// İlk açılış ekranı: oturum yokken (ya da hesabın bütçesi yokken) uygulamanın yerine gösterilir; örnek veri modunda yoktur.
// Üç yol: Giriş yap · Üye hesabı aç (kayıtla yeni bütçe de kurulur) · Davet kodum var (paylaşılan bütçeye katılma).
// Giriş yapılmış ama bütçesi olmayan hesapta ayrıca "Kısa süreli bütçe kur" (kamp, tatil; EtkinlikSheet) çıkar.
// Formlar HesapSheet'tedir; buradaki düğmeler onu ilgili kipte açar. Düzen onaylı taslak 4'tür: içerik ekranın altında.
import { Tile, Icon } from "../components/ui.jsx";

function Choice({ icon, color, title, sub, onClick, primary }) {
  return (
    <button type="button" className="li v3-gate-row" onClick={onClick}>
      <Tile icon={icon} color={color} solid={primary} />
      <span className="stack grow">
        <span className="v3-gate-t">{title}</span>
        <span className="t-meta">{sub}</span>
      </span>
      <Icon name="chev" size={16} style={{ color: "var(--label3)", flex: "none" }} />
    </button>
  );
}

// status: loading · signedOut · noFamily. open(mode): HesapSheet'i açar. email: bütçesi olmayan hesabın e-postası.
// loading'de üst blok yerinde durur, seçenekler yerine "Yükleniyor…" yazılır; oturum gelince ekran zıplamaz.
export default function Giris({ status, email, open }) {
  const noFamily = status === "noFamily";
  return (
    <>
      <div className="v3-gate-space" aria-hidden="true" />
      <header className="v3-gate-head">
        <Tile icon="wallet" color="blue" solid />
        <div className="stack gap8">
          <h1 className="t-title">Ev Bütçesi</h1>
          <p className="t-sub">{noFamily
            ? `${email || "Hesabınız"} ile giriş yaptınız. Nasıl devam etmek istersiniz?`
            : "Bütçenizi takip edin, sürprizlere izin vermeyin."}</p>
        </div>
      </header>
      {status === "loading"
        ? <p className="t-sub" role="status" style={{ margin: 0, minHeight: 192 }}>Yükleniyor…</p>
        : <section className="list" aria-label="Başlangıç" style={{ "--inset": "64px" }}>
          {noFamily ? <>
            <Choice icon="plus" color="blue" primary title="Bütçe kur" sub="Birkaç adımda hazır olur" onClick={() => open("family")} />
            <Choice icon="people" color="green" title="Davet kodum var" sub="Paylaşılan bir bütçeye katılın" onClick={() => open("invite")} />
            <Choice icon="cal" color="orange" title="Kısa süreli bütçe kur" sub="Kamp, tatil, gezi gibi" onClick={() => open("events")} />
          </> : <>
            <Choice icon="login" color="blue" primary title="Giriş yap" sub="Üye hesabınız varsa" onClick={() => open("login")} />
            <Choice icon="plus" color="orange" title="Üye hesabı aç" sub="İlk kez kullanıyorsanız buradan başlayın" onClick={() => open("register")} />
            <Choice icon="people" color="green" title="Davet kodum var" sub="Paylaşılan bir bütçeye katılın" onClick={() => open("invite")} />
          </>}
        </section>}
    </>
  );
}
