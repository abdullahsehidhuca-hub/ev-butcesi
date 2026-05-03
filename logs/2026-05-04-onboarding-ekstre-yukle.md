# 4 Mayıs 2026 — Onboarding İyileştirmeleri, Ekstre Dönem Seçici, Kullanıcı Geri Bildirimleri

## Ne yapıldı

### 1. Ekstre Dönem Seçici
- Ekstre yükleme ekranına "Hangi Dönemin Ekstresi?" dropdown eklendi (mevcut ay + önceki 2 ay)
- handleCSV hedef döneme kaydediyor, eşleştirme hedef dönemin ccSingle'ından yapılıyor
- Sebep: KK ekstre döngüsü ile bütçe döngüsü 1 gün kayık olabiliyor (bütçe 15-14, ekstre 15-15)

### 2. Dosya Yükleme Fix (Mobil)
- File input: `position: absolute` + parent `position: relative` ile tıklama alanı düzeltildi
- `accept` genişletildi (.CSV, application/vnd.ms-excel — Android uyumu)
- Kart seçilmediğinde "Önce kart seçin" uyarısı eklendi
- csvTargetMk useState(mk) → useState(initialMk) beyaz ekran fix (mk henüz tanımlanmadan kullanılıyordu)

### 3. Onboarding Adım Adım İyileştirmeler

**Adım 1 — Maaş Günü:**
- Seçenekler: 1, 15, 25 → 1, 5, 10, 15, 20, 25, 30 (4'lü grid + Diğer input)
- Ayarlar → Aylık Bütçe'deki seçim de aynı şekilde güncellendi

**Adım 2 — KK Ödeme Modu:**
- Kutu açıklama metinleri: fontSize 11 → 13, renk #8B7E74 → #3D352E (koyu kahve)
- Seçili kutuda açıklama rengi #0F766E (koyu yeşil)
- Ekstre tavsiye kutusu: arka plan opasitesi artırıldı, border kalınlaştırıldı, metin rengi koyulaştırıldı, "banka hesap kartınızla" bold yapıldı

**Adım 3 — Aylık Bütçe:**
- Placeholder: "Örn: 80000" → "Örn: 25000"
- Input tipi: number → text + inputMode="numeric" (noktalı format desteği)
- parseBudget fonksiyonu: "80000", "80.000", "80,000" hepsini 80000 olarak parse eder

**Adım 4 — Sabit Giderler:**
- Öneriler güncellendi: Kira, Aidat, Eğitim Taksidi, Burs Yardımı, Sadaka Payı, Spor Salonu
- Fatura alt kategorilendirme sistemi eklendi:
  - "Faturalar" butonuna tıklayınca alt panel açılıyor
  - Ön tanımlı türler: Telefon Faturası, İnternet, Dijital Abonelik
  - "Fatura türü" input'u (ön tanımlı olmayan tür eklenebilir)
  - "Fatura detayı" input'u (kime ait, hangi hat)
  - Otomatik gider adı birleştirme: "Kadriye Telefon Faturası"
  - Son ödeme günü (opsiyonel)
  - billType alanı veri yapısına eklendi
- Fatura uyarısı: "Elektrik, su, doğalgaz gibi tutarı her ay değişen faturalar burada girilmez"
- Ayarlar → Sabit Giderler'e de billType (Fatura Türü) dropdown eklendi

**Adım 5 — Harcama Kategorileri:**
- Hazır önerilere tıklayınca input'a yerleşiyor (eskiden direkt listeye ekleniyordu)
- Varsayılan anahtar kelimeler placeholder olarak silik gösteriliyor
- Kullanıcı yazmazsa varsayılanlar kaydediliyor, yazarsa kendi kelimeleri
- Manuel ekleme formuna anahtar kelime input'u eklendi
- Eklenen kategorilerin altında anahtar kelimeleri gösteriliyor

**Adım 6 — Kartlar:**
- Kredi kartı seçildiğinde "Ekstre kesim günü" input'u (opsiyonel)
- cutoffDay alanı veri yapısına eklendi
- Ayarlar → Kartlarım'a da ekstre kesim günü eklendi
- Kart listesinde cutoffDay gösterimi

**Adım 7 — Özet:**
- Bilgi metni: soluk gri (fontSize 10) → yeşil kutulu bilgi kartı (fontSize 13, border'lı)

**Genel:**
- Tüm ipucu kutuları (hintS): fontSize 12→14, arka plan opasitesi artırıldı, border kalınlaştırıldı, metin rengi koyulaştırıldı
- Boykotlu marka isimleri koddan temizlendi (Shell, BP, Petrol Ofisi vb.)

## Neden böyle yapıldı

### Ekstre dönem seçici
Kullanıcının bütçe döngüsü (15-14) ile KK ekstre döngüsü (15-15) 1 gün farkla çalışıyor. 16'sında ekstre yüklendiğinde uygulama yeni dönemde ama ekstredeki harcamalar önceki döneme ait. A (manuel seçim) vs B (otomatik tarih analizi) karşılaştırıldı — A seçildi: daha kararlı, bakım gerektirmiyor, CSV tarih formatı bağımlılığı yok.

### Fatura alt kategorilendirme
Abdullah'ın evinde birden fazla telefon faturası var. "Telefon Faturası" tek başına yetersiz, "Kadriye Telefon Faturası" gibi detaylı kayıt gerekiyor. Fatura türü + detay (isim) ayrımıyla hem gruplama hem detaylı takip mümkün.

### Anahtar kelime placeholder
Hazır önerilerin varsayılan anahtar kelimeleri input'un value'suna yazılırsa kullanıcı "bunlar ne, silmeli miyim?" diye düşünüyor. Placeholder olarak silik göstermek hem varsayılanı belli ediyor hem kullanıcıya "boş bırakabilirsin" mesajı veriyor.

### Boykot kuralı
Abdullah'ın kesin kararı: İsrail'e destek veren tüm markalar sorgusuz boykot. Kodda, placeholder'larda, önerilerde marka ismi yerine genel terimler kullanıldı.

## İç düşünme süreci

- Ekstre dönem seçici için B seçeneği (otomatik tarih analizi) daha "akıllı" görünse de CSV formatları bankadan bankaya değişiyor, yanlış parse sessiz hataya neden olur. A seçeneği tek dropdown — basit, kararlı.
- Fatura alt kategorilendirme başlangıçta sadece ön tanımlı butonlarla yapıldı, Abdullah geri bildirimle serbest input istedi. İteratif tasarım süreci: 3 revizyon sonucu mevcut yapıya ulaşıldı.
- cutoffDay (ekstre kesim günü) şu an veri olarak kaydediliyor ama uygulama içi etkisi (yaklaşan ödemeler, toplu aktar, bloke) henüz kodlanmadı — memory'ye not edildi.

## Sonraki adım
- cutoffDay işlevselliği: yaklaşan ödemeler takvimi, toplu aktar zamanlaması, bloke hesaplaması entegrasyonu
- Test kullanıcılarından onboarding geri bildirimi
- Ekstre modunda categorizedCC/uncategorizedCC tam düzeltme (düşük öncelik)

## Gözlem
- Abdullah tasarım kalitesine çok önem veriyor — "arka planla yazı rengi birbirini gölgeliyor" gibi detaylı geri bildirimler veriyor
- İteratif tasarım süreci iyi çalışıyor: öneri → geri bildirim → revize → onay
- Boykot konusu tartışmaya kapalı ve net — bu tür değer kararları hafızaya kaydedildi
