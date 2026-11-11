// Beklenen metinler ilk ekranda, kaydırmadan görünenlerdir (OCR ekran görüntüsünü okur).
// iOS Simülatörü Safari turu adımları (scripts/ios-simulator-tur.mjs). Örnek veri yalnız geliştirme
// sunucusunda (?ornek) açılır; gerçek veriye dokunmaz. Sekmeler adres kısmındaki # ile seçilir.
const base = process.env.TUR_BASE || "http://localhost:5180/?ornek";
export default [
  { name: "01-ozet", url: `${base}#home`, wait: 6000, expect: ["Serbest", "Bankada", "Özet", "Ödemeler", "Rapor", "Ayarlar"] },
  { name: "02-odemeler", url: `${base}#plan`, expect: ["Ödemeler", "Kalan ödeme", "Faturalar"] },
  { name: "03-rapor", url: `${base}#report`, expect: ["Sana özel", "Rapor"] },
  { name: "04-ayarlar", url: `${base}#settings`, expect: ["Ayarlar", "Hesaplar", "Maaş"] }
];
