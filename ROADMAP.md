# Ev Bütçesi — Yol Haritası

Bu dosya projenin TEK yol haritasıdır. Her iş başında okunur, iş bitince ilgili
maddenin durumu güncellenir ve hangi işte yapıldığı yazılır. Bir değişiklik bu
plandan sapıyorsa önce burada gerekçesiyle güncellenir.

İlk durum tespiti: `logs/2026-11-06-durum-tespiti-yol-haritasi.md`
Ticari sürüm değerlendirmesi ve eksik listesi: `docs/URUN-DEGERLENDIRME.md`
Son devir notu (yeni işlere referans): `logs/2026-11-06-devir-durum-ve-yol-haritasi.md`
Faz 1–2 kapanış denetimi ve Faz 3 kapsamı: `docs/RAPOR-FAZ-DURUMU-2026-11-11.md`

## Hedef
Mağazada (App Store / Google Play) satılabilecek, herkesin kullanabileceği bir aile
bütçesi uygulaması. Mevcut uygulamanın fikirleri (maaş gününe göre ay, ekstre,
taksit, borç erteleme, devir, birikim) ilham kaynağıdır; veri modeli ve hesap
motoru yeniden yazılır.

İlkeler:
- **Az dokunuş:** bir harcama en fazla 2 adımda girilir (tutar → kategori).
  Hesap, tarih, para birimi geçmişten dolar. Tekrarlayan ödemeler tek dokunuşla "ödendi".
- **Geçmiş değişmez:** kapanan ay dondurulur; ayar veya kur değişikliği yalnızca ileriyi etkiler.
- **Hesap motoru arayüzden bağımsız ve testli:** web, mobil kabuk ve widget aynı kodu kullanır.
- **Çok kullanıcılı güvenlik:** yetki sunucuda ve veritabanı kurallarında denetlenir.

Durum işaretleri: [x] tamam · [~] kısmen · [ ] bekliyor

## Faz 0 — Mevcut uygulamada acil koruma
- [~] AI uç noktalarında (`api/`) Firebase token'ını sunucuda doğrulama — 2026-11-06.
      Eksik: kalıcı kullanım sayacı; canlı ortamda gerçek girişle deneme.
      Öncelik düşürüldü (Abdullah, 2026-11-06): önce temel işlevler.
- [~] Veritabanı kurallarını depoya alma ve gözden geçirme — dosya depoda (`database.rules.json`, `firebase.json`, 2026-11-09).
      Eksik: kuralların kayıt kayıt eşitleme modeline göre gözden geçirildiğine dair kayıt yok (Faz 3 "çok aileli kullanım" ile birlikte).
- [x] Çevrimdışı açılışta eski verinin buluta yazılmasını ve yankı yazmayı durdurma — 2026-11-06

## Faz 1 — Yeni veri modeli ve hesap motoru (`src/core/`)
- [x] Tek tip işlem kaydı (gider / gelir / aktarım), kuruş cinsinden tam sayı tutar — 2026-11-06
- [x] Yükümlülükler (sabit gider, taksit, borç, maaş) kendi takvimini üretir; erteleme kuyruğu uzatır — 2026-11-06
- [x] Tutar değişikliği ileriye dönük (`changes`) — 2026-11-06
- [x] Dönem kapatma = dondurma; devir kararları (taşı / ertele / vazgeç) — 2026-11-06
- [x] İleriye dönük projeksiyon (gelecek aylar, biten taksitler) — 2026-11-06
- [x] Kredi kartı borcu: önceki dönem harcaması + karttan otomatik yükümlülükler — 2026-11-06.
      Kesim gününe göre ekstre ayrımı ve son ödeme günü — 2026-11-10 (`src/core/cardStatement.js`: kesim penceresi,
      son ödeme tarihi, dönemde ödenecek ekstreler; `src/core/cardBudget.js`: ekstre hangi bütçeden; `tests/card-statement-savings.test.js`).
- [x] Hızlı giriş: varsayılan hesap, sık kullanılanlar (widget kaynağı), tek dokunuş "ödendi" — 2026-11-06
- [x] Otomatik testler: `npm test` — 2026-11-06
- [x] Taksitli alışveriş: kuruş farkı ilk taksitte, toplam birebir; kalan taksit borcu — 2026-11-06
- [x] Gelecek ayların taksit + borç yükü (hesap/kart bazında, biten taksitler) — 2026-11-06
- [x] Hesap bakiyesi ve banka mutabakatı: uygulama = banka, kuruşu kuruşuna; fark varsa
      son tutan mutabakattan beri hareketler listelenir; görünür "bakiye düzeltme" — 2026-11-06
- [x] Para birimi kuralı: işlem hesabın para biriminde; dövizli borç TL hesaptan gerçek TL ile — 2026-11-06
- [x] Denetim düzeltmeleri — 2026-11-06: karttaki taksit kart bakiyesine yansır ve ay kapatmada
      devredilmez; ayrı girilen maaş çift sayılmaz; Türkçe karakterli etiketleme (`src/core/labels.js`)
- [x] Birikim / döviz / altın varlıkları ve hedefler — motor 2026-11-09 (`src/core/savings.js`), arayüz 2026-11-11
      (`src/v3/screens/BirikimSheet.jsx`: varlıklar, kur girişi, al / sat / bozdur, hedefler, acil durum fonu önerisi). Altın yalnız gram.
- [x] Kayıt kayıt senkron katmanı (Firebase; tüm veriyi tek parça ezmeden) — 2026-11-08 (`src/v3/sync.js`, `src/v3/useCloud.js`)
- [x] Bütünlük kuralları — 2026-11-06: kısmi ödeme, iade, kapalı döneme karşı korumalı
      düzenleme/silme, kullanımdaki kaydı silmeme (arşiv/sonlandırma), maaş günü değişikliğinde
      eski işlemlerin ay değiştirmemesi (`tests/integrity.test.js`)
- [x] Eski veriden dönüştürücü — 2026-11-06'da iptal edilmişti (Abdullah); 2026-11-11'de Abdullah gerçek yedeğini verip ekranların
      bu veriyle dolmasını istedi. `src/v3/legacyImport.js` Ayarlar > Yedekten geri yükle'ye bağlandı; aylık bütçe → Maaş geliri,
      TL birikim havuzu → Birikim hesabı aktarımları, "karta aktarıldı" bayrağı → cardTransferredAt + bankadan karta aktarım.
      Geliştirmede `/?ornek=yedek` (depo dışı `yedek/` klasörü) ve simülatöre yükleme: `scripts/yedek-simulator.mjs`.

## Faz 2 — Sade arayüz (önce mockup, onaydan sonra kod)
- [x] Taslak v1 — 2026-11-06: `mockups/v2-taslak.html` (ana ekran, + Ekle, ay kapatma,
      yükleniyor / ilk açılış / bağlantı yok). Başlangıç noktası olarak görevini tamamladı; yerini
      onaylı v3 tasarımı aldı (aşağıdaki madde). Dosya tarihçe için duruyor.
- [x] v3 arayüzü, `src/core`'a bağlı — 2026-11-07 (`src/v3/`). İlk görsel 7 Kasım'da onaylanmadı; 8 Kasım'da
      Abdullah'ın C tasarımı uygulandı. **Onaylı tasarım 11 Kasım 2026'da depoya alındı**: `mockups/v3-tasarim/`
      (`a.png` görünüm + `kaynak/` görsel dil paketi, doğrulama notu `BENIOKU.md`). Sekmeler onaylı sıraya alındı
      (Özet · Ödemeler · Rapor · Ayarlar), ana rakam "Serbest". Kök adres (/) v3'e verildi; eski uygulama `/eski`.
- [x] Tek "+ Ekle" akışı ve sık kullanılan kategori kısayolları — 2026-11-07 (hızlı harcama çekmecesi; açıklamadan kategori önerisi)
- [x] Ana ekran 3 soru: Bu ay ne kadar kaldı? Yaklaşan ödemeler? Plana göre neredeyim? — 2026-11-08 (Serbest, Yaklaşan, hız rozeti; Döküm)
- [x] Ay kapatma ekranı (devir kararları) — 2026-11-10 (`KapatSheet`, `DevredenSheet`; karar geri alınabilir)
- [x] Erişilebilirlik: yazı ≥15 px (ikincil satırlar 13 px, bilinçli), dokunma alanı ≥44 px, odak görünür — 2026-11-08.
      Yakınlaştırma kilidi (`user-scalable=no`) kaldırıldı — 2026-11-11 (giriş alanları 16 px olduğu için iOS odakta kendiliğinden yakınlaştırmaz).
- [x] Rapor: dönem seçici (geçmiş aylar), son 6 ay harcama trendi, hedefler — 2026-11-11
- [x] Taksit denemesi ("bu taksiti alırsam ne olur") — 2026-11-11 (`src/v3/screens/TaksitDeneSheet.jsx`)
- [ ] Ödeme bildirimleri (PWA'da sınırlı; Faz 3 ile birlikte)
- [~] Safari ve gerçek iPhone'da tur — 2026-11-11: iOS 26.5 Simülatöründe (gerçek WebKit) dört sekme örnek veriyle açılıp
      OCR ile doğrulandı (`scripts/ios-simulator-tur.mjs`); Capacitor kabuğunda temiz kurulum ve Özet / Ayarlar görüldü.
      Eksik: Abdullah'ın simülatörde ya da telefonda elle gezmesi ve bulgu bildirmesi (yatay taşma gözle teyit).

## Faz 3 — Mağaza ve widget
Widget (ana ekran kısayolu ve "bu ay kalan" göstergesi) PWA ile yapılamaz; uygulamanın
yerel bir kabukla paketlenmesi gerekir.
- [~] Capacitor ile iOS/Android paketleme (aynı web kodu) — iOS başladı 2026-11-11: Capacitor 8.6 (SPM), `ios/` Xcode
      projesi, `capacitor.config.json` (`com.evbutcesi.app`), `npm run ios:sim` döngüsü simülatörde çalışıyor.
      Eksik: marka simgesi / açılış ekranı, TestFlight (Developer Program + API anahtarı), Google girişi yerine eklenti ya da
      Apple ile Giriş, Android. Rehber: `docs/IOS-SIMULATOR-VE-TESTFLIGHT-REHBERI.md`.
- [ ] iOS widget (WidgetKit) ve Android widget: çekirdeğin ürettiği özet + sık kullanılanlar
- [ ] Mağaza gereklilikleri: gizlilik politikası, KVKK aydınlatma metni, uygulama içinden hesap silme,
      Google girişinin yanında Apple ile Giriş
- [ ] Çok aileli kullanım: aile başına veri izolasyonu, davet akışı güvenliği
- [ ] AI özellikleri için maliyet modeli (kota / abonelik)
- İptal — mevcut verinin taşınması (Abdullah, 2026-11-06)

## İş günlüğü
- 2026-11-06 · Durum tespiti ve yol haritası.
- 2026-11-06 · Faz 1 çekirdeği: `src/core/` (model, takvim, motor, hızlı giriş) + `tests/core.test.js`.
  Arayüze henüz bağlanmadı; mevcut uygulama değişmedi.
- 2026-11-06 · Faz 0: AI token doğrulaması (kısmen), çevrimdışı/yankı yazma düzeltmesi (`src/App.jsx`).
- 2026-11-06 · Öncelik: temel işlevler. Taksit, taksit yükü, bakiye mutabakatı (`src/core/installments.js`,
  `src/core/accounts.js`, `tests/balance.test.js`). Toplam 25 test geçiyor.
- 2026-11-06 · Temel hesap ve etiketleme denetimi: 4 hata düzeltildi (`tests/audit.test.js`). Toplam 32 test geçiyor.
- 2026-11-06 · Ticari sürüm değerlendirmesi (`docs/URUN-DEGERLENDIRME.md`); 6 bütünlük eksiği giderildi.
  Eski veri aktarımı iptal. Toplam 38 test geçiyor.
- 2026-11-06 · Faz 2 taslak v1: `mockups/v2-taslak.html`. Uygulama koduna dokunulmadı; onay bekleniyor.
- 2026-11-06 · İş #20 kapanış: devir notu yazıldı, `agent/20` dalı push edildi (main'e birleştirilmedi).
- 2026-11-07 · İş #23: v3 arayüzü /v3 adresinde (`src/v3/`), yeni motora bağlı; eski uygulama değişmedi.
  `tests/v3.test.js` eklendi, toplam 43 test geçiyor. Ayrıntı: `logs/2026-11-07-v3-arayuz-ilk-surum.md`.
- 2026-11-08…10 · İşler #35–#52: C tasarımı, bulut eşitleme, kart kesim / bloke, ekstre eşitleme (OCR), ay kapatma ve
  devreden kararları, tanım düzenleme çekmeceleri. Durum raporu: `docs/RAPOR-DURUM-2026-11-11.md`.
- 2026-11-11 · İş #61: onaylı tasarım depoya alındı (`mockups/v3-tasarim/`), sekmeler ve etiketler hizalandı, kök adres
  v3'e verildi (`/eski` eski uygulama), Birikim (varlık, kur, al / sat, hedef, acil fon), Taksit dene, Rapor dönem
  seçici ve trend. 127 test geçiyor.
- 2026-11-11 · İş #62: `agent/62` dalı main'e hizalandı (agent/52'nin işi #61 ile zaten main'deydi). Faz 1–2 kapanış
  denetimi yapıldı, eski üç işaret düzeltildi; rapor: `docs/RAPOR-FAZ-DURUMU-2026-11-11.md`. Devamında Faz 2 kalite
  maddeleri (yakınlaştırma kilidi kaldırıldı, simülatör Safari turu) ve Faz 3 Capacitor iOS kurulumu; bundan sonra her iş
  `npm run ios:sim` ile simülatörde gösterilir (Abdullah, 2026-11-11). Sonraki tur: eski yedek içe aktarma bağlandı, yedek
  verisiyle tüm ekranlar Chrome (360 / 390 px) ve iOS Simülatörü Safari + Capacitor kabuğunda görüldü; gerçek veriyle çıkan
  iki hata düzeltildi (süresiz kart kalemlerinde "Taksit n/null", Rapor halkasında çift "Diğer" anahtarı). Vercel'den
  çıkma isteği teyit bekliyor (bkz. `docs/IOS-SIMULATOR-VE-TESTFLIGHT-REHBERI.md` 7. bölüm).
