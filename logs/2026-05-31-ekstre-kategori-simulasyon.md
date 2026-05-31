# 2026-05-31 — Ekstre Eşleştirme, Kategori Sistemi, Taksit Simülasyonu, API Refactor

## Ne Yapıldı

### API Düzeltmeleri
- 3 API dosyasında geçersiz model adı düzeltildi: `claude-opus-4-7` → `claude-opus-4-6` → `claude-sonnet-4-6`
- Geçersiz API versiyonu düzeltildi: `2025-04-15` → `2023-06-01`
- `analyze-receipt.js`'e thinking yapılandırması ve text filtresi eklendi
- **Ortak API modülü oluşturuldu** (`api/_anthropic.js`): model, versiyon, thinking, response parsing tek dosyadan yönetiliyor. 3 API dosyası sadeleştirildi.

### Ekstre Eşleştirme Motoru İyileştirmeleri
- Taksit planları eşleştirmeye dahil edildi (eskiden sadece tek çekim harcamaları kontrol ediliyordu)
- Tutar toleransı: ±0.5 TL → ±1 TL
- Tarih toleransı: tam eşleşme → ±2 gün (Date nesnesi ile karşılaştırma)
- Eşleşmeyen kayıtlara taksitler de dahil edildi

### Kategori Sistemi
- Her kategoriye `tracked` alanı eklendi: değişken gider takibine dahil mi?
- Ayarlar → Kategoriler'de toggle eklendi ("Değişken gider takibine dahil" açma/kapama)
- `tracked: false` olan kategoriler zarf takibinde sayılmaz (eğitim, tatil, sağlık gibi)
- `calcMonth` ve `calcFlat` fonksiyonlarında tracked filtresi eklendi
- Ekstre analizinde "＋ Tanımlanmamış / Ekle" seçeneği ile modal açılıyor: ad, simge, anahtar kelimeler, tracked toggle
- Yeni eklenen kategoriler otomatik ayarlara kaydediliyor

### Harcama Formları
- Varsayılan kategori "Diğer" olarak ayarlandı (kategorisiz → beklenmeyen gider sorunu çözüldü)
- CC tek çekim düzenlemede: kart seçimi ve kategori seçimi eklendi
- CC taksit düzenlemede: kategori seçimi eklendi
- Hesaptan ödeme düzenlemede: kategori seçimi eklendi
- CC tek çekim düzenlemede çift kayıt sorunu çözüldü (sil+ekle → map ile güncelle)
- KK kaydet butonu: "✓ Kaydedildi" geri bildirimi + 2sn sonra otomatik kapanma

### Taksit Simülasyonu Geçmiş Analiz
- Son 6 aya kadar gerçek harcama verilerini analiz ediyor (veya mevcut kadar)
- Kırılım: KK tek çekim, hesaptan ödeme, konfor kartı, beklenmeyen gider, borç ödemeleri
- Taksit yükü özeti: mevcut yük, yeni yük, kalan kapasite somut rakamlarla
- Karar kartı: yeşil/sarı/kırmızı + en sıkışık ay, fark, ortalama harcama detayları
- API kullanmıyor — tamamen yerel hesaplama

### Planlama — Gelecek Ay Projeksiyonu
- `mkDist` yardımcı fonksiyonu eklendi (iki ay arası mesafe)
- `calcMonth`, `calcFlat`, `getMonthBreakdown` fonksiyonlarında borç hesaplaması düzeltildi
- Borçlar gelecek aylar için `remainingMonths - geçenAy` ile otomatik azaltılıyor

## Neden Böyle Yapıldı

### API Ortak Modülü
3 dosyada aynı hatalar tekrar ediyordu (yanlış model, yanlış versiyon, eksik thinking). Her seferinde 3 dosyayı tek tek düzeltmek yerine, merkezi bir modül oluşturuldu. Bundan sonra model veya versiyon değişikliği tek satırdan yapılır.

### Eşleştirme + Taksit
Ekstre eşleştirme motoru sadece `ccSingle` kayıtlarına bakıyordu. Bankadan gelen taksit satırları uygulamada karşılık bulamıyordu. `installmentPlans`'ı da havuza ekleyerek taksit ödemeleri de eşleşebilir hale geldi.

### Kategori tracked Alanı
Her yeni kategori otomatik değişken gider takibine giriyordu. Eğitim, sağlık, tatil gibi düzensiz harcamalar aylık zarf takibini bozuyordu. `tracked` alanı ile kullanıcı hangisinin takip edilip hangisinin sadece sınıflandırma amaçlı olacağına karar verebilir.

### Borç Projeksiyonu
`d.remainingMonths` statik bir değerdi — gelecek aylar için azalmıyordu. 3 ay kalan bir borç, 8 ay sonra bile aktif sayılıyordu. `mkDist` ile gelecek ay mesafesi hesaplanarak borç bitişi doğru yansıtıldı.

## İç Düşünme Süreci

- **Model seçimi**: Önce `claude-opus-4-6` kullanıldı ama fiş/ekstre analizi için Opus gereksiz pahalı. `claude-sonnet-4-6` yeterli ve daha hızlı.
- **Eşleştirme toleransı**: ±0.5 TL çok dar — bankalar kuruş farklılıkları yapabiliyor. ±1 TL makul. Tarihte de ±2 gün gerekli çünkü banka işlem tarihi ile valör tarihi farklı olabiliyor.
- **CC düzenleme çift kayıt**: `onDeleteSingle` + `onSaveSingle` yaklaşımı React state batching'de sorun çıkarıyordu. `map` ile yerinde güncelleme daha güvenilir.
- **Taksit simülasyonu**: Abdullah somut rakamlar istedi — sadece yeşil/sarı/kırmızı yetmez, "aylık ne kadar taksit kapasiten var" gibi karar verebileceği veriler lazım.

## Sonraki Adım

- Ekstre yükleme testi (PDF + CSV) — Vercel deploy sonrası
- Mevcut kategorilere geriye dönük `tracked` ataması kontrolü
- Simülasyon geçmiş analiz doğrulaması (geçmiş veri yokken davranış)

## Gözlem

Abdullah'ın talep tarzı olgunlaşıyor — bir özelliği isterken kullanım senaryolarını detaylı düşünüyor ve isteği konuşma sırasında şekillendiriyor. "Elle kategori yaz" isteği → "modal ile tam form" isteğine evrildi. Bu, Abdullah'ın ürün vizyonunun netleştiğini gösteriyor.
