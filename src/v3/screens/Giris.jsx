// İlk açılış ekranı: oturum yokken (ya da hesabın bütçesi yokken) uygulamanın yerine gösterilir; örnek veri modunda yoktur.
// Üç yol: Giriş yap · Üye hesabı aç · Davet kodum var (paylaşılan bütçeye katılma). Üye hesabı açan kişi bütçesi olmayan
// hesabın seçimine gelir: Bütçe kur · Davet kodum var · Kısa süreli bütçe kur (EtkinlikSheet).
// Birden çok bütçe takip eden kişi açılışta bütçesini seçer (BudgetPicker, onaylı taslak 2 · Renkle tanınan bütçeler).
// Formlar HesapSheet'tedir; buradaki düğmeler onu ilgili kipte açar. Düzen onaylı taslak 4'tür: içerik ekranın altında.
// Her seçenek karşılamadaki gibi kendi kartıdır (v3-gate-card); yalnız ana yol (Giriş yap, Bütçe kur) parlak mavi karttır.
import { SetupIcon, Icon } from "../components/ui.jsx";

function Choice({ icon, color, title, sub, onClick, primary }) {
  return (
    <button type="button" className={`v3-gate-row v3-gate-card${primary ? " is-primary" : ""}`} onClick={onClick}>
      <SetupIcon icon={icon} color={color} />
      <span className="stack grow">
        <span className="v3-gate-t">{title}</span>
        <span className="t-meta">{sub}</span>
      </span>
      <Icon name="chev" size={16} />
    </button>
  );
}

// status: loading · signedOut · noFamily. open(mode): HesapSheet'i açar. email: bütçesi olmayan hesabın e-postası.
// loading'de üst blok yerinde durur, seçeneklerin yerinde üç iskelet kart durur; oturum gelince ekran zıplamaz.
export default function Giris({ status, email, open }) {
  const noFamily = status === "noFamily";
  return (
    <>
      <div className="v3-gate-space" aria-hidden="true" />
      <header className="v3-gate-head">
        <SetupIcon icon="wallet" color="blue" />
        <div className="stack gap8">
          <h1 className="t-title">Ev Bütçesi</h1>
          <p className="t-sub">{noFamily
            ? `${email ? `${email} ile giriş yaptınız` : "Giriş yaptınız"}. Nasıl devam etmek istersiniz?`
            : "Bütçenizi takip edin, sürprizlere izin vermeyin."}</p>
        </div>
      </header>
      {status === "loading"
        ? <section className="v3-gate-cards" aria-busy="true">
          <p className="visually-hidden" role="status">Ev Bütçesi açılıyor…</p>
          {[0, 1, 2].map(i => <span key={i} className="v3-gate-skel" aria-hidden="true" />)}
        </section>
        : <section className="v3-gate-cards" aria-label="Başlangıç">
          {noFamily ? <>
            <Choice icon="plus" color="blue" primary title="Bütçe kur" sub="Birkaç adımda hazır olur" onClick={() => open("family")} />
            <Choice icon="people" color="green" title="Davet kodum var" sub="Paylaşılan bir bütçeye katılın" onClick={() => open("invite")} />
            <Choice icon="cal" color="orange" title="Kısa süreli bütçe kur" sub="Gezi ya da ortak bir harcama için, belirli tarihler arasında" onClick={() => open("events")} />
          </> : <>
            <Choice icon="login" color="blue" primary title="Giriş yap" sub="Üye hesabınız varsa" onClick={() => open("login")} />
            <Choice icon="plus" color="orange" title="Üye hesabı aç" sub="İlk kez kullanıyorsanız buradan başlayın" onClick={() => open("register")} />
            <Choice icon="people" color="green" title="Davet kodum var" sub="Paylaşılan bir bütçeye katılın" onClick={() => open("invite")} />
          </>}
        </section>}
    </>
  );
}

// Bütçe simgesi: adın ilk harfi, bütçenin sırasına göre renk (kırmızı uyarılara ayrıldığı için palette yok).
const BUDGET_COLORS = 4;
const budgetLabel = b => b.name || (b.admin ? "Kendi bütçeniz" : "Paylaşılan bütçe");

// Birden çok bütçe takip eden kişinin açılış ekranı. budgets: useCloud'un listesi; onPick(id) bütçeyi açar;
// open(mode): HesapSheet'i "family" (yeni bütçe) ya da "invite" kipinde açar.
// Her bütçe kendi kartıdır; bütçeler eşit seçenek olduğundan hiçbiri parlak ana kart değildir.
export function BudgetPicker({ budgets, onPick, open }) {
  return (
    <>
      <div className="v3-gate-space" aria-hidden="true" />
      <header className="v3-gate-head">
        <SetupIcon icon="wallet" color="blue" />
        <h1 className="t-title">Hangi bütçeyi açmak istersiniz?</h1>
      </header>
      <span className="t-cap">Bütçeleriniz</span>
      <section className="v3-gate-cards" aria-label="Bütçeleriniz">
        {budgets.map((b, i) => (
          <button key={b.id} type="button" className="v3-gate-row v3-gate-card" onClick={() => onPick(b.id)}>
            <span className={`tile v3-budget-tile bc${i % BUDGET_COLORS}`} aria-hidden="true">{budgetLabel(b).charAt(0).toLocaleUpperCase("tr-TR")}</span>
            <span className="stack grow">
              <span className="v3-gate-t">{budgetLabel(b)}</span>
              <span className="t-meta">{b.count > 1 ? `${b.count} üye` : "Sadece siz"}</span>
            </span>
            <Icon name="chev" size={16} />
          </button>
        ))}
      </section>
      <span className="t-cap">Başka bütçe</span>
      <section className="v3-gate-cards" aria-label="Başka bütçe">
        <Choice icon="plus" color="gray" title="Yeni bütçe kur" sub="Birkaç adımda hazır olur" onClick={() => open("family")} />
        <Choice icon="people" color="gray" title="Davet kodum var" sub="Paylaşılan bir bütçeye katılın" onClick={() => open("invite")} />
      </section>
    </>
  );
}
