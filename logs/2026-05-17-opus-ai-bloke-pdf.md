# 17 Mayıs 2026 — Opus Geçişi, AI Danışman Güçlendirme, Bloke Düzeltme, PDF Ekstre

## Ne Yapıldı

### 1. AI Model Geçişi: Sonnet 4 → Opus 4.7
- `api/analyze-receipt.js` ve `api/ai-advisor.js` modeli `claude-opus-4-7` olarak güncellendi
- Fiş analizinde birim fiyat/adet doğruluğu artacak
- AI danışmanda daha derinlikli finansal analiz üretilecek

### 2. AI Danışman Derinlikli Analiz
- **System prompt eklendi**: Finans stratejisti kimliği, verileri ilişkilendirme, davranışsal finans perspektifi
- **Extended thinking açıldı**: 10.000 token düşünme bütçesi — model cevap yazmadan önce tüm veriyi düşünüp ilişkilendiriyor
- **max_tokens**: 2.000 → 16.000
- **anthropic-version**: `2025-04-15` (thinking desteği için)

### 3. Frontend Prompt Güçlendirme
Yeni veri blokları prompt'a eklendi:
- Yemek kartı (Setcard+Multinet) ve konfor harcaması toplam/sayı
- Kart bazlı harcama dağılımı (her karttaki tek çekim + taksit + sabit)
- Taksit detay takvimi (kaçıncı ay, ne zaman bitiyor)
- Birikim portföy bakiyeleri (TL/USD/EUR/altın + toplam TL değeri)
- Geçmiş dönem detaylı döküm (bütçe, harcama, kalan, kategori, işlem sayıları)
- Bütçe aşım/tasarruf geçmişi (ortalama dönem sonu, başarı oranı)
- Ödeme takvimi (sabit giderlerin ödeme günleri, ödendi/bekliyor)
- Hesap ödemelerine kategori bilgisi eklendi
- Tahmini giderler ayrı satır olarak AI'a gönderiliyor

Yeni analiz direktifleri:
- Para Ne Zaman Biter? (3 senaryolu kapanış tahmini)
- Önümüzdeki Günlerde Ne Çıkacak? (nakit akış riski)
- Fatura ve Abonelik Kontrolü (optimizasyon fırsatları)
- Dönemsel Hatırlatma (mevsimsel harcama uyarısı)
- Birikim Değerlendirmesi (portföy dağılımı + acil durum fonu)
- Harcama Alışkanlığı Analizi (davranışsal finans)
- 5 Somut Adım (3'ten artırıldı, TL etkisiyle, öncelik sıralı)

### 4. Ödeme Yöntemi Güncelleme
- `Setcard` → `Yemek Kartları` (mealcard — Setcard+Multinet birleşik)
- `Multinet` → `Konfor Harcaması` (comfort — kafe, restoran, dışarı)

### 5. Bloke Hesaplama Düzeltmesi
- **Denenen yaklaşım**: groupC (değişken gider tahmini, acil tampon, kumbara) blokeye dahil edildi → ayın başında kullanılabilir bütçe -7.000 gösterdi, gerçek dışı
- **Son durum**: Bloke = sadece groupB (kesin çıkacak ödemeler)
- **İyileştirme**: Bloke detayına tıklayınca tahmini giderler bilgi amaçlı gösteriliyor (toplama dahil değil) + uyarı notu eklendi
- DetailModal'a separator satırı desteği eklendi

### 6. PDF Ekstre Desteği
- `api/analyze-statement.js` yeni endpoint: Opus 4.7 + thinking ile PDF ekstre analizi
- PDF'deki tablodan harcama işlemlerini `{date, desc, amount}` olarak çıkarır
- Frontend: dosya uzantısına göre otomatik akış (CSV → Papa.parse, PDF → AI analiz)
- Eşleştirme motoru `handleMatchAndSave` olarak ortak fonksiyona çıkarıldı
- Loading durumu ve süre bilgisi gösteriliyor

## Neden Böyle Yapıldı

### Opus geçişi
Sonnet 4 hızlı ama fiş okumada birim fiyat/adet detaylarında hata yapıyordu. Opus görsel analiz ve sayısal doğrulukta çok daha başarılı. Maliyet artışı kabul edilebilir seviyede (fiş başına tek istek, danışman günlük 3 hak).

### Bloke denemesi ve geri dönüş
Abdullah geçen ay "bloke sonrası kalan tamamen benim" diye düşünerek harcama yaptı ama aslında borç ödemesi ve diğer kalemler bloke'ye yansımamıştı. Bu sorun aslında daha önce (`abc9f94`) fix edilmişti. GroupC'yi de blokeye dahil etme denemesi mantıken doğruydu ama pratikte sorunluydu: ayın 2. gününde değişken gider tahmini neredeyse tam olduğu için kullanılabilir bütçe -7.000 gösterdi. Çözüm: tahmini giderleri bloke detayında bilgi olarak göster ama hesaba katma.

### PDF ekstre
Banka ekstrelerinin çoğu PDF formatında geliyor. CSV'ye dönüştürmek kullanıcı için ekstra adım. Opus PDF tablosunu doğrudan okuyup aynı eşleştirme motoruna besleyebiliyor.

## İç Düşünme Süreci

- **Model seçimi**: Abdullah önce "Opus 7" istedi, sonra "Opus 4.7" dedi (API docs ekran görüntüsü paylaştı). Model ID'si `claude-opus-4-7` olarak doğrulandı.
- **Bloke stratejisi**: groupC'yi blokeye dahil etmek "doğru cevap" gibi görünüyordu ama gerçek kullanımda ayın başında negatif bütçe göstermesi kabul edilemezdi. Tahmini giderleri bilgi olarak göstermek en iyi denge noktası.
- **PDF vs OCR**: PDF analizi için ayrı bir OCR kütüphanesi (pdf.js vb.) düşünüldü ama Opus zaten PDF'leri doğrudan okuyabiliyor. Ek bağımlılık gereksiz.
- **Eşleştirme motoru refaktör**: handleCSV fonksiyonu Papa.parse callback'i içindeydi. PDF desteği eklenince ortak eşleştirme mantığı `handleMatchAndSave` olarak ayrıldı — hem CSV hem PDF aynı motoru kullanıyor.

## Sonraki Adım
- PDF ekstre doğruluğunu gerçek banka ekstresiyle test et
- AI danışman analiz kalitesini değerlendir (ilk Opus yanıtını incele)
- Yemek kartı bakiyesi takip sistemi düşünülebilir (Setcard/Multinet bakiye girişi)

## Gözlem
Abdullah bu oturumda "analiz sonucu başlıklarını ve cümlelerini anlayabileceğim bir dilde yaz" diyerek teknik terimlerin sade Türkçe olmasını istedi. "Harcama Tükenme Simülasyonu" → "Para Ne Zaman Biter?" gibi dönüşümler yapıldı. Bu, tüm UI metinleri ve AI yanıtları için geçerli bir kural.
