# Faz 1–2 kapanış denetimi ve Faz 3 kapsamı (11 Kasım 2026)

Soru: Faz 1 ve Faz 2 motor ve ekran olarak tam anlamıyla bitti mi? Faz 3'te ne yapılacaktı?

Kaynak: `ROADMAP.md` maddeleri tek tek `src/core`, `src/v3`, `index.html`, `vercel.json` ve testlerle karşılaştırıldı.
Bu turda `npm test` 127/127 geçti, `npm run build` başarılı. Önceki ajanların "yapıldı" dediği maddeler koddan
doğrulandı; doğrulanamayanlar ayrıca belirtildi.

## Güncelleme (aynı gün, sonraki tur)

- Yakınlaştırma kilidi `index.html`'den kaldırıldı; Faz 2 erişilebilirlik maddesi kapandı.
- Safari turu: iOS 26.5 Simülatöründe dört sekme örnek veriyle açılıp OCR ile doğrulandı; elle gezme Abdullah'da.
- Faz 3 başladı: Capacitor iOS kuruldu, `npm run ios:sim` simülatörde çalışıyor. Rehber: `docs/IOS-SIMULATOR-VE-TESTFLIGHT-REHBERI.md`.

## Kısa yanıt

- **Faz 1 (motor): evet, bitti.** Yol haritasındaki 16 maddenin tamamı kodda var ve testli. Yol haritasında "kısmen"
  görünen tek madde (kesim gününe göre ekstre ayrımı) aslında 10 Kasım'da yapılmıştı; işaret güncel değildi, düzeltildi.
- **Faz 2 (ekran): işlev olarak bitti, iki kalite maddesi açık.** Onaylı tasarım depoda, tüm ekranlar motora bağlı
  ve Chrome'da denendi. Açık kalanlar: (1) yakınlaştırma kilidi (`user-scalable=no`) hâlâ açık değil, (2) Safari ve gerçek
  iPhone'da elle tur yapılmadı. Bildirimler bilinçli olarak Faz 3'e bırakılmış.
- **Faz 3: mağaza ve widget.** Capacitor ile iOS/Android paketleme, ana ekran widget'ı, mağaza gereklilikleri
  (gizlilik, KVKK, hesap silme, Apple ile Giriş), çok aileli güvenlik, AI maliyet modeli. Hiçbiri başlamadı.

## Faz 1 — motor, madde madde

| Madde | Durum | Kanıt |
|---|---|---|
| Tek tip işlem kaydı, kuruş tam sayı | ✅ | `src/core/model.js`, `tests/core.test.js` |
| Yükümlülük takvimi ve erteleme | ✅ | `src/core/schedule.js` |
| İleriye dönük tutar değişikliği | ✅ | `changeObligationAmount` (`src/core/model.js`) |
| Dönem kapatma = dondurma, devir kararları | ✅ | `closePeriod` (`src/core/engine.js`), `src/core/carryover.js`, `tests/carryover-card-budget.test.js` |
| Projeksiyon (gelecek aylar, biten taksitler) | ✅ | `projection` (`src/core/engine.js`) |
| Kart borcu + **kesim gününe göre ekstre ayrımı** | ✅ | `src/core/cardStatement.js` (kesim penceresi, son ödeme tarihi, dönemde ödenecek ekstreler), `src/core/cardBudget.js` (ekstre hangi bütçeden), `tests/card-statement-savings.test.js`. Yol haritasında yanlışlıkla "kısmen" duruyordu. |
| Hızlı giriş, sık kullanılanlar, tek dokunuş ödendi | ✅ | `src/core/quickEntry.js` |
| Taksitli alışveriş, kuruş farkı, taksit yükü | ✅ | `src/core/installments.js`, `tests/future-installments.test.js` |
| Bakiye ve banka mutabakatı | ✅ | `src/core/accounts.js`, `tests/balance.test.js` |
| Para birimi kuralı | ✅ | `src/core/money.js`, `src/core/savings.js` |
| Birikim / döviz / altın / hedefler motoru | ✅ | `src/core/savings.js`, `moveFunds` (`src/core/carryover.js`), `tests/move-funds.test.js` |
| Kayıt kayıt bulut eşitleme | ✅ | `src/v3/sync.js`, `src/v3/useCloud.js`, `tests/v3-sync.test.js` |
| Bütünlük kuralları | ✅ | `tests/integrity.test.js` |
| Otomatik testler | ✅ | 127 test, bu turda çalıştırıldı |

Bilinçli sınır: altın yalnız gram (kullanıcı kararı). Eski veriden dönüştürücü iptal (kullanıcı kararı).

## Faz 2 — ekranlar, madde madde

| Madde | Durum | Kanıt / eksik |
|---|---|---|
| Onaylı tasarım ve v3 arayüzü | ✅ | `mockups/v3-tasarim/` (a.png + kaynak paket), `src/v3/`; sekmeler Özet · Ödemeler · Rapor · Ayarlar; kök adres v3, eski uygulama `/eski` (`src/main.jsx`, `vercel.json`) |
| Tek "+ Ekle" akışı | ✅ | `src/v3/screens/EkleSheet.jsx` |
| Ana ekran 3 soru | ✅ | `src/v3/screens/Ozet.jsx` (Serbest, Yaklaşan, hız rozeti, Döküm) |
| Ay kapatma ve devreden kararı | ✅ | `KapatSheet.jsx`, `DevredenSheet.jsx` |
| Tanım düzenleme (hesap / kategori / ödeme) | ✅ | `src/v3/screens/TanimSheet.jsx` |
| Birikim, kur, al / sat, hedefler, acil fon | ✅ | `src/v3/screens/BirikimSheet.jsx` |
| Rapor dönem seçici, 6 ay trend, hedefler | ✅ | `src/v3/screens/Rapor.jsx`, `tests/v3-report-savings.test.js` |
| Taksit denemesi | ✅ | `src/v3/screens/TaksitDeneSheet.jsx` |
| Kart ekstresiyle eşitle (metin / CSV / OCR) | ✅ | `src/v3/screens/EkstreSheet.jsx`, `src/v3/ocr.js` |
| Erişilebilirlik | 🟡 | 44 px dokunma alanları ve odak var; **`index.html` viewport'ta `maximum-scale=1.0, user-scalable=no` duruyor** (yakınlaştırma kapalı). Kaldırılması tek satır; önceki turlarda bilinçli ertelendi. |
| Ödeme bildirimleri | ❌ | Kodda bildirim ya da service worker yok. Yol haritası kararı: PWA'da sınırlı, Faz 3 (yerel kabuk) ile. |
| Safari / gerçek iPhone elle tur | ❌ | Yalnız başsız Chrome 360 / 390 / 1280 px. Safari otomasyon izni kapalı; elle bakılmalı. |

Taslak v1 (`mockups/v2-taslak.html`) yol haritasında "kısmen" görünüyordu; yerini onaylı v3 tasarımı aldığı için
kapatıldı.

## Faz 2'yi "tam bitti" saymak için kalan iş

1. `index.html`'de yakınlaştırma kilidini kaldırmak (küçük, risksiz; görünüm değişmez).
2. Safari ve iPhone'da elle tur; bulguları tek listede toplayıp gidermek. Bu, otomasyonla yapılamıyor; kullanıcı elle
   gezip not iletirse giderilir.
3. (İsteğe bağlı) Son derlemeyi Vercel'e yüklemek. Bu turda canlı adres ağdan denetlenemedi (bağlantı yok); canlıda
   hangi sürümün olduğu doğrulanamadı.

## Faz 0'dan sarkan

- Veritabanı kuralları depoda (`database.rules.json`, 9 Kasım) ama kayıt kayıt eşitleme modeline göre gözden
  geçirildiğine dair kayıt yok. Faz 3'ün "çok aileli kullanım" maddesiyle birlikte ele alınmalı.
- AI uç noktalarında token doğrulaması kısmen; kalıcı kullanım sayacı yok (öncelik düşürülmüştü).

## Faz 3 — ne yapılacaktı

Yol haritasındaki tanım: widget (ana ekran kısayolu ve "bu ay kalan" göstergesi) PWA ile yapılamaz; uygulama yerel
bir kabukla paketlenmeli.

1. **Capacitor ile iOS / Android paketleme** — aynı web kodu, mağaza paketi. Faz 2'nin yakınlaştırma ve Safari
   maddeleri bundan önce kapanmalı (WebView Safari motorudur).
2. **Widget** — iOS WidgetKit ve Android widget: motorun ürettiği özet (Serbest, yaklaşan ödeme) + sık kullanılanlar.
   Veri paylaşımı için yerel kabuk gerekir.
3. **Mağaza gereklilikleri** — gizlilik politikası, KVKK aydınlatma metni, uygulama içinden hesap silme, Google
   girişinin yanında Apple ile Giriş (App Store zorunluluğu).
4. **Çok aileli kullanım** — aile başına veri izolasyonu ve davet akışı güvenliği; veritabanı kurallarının gözden
   geçirilmesi burada.
5. **AI özellikleri için maliyet modeli** — kota / abonelik.
6. **Ödeme bildirimleri** — Faz 2'den buraya devredilmişti; yerel kabukla yerel bildirim.

İptal: mevcut verinin taşınması (kullanıcı kararı, 6 Kasım).

## Öneri

Faz 3'e geçmeden önce iki küçük kapanış: yakınlaştırma kilidini kaldırmak ve Safari / iPhone elle turu. Sonra sıra,
kullanıcının daha önce söylediği gibi, AI ve analiz özelliklerine; ardından Capacitor paketlemeye.
