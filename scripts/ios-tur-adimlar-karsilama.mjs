// iOS Simülatörü Safari turu: Test ekranları › Hoş geldiniz senaryoları (scripts/ios-simulator-tur.mjs ile çalışır).
// Beklenen metinler ilk ekranda, kaydırmadan görünenlerdir (Safari çubuğu ana düğmeyi alta itebilir).
// Senaryo verisi Safari'de saklı kalır; eski veriyle karışmasın diye TUR_BASE ile yeni bir köken (ör. 127.0.0.1) verilebilir. Geliştirme sunucusu TUR_BASE adresinde açık olmalı.
const base = process.env.TUR_BASE || "http://localhost:5199";
export default [
  { name: "01-duzen", url: `${base}/?ornek=duzen`, wait: 12000, expect: ["Bütçenizi nasıl takip edersiniz", "Önerilen", "Tek bir hesaptan takip ederim", "Hesaplarımı kategorilendiririm"] },
  { name: "02-kategori", url: `${base}/?ornek=kategori`, wait: 10000, expect: ["Adım 1 / 7", "Hoş geldiniz", "Bütçe hesabı"] },
  { name: "03-kart", url: `${base}/?ornek=kart`, wait: 10000, expect: ["Adım 2 / 7", "Maaş ve diğer gelirler"] },
  { name: "04-ayri", url: `${base}/?ornek=ayri`, wait: 10000, expect: ["Adım 4 / 7", "Gider takibi hesapları", "Şimdilik atla"] },
  { name: "05-kilitli", url: `${base}/?ornek=kilitli`, wait: 10000, expect: ["Adım 7 / 7", "Sabit ödeme eklemek için önce bir kategori gerekir", "Kira, fatura gibi sabit ödemeler"] },
  { name: "06-basla", url: `${base}/?ornek=basla`, wait: 10000, expect: ["Kurulum özeti", "3 / 7 adım tamamlandı", "Atlandı. Şimdi ekleyebilirsiniz"] }
];
