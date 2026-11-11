# Ev Bütçesi v3 arayüzü (C tasarımı)

## Nereye yapıştırılır
Zip'teki klasör yapısı reponun köküyle aynı:

| Zip'teki yer | Repodaki yer |
|---|---|
| `src/v3/` (klasörün tamamı) | `src/v3/` |
| `v3.html` | repo kökü (`index.html` ile yan yana) |
| `tests/v3-selectors.test.js` | `tests/` |

Mevcut dosyaların hiçbiri değişmiyor: `src/App.jsx`, `src/main.jsx`, `src/core/` olduğu gibi kalıyor.
`src/v3/` yalnızca `src/core/index.js` içindeki fonksiyonları kullanıyor.

## Nasıl açılır
1. `npm run dev`
2. Tarayıcıda `http://localhost:5173/v3.html` adresini açın (iPhone'da aynı ağdan IP ile).
3. `npm test` yeni testi de çalıştırır (5 test).

Derlemeye (`npx vite build`) v3 sayfasını da katmak isterseniz `vite.config.js` içine şunu ekleyin:
```js
build: { rollupOptions: { input: { main: "index.html", v3: "v3.html" } } }
```
Eklemezseniz derleme eskisi gibi yalnızca ana uygulamayı üretir.

## Şu an ne yapıyor, ne yapmıyor
- **Örnek veriyle çalışıyor.** Firebase'e bağlı değil; yaptığınız değişiklikler yalnızca o tarayıcıda (localStorage) tutulur. Ayarlar → "Örnek veriye dön" sıfırlar.
- Gerçek veriye bağlamak için: `<AppV3 initialState={state} today="YYYY-MM-DD" members={…} userId={…} onChange={yeniState => kaydet(yeniState)} />`. Eşitleme (sync) katmanı yol haritasında hâlâ bekliyor; bağlantı o adımda yapılmalı.
- Hesaplara iki **isteğe bağlı** alan eklendi, yalnızca arayüz okuyor (motor bunları bilmiyor):
  - `paymentDay`: kredi kartının son ödeme günü (ör. 10). Yoksa kart, dönem başında görünür.
  - `minPaymentRate`: asgari ödeme oranı (ör. 0.4). Yoksa "Asgari tutarı öde" seçeneği gösterilmez. Örnek verideki 0.4 yalnızca örnektir; gerçek oranı banka belirler.
- Ekranlar: Özet, Ödemeler, Rapor (B3 grafik yapısı: öneri kartları, harcama halkası, 6 ay "ay sonunda kalan" çubukları, kategori limitleri), Ayarlar, Ekle penceresi, Çöz penceresi.
- Ayarlar'daki satırların çoğu şimdilik görüntü; çalışanlar: Görünüm (Sistem/Açık/Koyu) ve Örnek veriye dön.

## Bilinçli seçimler (değiştirilebilir)
- **Yazı boyu:** ana metin 15–16 px, ikincil bilgi 13 px. ROADMAP "yazı ≥15 px" diyor; bu, 13 px'lik ikincil satırlarla çelişiyor. Hepsini 15'e çekmek için `src/v3/v3.css` başındaki `--fs-meta` değerini `15px` yapmanız yeterli (satırlar biraz uzar).
- Ekrandaki sayılar motorun gerçek hesabı; Figma çizimlerindeki örnek sayılardan farklı olabilir (ör. serbest 18.290 ₺).

## Önerilen kayıt güncellemeleri (sizin karar vereceğiniz)
- ROADMAP: "v3 arayüzü önizleme (src/v3, örnek veri)" maddesi.
- Değişiklik günlüğü: eklenen dosyalar ve `paymentDay` / `minPaymentRate` alanları.
