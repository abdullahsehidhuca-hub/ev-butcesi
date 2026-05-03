# 3 Mayıs 2026 — Bloke Tutarsızlığı, Ekstre Modu, Auth Kalıcı Düzeltme

## Ne yapıldı

### 1. Bloke Detayı Tutarsızlığı (Düzeltildi)
- Bloke Detayı modalında C grubu kalemler (değişken gider tahmini, konfor kartı kalan, beklenmeyen gider fonu, etkinlik kumbara) gösteriliyordu ama toplama dahil değildi
- Taksit satırında `installmentTotal` yerine `untransferredInst` kullanılması gerekiyordu — aktarılmış taksitler bloke değil
- `calcMonth` return objesine `untransferredInst` eklendi
- Modal sadece groupB bileşenlerini gösteriyor, satır toplamı = alt satır toplamı

### 2. Ayarlar Scroll Düzeltmesi
- Sabit Giderler ve Harcama Kategorileri ekranlarında scroll çalışmıyordu
- Sebep: flexbox `minHeight: 0` eksikliği — Dashboard'da vardı ama bu iki ekranda yoktu
- Her iki ekrana `minHeight: 0` eklendi

### 3. Ekstre Dosya Yükleme (iOS Safari)
- `display: none` file input iOS Safari'de çalışmıyordu
- `position: absolute; opacity: 0` ile değiştirildi
- `accept` genişletildi (.csv + text/csv)
- Papa.parse'e `error` callback eklendi

### 4. Bankadaki Tutar Farkı Analizi
- Uygulama 127.154 TL, gerçek banka 134.032 TL — 6.878 TL fark
- İki yedek karşılaştırması (30 Nisan vs 3 Mayıs) yapıldı
- Sonuç: 7 hesaptan ödeme (faturalar) "aktarıldı" işaretlenmiş ama banka henüz düşmemiş
- Kod hatası değil, erken işaretleme — çift sayma yok

### 5. Ekstre Modu İyileştirmeleri
- **"Bu Ay Kaydedilen" bilgi bölümü:** Ekstre modunda aktar panelinin altında, bu ayki KK harcamalarını kart bazlı gösteriyor (aktarma butonu yok, salt bilgi)
- **Bütçe Dökümü:** Ekstre modunda bu ayın KK toplamı bilgi satırı (mavi kesikli kutu)
- **Ay Kapama:** Ekstre modunda KK harcamalarının sonraki aya yansıyacağını bildiren bilgilendirme kartı
- **DetailModal:** info tipi satırlar için farklı görsel stil (kesikli mavi kutu)
- Tüm değişiklikler `isEkstreMode` koşuluna bağlı — instant mod etkilenmiyor

### 6. Auth Akışı Kalıcı Düzeltme
- **createFamily:** 3 kez retry + doğrulama yazması, başarısız olursa null dönüyor (uygulama açılmıyor)
- **getUserFamily:** 3 kez retry, artan bekleme süresiyle
- **"Aile kaydı bulunamadı" ekranı kaldırıldı:** Yerine "Hesabınız hazırlanıyor..." yükleme ekranı + sessiz arka plan retry (2 sn aralıkla)
- **Family useEffect:** Tüm async işlemler try/catch, cancelled flag ile race condition önlemi
- **Email doğrulama:** sendEmailVerification hata yakalama, rate limiting uyarısı ("1-2 dk bekleyin"), "Doğruladım" butonunda hata yönetimi
- **Redirect işleme:** createFamily ve joinViaInvitation hataları yakalanıyor
- **Hook sıralaması:** useEffect koşullu return'dan önce taşındı (beyaz ekran fix)

## Neden böyle yapıldı

### Bloke
6 ekran görüntüsü analiz edildi. groupB (kesin çıkacak) ve groupC (tahmin/rezerv) farklı hesaplama grupları — bunları aynı listede gösterip sadece birinin toplamını yazmak kullanıcıyı yanıltıyordu.

### Ekstre modu
Test kullanıcıları ekstre modunda KK harcamalarını kaydedip aktar ekranında göremeyince "harcamam kayboldu" diye düşündü. Ekstre modunun tasarımı doğru (bu ayın KK'sı gelecek ayın bütçesini etkiler) ama bilgilendirme eksikti.

### Auth
7 test kullanıcısından 3'ü giriş sorunu yaşadı. Kök neden: createFamily'nin 4 ayrı Firebase yazması hiçbir hata yakalama olmadan sıralı çalışıyordu — tek bir ağ kesintisi tüm akışı kırıyordu. "Aile kaydı bulunamadı" ekranı çıkış-giriş döngüsüne neden oluyordu.

## İç düşünme süreci

### Bloke analizi
- İlk başta 3 modal sunuldu (Bloke, Kalan Bütçe, Bütçe Dökümü). Üçünde de tutarsızlık olduğunu düşündüm ama detaylı incelemede sadece Bloke'nin gerçek sorunu olduğu ortaya çıktı
- Bütçe Dökümü'ndeki "23.113 fark" aslında farklı perspektiflerden gösterimdi, çift sayma değildi

### Bankadaki tutar farkı
- Kodda çift sayma aradım — ccSingle, accountEntries, fixedExpenses arasında overlap kontrolü yaptım
- Hiçbir kombinasyon 6.878'e eşleşmedi
- İki yedek karşılaştırması çözümü getirdi: 30 Nisan → 3 Mayıs arasında 7 hesaptan ödeme "aktarıldı" olarak işaretlenmiş ama banka düşmemiş

### Auth
- 5 farklı kullanıcı senaryosunu analiz ettim
- Race condition: redirect result ile getUserFamily paralel çalışıyordu
- createFamily'nin atomik olmaması: 4 yazmanın herhangi birinde hata → kısmi veri → döngü
- Çözümde güvenlik zaafiyetini Abdullah yakaladı: "başarısız olsa bile uygulama açılıyor" → null dönmesi gerekiyor

## Sonraki adım
- Test kullanıcılarına Vercel deploy sonrası geri bildirim istemek
- Ekstre modunda categorizedCC/uncategorizedCC hesaplaması hala bu ayın verilerini kullanıyor — tam düzeltme için categorizeMonthSpending fonksiyonunun ekstre-aware hale getirilmesi gerekiyor (düşük öncelik, UI bilgi notlarıyla telafi edildi)
- Harcama trendi grafiğinde ekstre modunda KK'yı ayrı renkte gösterme (mockup hazır, kod uygulanmadı)

## Gözlem
- Abdullah güvenlik zaafiyetlerini hızlı yakalıyor — "başarısız olsa bile uygulama açılıyor" sorusunu sorarak Firebase'e kayıt olmadan giriş ihtimalini tespit etti
- Mockup öncelikli tasarım tartışması iş akışını hızlandırıyor — ekstre modu değişiklikleri mockup onayıyla sorunsuz ilerledi
- Kullanıcı geri bildirimleri sistematik analiz ediliyor: 7 test kullanıcısından gelen 5 farklı senaryo tek tek incelendi
