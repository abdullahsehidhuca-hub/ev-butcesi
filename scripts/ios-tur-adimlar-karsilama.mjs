// iOS Simülatörü Safari turu: Test ekranları › Hoş geldiniz senaryoları (scripts/ios-simulator-tur.mjs ile çalışır).
// Beklenen metinler ilk ekranda, kaydırmadan görünenlerdir. Geliştirme sunucusu TUR_BASE adresinde açık olmalı.
const base = process.env.TUR_BASE || "http://localhost:5199";
export default [
  { name: "01-duzen", url: `${base}/?ornek=duzen`, wait: 12000, expect: ["Bütçenizi nasıl takip edersiniz", "Önerilen", "Tek bir hesaptan takip ederim", "Hesaplarımı kategorilendiririm"] },
  { name: "02-kategori", url: `${base}/?ornek=kategori`, wait: 10000, expect: ["Hoş geldiniz", "Hesap ekle", "Başla"] },
  { name: "03-kart", url: `${base}/?ornek=kart`, wait: 10000, expect: ["Hoş geldiniz", "Bütçe hesabı", "Kredi kartları", "Başla"] },
  { name: "04-basla", url: `${base}/?ornek=basla`, wait: 10000, expect: ["Hoş geldiniz", "Boş bıraktığınız adımları", "Başla"] }
];
