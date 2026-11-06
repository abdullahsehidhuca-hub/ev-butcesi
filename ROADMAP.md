# Ev Bütçesi — Yol Haritası

Bu dosya projenin TEK yol haritasıdır. Her iş başında okunur, iş bitince ilgili
maddenin durumu güncellenir ve hangi işte yapıldığı yazılır. Bir değişiklik bu
plandan sapıyorsa önce burada gerekçesiyle güncellenir.

İlk durum tespiti: `logs/2026-11-06-durum-tespiti-yol-haritasi.md`

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
- [ ] Veritabanı kurallarını depoya alma ve gözden geçirme
- [x] Çevrimdışı açılışta eski verinin buluta yazılmasını ve yankı yazmayı durdurma — 2026-11-06

## Faz 1 — Yeni veri modeli ve hesap motoru (`src/core/`)
- [x] Tek tip işlem kaydı (gider / gelir / aktarım), kuruş cinsinden tam sayı tutar — 2026-11-06
- [x] Yükümlülükler (sabit gider, taksit, borç, maaş) kendi takvimini üretir; erteleme kuyruğu uzatır — 2026-11-06
- [x] Tutar değişikliği ileriye dönük (`changes`) — 2026-11-06
- [x] Dönem kapatma = dondurma; devir kararları (taşı / ertele / vazgeç) — 2026-11-06
- [x] İleriye dönük projeksiyon (gelecek aylar, biten taksitler) — 2026-11-06
- [~] Kredi kartı borcu: önceki dönem harcaması + karttan otomatik yükümlülükler — 2026-11-06.
      Eksik: hesap kesim gününe göre ekstre ayrımı.
- [x] Hızlı giriş: varsayılan hesap, sık kullanılanlar (widget kaynağı), tek dokunuş "ödendi" — 2026-11-06
- [x] Otomatik testler: `npm test` — 2026-11-06
- [x] Taksitli alışveriş: kuruş farkı ilk taksitte, toplam birebir; kalan taksit borcu — 2026-11-06
- [x] Gelecek ayların taksit + borç yükü (hesap/kart bazında, biten taksitler) — 2026-11-06
- [x] Hesap bakiyesi ve banka mutabakatı: uygulama = banka, kuruşu kuruşuna; fark varsa
      son tutan mutabakattan beri hareketler listelenir; görünür "bakiye düzeltme" — 2026-11-06
- [x] Para birimi kuralı: işlem hesabın para biriminde; dövizli borç TL hesaptan gerçek TL ile — 2026-11-06
- [ ] Birikim / döviz / altın varlıkları ve hedefler
- [ ] Kayıt kayıt senkron katmanı (Firebase; tüm veriyi tek parça ezmeden)
- [ ] Eski veriden yeni modele dönüştürücü + 3 aylık gerçek veriyle karşılaştırma testi

## Faz 2 — Sade arayüz (önce mockup, onaydan sonra kod)
- [ ] Tek "+ Ekle" akışı ve sık kullanılan kategori kısayolları
- [ ] Ana ekran 3 soru: Bu ay ne kadar kaldı? Yaklaşan ödemeler? Plana göre neredeyim?
- [ ] Ay kapatma ekranı (devir kararları)
- [ ] Erişilebilirlik: yazı ≥15 px, dokunma alanı ≥44 px, yakınlaştırma açık

## Faz 3 — Mağaza ve widget
Widget (ana ekran kısayolu ve "bu ay kalan" göstergesi) PWA ile yapılamaz; uygulamanın
yerel bir kabukla paketlenmesi gerekir.
- [ ] Capacitor ile iOS/Android paketleme (aynı web kodu)
- [ ] iOS widget (WidgetKit) ve Android widget: çekirdeğin ürettiği özet + sık kullanılanlar
- [ ] Mağaza gereklilikleri: gizlilik politikası, KVKK aydınlatma metni, uygulama içinden hesap silme,
      Google girişinin yanında Apple ile Giriş
- [ ] Çok aileli kullanım: aile başına veri izolasyonu, davet akışı güvenliği
- [ ] AI özellikleri için maliyet modeli (kota / abonelik)
- [ ] Mevcut kullanıcıların (Abdullah ve Kadriye) verisinin taşınması, bir ay paralel çalışma

## İş günlüğü
- 2026-11-06 · Durum tespiti ve yol haritası.
- 2026-11-06 · Faz 1 çekirdeği: `src/core/` (model, takvim, motor, hızlı giriş) + `tests/core.test.js`.
  Arayüze henüz bağlanmadı; mevcut uygulama değişmedi.
- 2026-11-06 · Faz 0: AI token doğrulaması (kısmen), çevrimdışı/yankı yazma düzeltmesi (`src/App.jsx`).
- 2026-11-06 · Öncelik: temel işlevler. Taksit, taksit yükü, bakiye mutabakatı (`src/core/installments.js`,
  `src/core/accounts.js`, `tests/balance.test.js`). Toplam 25 test geçiyor.
