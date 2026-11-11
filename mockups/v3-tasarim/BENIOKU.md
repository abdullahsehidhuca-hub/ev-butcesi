# Onaylı v3 tasarımı (C tasarımı)

Abdullah 11 Kasım 2026'da iki dosya verdi:

- `a.png` — onaylanan görünüm (1638 × 874, Özet · Ödemeler · Rapor ekranları ve Ekle penceresi).
- `kaynak/` — görsel dilin kaynak paketi (8 Kasım 2026 tarihli zip: `src/v3/v3.css`, bileşenler, ekranlar, örnek veri).

## Doğrulama (11 Kasım 2026, iş #61)

Kural: kaynaktaki görünüm dili `a.png`'yi doğrulamıyorsa düzenlemeye devam edilmez.

Görsel elle değil, metin çıkararak (OCR) karşılaştırıldı; görüntüdeki şu metinler kaynak paketinin ekranları ve örnek
verisiyle birebir örtüşüyor:

| `a.png`'de okunan | Kaynaktaki yeri |
|---|---|
| "15 Kas – 14 Ara · 12. gün", "Kasım" başlığı | `screens/Ozet.jsx` başlık |
| "Serbest 18.290 ₺ · günde 963 ₺ · plandan 2.910 ₺ hızlı" | `screens/Ozet.jsx` özet kartı; `BENIOKU-v3.md` "serbest 18.290 ₺" |
| "Yaklaşan · 4", "Son işlemler", "10 Ara'da eksiye düşüyor", "Taksit 4/6 · otomatik" | `screens/Ozet.jsx` liste |
| "Ödemeler", "‹ Ekim · Kasım 2026 · Aralık ›", "Kalan ödeme 30.340 ₺", "Faturalar · Taksitler · Kartlar", "MAAŞTAN ÖNCE" | `screens/Odemeler.jsx` |
| "Rapor · Kasım dönemi", "SANA ÖZEL", "Yakıt limiti aşılacak — Bu hızla 6.125 ₺, limit 4.000 ₺" | `screens/Rapor.jsx` + `selectors.js` insights |
| "Harcandı · 12.460 ₺", "5 kategori" halka, "Market %49 · Yakıt %20 · Dışarıda yemek %15" | `screens/Rapor.jsx` + `components/charts.jsx` Donut |
| "Ay sonunda kalan · bin ₺ · plan", "16,8 · 11,8" çubukları | `screens/Rapor.jsx` + `components/charts.jsx` MonthBars |

Sonuç: kaynak paketi görünümü doğruluyor; düzenlemeye devam edildi.

## Depodaki uygulama ile farklar

`src/v3/v3.css` kaynaktaki 134 satırı aynen içerir (yalnız dokunma alanları 34/36 px → 44 px) ve altına çekmece,
uyarı, erişilebilirlik ve karşıtlık eklemeleri yapılmıştır. Renk, yazı, köşe yarıçapı ve yerleşim dili değişmedi.

11 Kasım 2026'da onaylı görünüme göre hizalananlar:
- Sekme adları ve sırası: Özet · Ödemeler · Rapor · Ayarlar (önce Güncel · Analiz · Planlama · Ayarlar idi).
- Ana rakamın etiketi "Serbest" (önce "Kullanılabilir").
- Özet başlığındaki dönem satırı kaynaktaki gibi kısa tutuldu.

Kaynakta olmayıp uygulamada bulunan ögeler (işlev gereği, tasarım dili korunarak): hesap kartları şeridi,
bankada / bloke dökümü, ay kapatma ve devreden uyarıları, yedek hatırlatması, kart blokesi satırı, tanım düzenleme
çekmeceleri, birikim ve hedefler.
