# 2026-05-01: Planlı Etkinlikler, Onboarding, Ekstre Modu, Otomatik Yedek

## Ne yapıldı

### Planlı Etkinlikler Sekmesi
- Planlama ekranına "Planlı Etkinlikler" sekmesi eklendi (tatil, bayram, düğün gibi etkinlikler)
- Etkinlik alanları: ad, tarih (ay-yıl dropdown), tahmini bütçe, kumbara, not
- Bütçe kuralları: kumbara min %30, taksit max %70, bütçe yoksa taksit = kumbara × 7/3
- Taksit limiti: min(bütçe × %70, bütçe − kumbara)
- Kumbara: bloke + aktarım onayı ile gerçek tutar takibi (kumbaraAccumulated)
- Gerçekleşti/Gerçekleşmedi tamamlama (biriken tutar iade)
- Düzenle/sil seçenekleri

### Hedefler Birikim Altına Taşındı
- Hedefler sekmesi kaldırıldı, birikim sekmesine alt-sekme olarak taşındı
- Birikim: Varlıklarım / Hedeflerim alt sekmeleri

### Taksit %12 Güvenlik Kilidi
- Tüm taksitli harcamalarda aylık taksit yükü bütçenin %12'sini geçemez
- Kaydet butonunun üstünde kalan taksit hakkı bilgisi gösteriliyor
- Planlı etkinlik seçimi + max tutar freni (CCInstallModal ve CCCombinedModal)

### Onboarding Sihirbazı
- Yeni kullanıcı kaydında 7 adımlı kurulum: hoşgeldin, maaş günü, KK ödeme modu, bütçe, sabit giderler, kartlar, özet
- Her adımda "sonra nereden değiştirirsiniz" bilgisi
- Mobil uyum: scroll, küçük font/padding, safe-area

### Kredi Kartı Ekstre Döngüsü
- Onboarding ve ayarlarda "Bu aydan / Gelecek aydan" seçeneği
- calcMonth + calcFlat: ekstre modunda önceki ayın KK harcamaları bütçeye yansır
- Aktarım sekmesi: ekstre modunda önceki ayın işlemlerini gösterir
- Onboarding'de ekstre seçildiğinde konfor harcaması uyarısı

### Konfor Harcaması Kartı
- "Genel harcama kartı" → "Konfor harcaması kartı" tüm uygulamada
- Ekstre modunda kart yukarıdan aşağı sayar (limit − harcanan)
- Info açıklaması güncellendi

### Otomatik Yedekleme
- saveDB: her gün otomatik Firebase snapshot (backups/{familyId}/{tarih})
- Son 7 gün tutulur, eskiler otomatik silinir
- Ayarlar → Yedekleme: tarih seçerek geri yükleme

### Bug Fix'ler
- Taksit aktarımı groupA'ya eklenmiyordu (banka bakiyesi düşmüyordu) — düzeltildi
- localStorage farklı aileler arası veri sızıntısı — familyId bazlı izolasyon
- Onboarding beyaz ekran — _theme değişkeni bileşen içinde tanımlandı
- KK aktarımları scroll sorunu — tab bar altında kalan işlemler
- KK aktarımları tarih sıralama (yeniden eskiye)

### UI Düzeltmeleri
- "KK" → "Kredi Kartı" olarak değiştirildi
- Giriş ekranı placeholder'dan kişisel isim kaldırıldı
- DD varsayılanları sıfırlandı (monthlyBudget: 0, emergencyTampon: 0)

## Neden böyle yapıldı
- Planlı etkinlikler: bütçesi kesin olmayan ama tarihi belli etkinliklerin planlanması
- Ekstre modu: uygulamayı genele yaymak için farklı KK ödeme alışkanlıklarını desteklemek
- Otomatik yedek: Firebase'den yanlışlıkla veri silinmesi sonrası acil önlem
- Onboarding: 20 kişilik test grubu için ilk kurulum deneyimi

## İç düşünme süreci
- localStorage izolasyonu: eski tek anahtar tüm aileler için kullanılıyordu, familyId bazlı ayrım yapıldı
- Ekstre modu mimarisi: calcMonth'da dallanma yerine veri kaynağını değiştirme yaklaşımı tercih edildi (prevMd vs md)
- Onboarding tetikleme: onboardingCompleted flag'i yerine monthlyBudget === 0 kontrolü daha güvenilir bulundu
- Taksit aktarım bug: groupA ve groupB'de taksit transferlerinin eksik hesaplanması tüm bütçe dengesini bozuyordu

## Sonraki adımlar
- Auth sistemi: email link ile kayıt + ilk girişte şifre belirleme
- Email doğrulama: gerçek olmayan email ile kayıt engelleme
- Maaş günü dinamik döngü: şu an 15 sabit, kullanıcı seçimine göre olmalı
- Over-engineering sadeleştirme: hedef öncelik sistemi, KK tek tek aktarım
- "Nasıl Kullanılır" bilgilendirme sayfası
- App Store / Google Play hazırlığı

## Gözlem
- Abdullah veri kaybı yaşadı (Firebase'den yanlışlıkla silme) — otomatik yedek sistemi acil ihtiyaç olarak eklendi
- Uygulamayı 20 kişilik test grubuna açma planı var — onboarding ve genele uyumluluk öncelik kazandı
- Premium AI özelliği ve aylık abonelik modeli düşünülüyor
