// Geliştirme: /?ornek=yedek — eski uygulamanın yedek dosyasıyla (ev-butcesi-YYYY.MM.DD.json) örnek veri.
// Dosya depoya girmeyen `yedek/` klasöründen okunur (gerçek mali veri; .gitignore). Üretim paketine girmez:
// yalnız src/main.jsx'teki import.meta.env.DEV dalından yüklenir. Birden çok dosya varsa adı en büyük (en yeni) seçilir.
// "Bugün" yedekteki son hareket tarihidir; böylece ekranlar yedeğin alındığı günkü gibi dolu görünür.
import { convertLegacy, isLegacyData } from "./legacyImport.js";

const files = import.meta.glob("../../yedek/*.json", { eager: true, import: "default" });

export function load() {
  const names = Object.keys(files).sort();
  const name = names.at(-1);
  const data = name ? files[name] : null;
  if (!isLegacyData(data)) throw new Error("yedek/ klasöründe eski uygulama yedeği (ev-butcesi-*.json) yok.");
  const lastDate = Object.values(data.months || {})
    .flatMap(m => [...(m.ccSingle || []), ...(m.accountEntries || []), ...(m.billEntries || []), ...(m.incomeEntries || [])])
    .map(e => e?.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d || "")).sort().at(-1);
  const SAMPLE_TODAY = [data.lastBackup, lastDate].filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 10);
  const converted = convertLegacy(data, { today: SAMPLE_TODAY });
  if (converted.warnings.length) console.info("Yedek dönüşümü uyarıları:", converted.warnings);
  return {
    SAMPLE_TODAY,
    SAMPLE_MEMBERS: {},
    SAMPLE_LABEL: `Yedek verisi (${name.split("/").pop()})`,
    STATE_KEY: "evButcesi.v3.yedekOrnek.state",
    PLAN_KEY: "evButcesi.v3.yedekOrnek.plan",
    buildSampleState: () => convertLegacy(data, { today: SAMPLE_TODAY }).state
  };
}
