// İlk açılış ekranı: oturum yokken (ya da hesabın ailesi yokken) uygulamanın yerine gösterilir; örnek veri modunda yoktur.
// Üç yol: Giriş yap · Kayıt ol (aileyi kuran kişi; kayıtla aile hesabı kurulur) · Davet kodum var (aileye katılan üye).
// Formlar HesapSheet'tedir; buradaki düğmeler onu ilgili kipte açar.
import { Tile, Icon } from "../components/ui.jsx";

function Choice({ icon, color, title, sub, onClick, primary }) {
  return (
    <button type="button" className="li" onClick={onClick} style={{ minHeight: 64, padding: "10px 16px" }}>
      <Tile icon={icon} color={color} solid={primary} />
      <span className="stack grow gap2">
        <span className="t-body b">{title}</span>
        <span className="t-meta">{sub}</span>
      </span>
      <Icon name="chev" size={14} style={{ color: "var(--label3)", flex: "none" }} />
    </button>
  );
}

// status: signedOut · noFamily. open(mode): HesapSheet'i açar. email: aile kurmamış hesabın e-postası.
export default function Giris({ status, email, open }) {
  const noFamily = status === "noFamily";
  return (
    <>
      <header className="stack gap8" style={{ padding: "32px 4px 8px" }}>
        <Tile icon="wallet" color="blue" solid />
        <h1 className="t-title" style={{ margin: 0 }}>Ev Bütçesi</h1>
        <span className="t-sub">{noFamily
          ? `${email || "Hesabınız"} ile giriş yaptınız. Devam etmek için aile hesabınızı kurun ya da davet koduyla ailenize katılın.`
          : "Ailenizin bütçesi tek yerde: harcamalar, ödemeler ve maaşa kadar kalan para. Tüm aile aynı veriyi görür."}</span>
      </header>
      <section className="list" aria-label="Başlangıç" style={{ "--inset": "64px" }}>
        {noFamily ? <>
          <Choice icon="home" color="blue" primary title="Aile hesabı kur" sub="Aileyi siz başlatırsınız; üyelerinize davet kodu gönderirsiniz" onClick={() => open("family")} />
          <Choice icon="people" color="green" title="Davet kodum var" sub="Size gönderilen 6 karakterli kodla ailenize katılın" onClick={() => open("family")} />
        </> : <>
          <Choice icon="check" color="blue" primary title="Giriş yap" sub="Hesabınız varsa" onClick={() => open("login")} />
          <Choice icon="home" color="orange" title="Kayıt ol" sub="Aileyi siz başlatın; eşinize ve çocuklarınıza davet kodu gönderin" onClick={() => open("register")} />
          <Choice icon="people" color="green" title="Davet kodum var" sub="Size gönderilen 6 karakterli kodla ailenize katılın" onClick={() => open("invite")} />
        </>}
      </section>
    </>
  );
}
