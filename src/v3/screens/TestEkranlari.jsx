// Ekran seçici (/?test): yalnız geliştirmede ve TestFlight derlemesinde açılır (testTools.js). Her satır uygulamayı
// bir test senaryosuyla, baştan kurulmuş veriyle açar; böylece giriş ve kurulum adımlarını her seferinde yeniden
// geçmeden yalnız düzenlenen ekrana bakılır. Senaryolar bulut kullanmaz; gerçek veriye dokunmaz.
import { Tile, Icon } from "../components/ui.jsx";
import { SCENARIOS, stateKey, planKey } from "../testScenarios.js";
import "../v3.css";

const GROUP_ICON = { "Hoş geldiniz": ["plus", "blue"], "Özet": ["wallet", "indigo"], "Ayarlar": ["cal", "gray"] };

// Önceki denemenin verisi silinir; senaryo her açılışta ilk haliyle başlar.
function start(sc) {
  try { localStorage.removeItem(stateKey(sc.id)); localStorage.removeItem(planKey(sc.id)); } catch { /* depolama kapalıysa örnek yine kurulur */ }
  location.assign(`/?ornek=${sc.id}${sc.tab ? `#${sc.tab}` : ""}`);
}

export default function TestEkranlari() {
  const groups = [...new Set(SCENARIOS.map(s => s.group))];
  return (
    <div className="v3">
      <main className="v3-scroll">
        <header className="stack gap2" style={{ padding: "0 4px" }}>
          <h1 className="t-title" style={{ margin: 0 }}>Test ekranları</h1>
          <span className="t-sub">Ekran örnek veriyle, baştan açılır. Gerçek verinize dokunmaz; bu liste yalnız test sürümünde görünür.</span>
        </header>
        {groups.map(g => { const [icon, color] = GROUP_ICON[g] || ["spark", "blue"]; return (
          <section key={g} className="stack gap8" aria-label={g}>
            <span className="t-cap">{g}</span>
            <div className="list" style={{ "--inset": "64px" }}>
              {SCENARIOS.filter(s => s.group === g).map(s => (
                <button key={s.id} type="button" className="li" onClick={() => start(s)}>
                  <Tile icon={icon} color={color} />
                  <span className="stack grow gap2">
                    <span className="t-body b">{s.title}</span>
                    <span className="t-meta">{s.sub}</span>
                  </span>
                  <Icon name="chev" size={14} style={{ color: "var(--label3)" }} />
                </button>
              ))}
            </div>
          </section>
        ); })}
        <a className="pill blue" href="/" style={{ justifyContent: "center", minHeight: 50, borderRadius: 14, fontSize: 17, textDecoration: "none" }}>Gerçek veriye dön</a>
      </main>
    </div>
  );
}
