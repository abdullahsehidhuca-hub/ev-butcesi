# 2026-05-01 — Auth, AI Proxy, Banka Kartı, Maaş Günü, Onboarding

## Ne yapıldı

### Auth Sistemi
- Google Sign-In: mobilde redirect, masaüstünde popup
- Email kayıt: sendEmailVerification ile doğrulama (Email Link kaldırıldı)
- Davet akışı sadeleştirildi: kod → Google/şifre → katıl (email doğrulama kaldırıldı)
- Login: isim+şifre → email+şifre (isim benzersizlik kontrolü kaldırıldı)
- Google redirect aile oluşturma App seviyesine taşındı (race condition çözüldü)
- pendingRegName localStorage'a hesap oluşturmadan ÖNCE yazılıyor
- Firebase Console: Google Sign-In, Email Link, localhost yetkili alan

### API Güvenlik Proxy
- api/ai-advisor.js: AI danışman günde 3 hak, JWT payload'dan UID
- api/analyze-receipt.js: Fiş analizi sınırsız
- VITE_ANTHROPIC_API_KEY frontend'den tamamen kaldırıldı
- firebase-admin denendi, ESM uyumsuzluğu nedeniyle kaldırıldı

### AI Danışman Prompt
- Çift sayma engeli (B bloke açıklaması, aktarılmamış KK notu)
- Danışmanlık modu: durum raporu → tavsiye odaklı
- İleriye dönük veriler: planlı etkinlikler, gelecek 3 ay yük, birikim hedefleri
- Market fiş analitikleri: fiyat değişim takibi, mağaza karşılaştırması, sık ürünler
- Harcama kişilik profili
- Alışveriş yönlendirmesi (toplu alım, internet siparişi, market markası)
- Gelir yapısı bilgisi prompt'a eklendi

### Banka Kartı Desteği
- Kart tipi: credit/debit seçimi (onboarding + ayarlar)
- calcMonth + calcFlat: banka kartı otomatik aktarılmış sayılır
- ccTransferItems: banka kartı kalemleri aktarma listesinden çıkarıldı
- Hesap Kartı modalı: Konfor Harcaması | Banka Kartı sekmeleri
- debitCardEntries: tutar + açıklama + tarih + harcama listesi + limit
- Dashboard kartı: "Konfor Harcaması Kartı" → "Hesap Kartı"

### Çoklu Gelir Desteği
- incomeEntries: her ay birden fazla gelir kaynağı
- BudgetModal: gelir kalemleri listesi (isim+tutar+tarih)
- Header bütçe kartına tıklama → gelir detay dökümü
- Geriye uyumluluk: incomeEntries yoksa monthlyBudget kullanılır

### Maaş Günü Dinamik Döngü
- cmk(payDay) parametrik: 15 sabit → kullanıcı seçimli
- cmk çağrısı 15+ yerden 1 yere indirildi (App bileşeni, mk prop)
- Ayarlar → Aylık Bütçe'de maaş günü değiştirilebilir
- AI prompt dönem hesabı payDay'den dinamik
- calcMonth/calcFlat: cmk bağımlılığı tamamen kaldırıldı

### Onboarding İyileştirmeleri
- Sabit gider simge kütüphanesi (23 simge)
- Harcama kategorileri adımı (10 hazır öneri + özel)
- Sabit gider önerileri: değişken faturalar çıkarıldı (elektrik, su, doğalgaz)
- Bilgilendirme yazıları büyütüldü (kutucuk içinde, koyu renk)
- İleri/Geri butonları sabit (scroll dışında)
- Kart tipi seçimi: Kredi Kartı / Banka Kartı
- 7 adımdan 8 adıma genişledi

### Tanıtım + Nasıl Kullanılır
- Onboarding sonrası 4 sayfalık tanıtım ekranı
- Ayarlar → Nasıl Kullanılır: 5 bölüm SSS formatında

### Diğer Düzeltmeler
- ccTransferItems + md tanımsız değişken hataları (AI danışman)
- "Market Fişi" → "Harcama Fişi" isim değişikliği
- Düzenle/Sil butonları büyütüldü
- Aile üyesi ekleme placeholder kaldırıldı
- Kopyala butonu "✓ Kopyalandı" geri bildirimi

## Neden böyle yapıldı
- firebase-admin Vercel ESM runtime'da çalışmadı → JWT payload parse
- Email Link Sign-In mail göndermiyordu → sendEmailVerification'a geçildi
- Google signInWithPopup iOS Safari'de çalışmıyor → mobilde redirect
- Google redirect sonrası LoginScreen unmount → aile oluşturma App seviyesine taşındı
- İsim benzersizliği aynı isimde iki kişiyi engelliyordu → kaldırıldı, login email tabanlı
- cmk() 15+ yerde tekrarlanıyordu → tek noktaya indirildi, mk prop olarak geçiyor
- Sabit giderlerde elektrik/su/doğalgaz vardı → bunlar değişken, çıkarıldı

## İç düşünme süreci
- Auth sistemi 5-6 iterasyon geçirdi. Email Link → sendEmailVerification, popup → redirect, LoginScreen → App seviyesi. Her seferinde test feedback'i ile düzeltildi.
- Banka kartı eklenmesi tüm hesaplama zincirini etkiledi: calcMonth, calcFlat, ccTransferItems, groupA/B ayrımı. Her birini ayrı simüle ettim.
- cmk refactoru iki aşamalıydı: önce parametre eklendi, sonra Abdullah "en temiz çözüm mü?" diye sordu → mk prop yaklaşımına geçildi.

## Sonraki adım
- App Store / Play Store hazırlığı
- Premium AI abonelik sistemi
- Test grubundan geri bildirim toplama

## Gözlem
- Abdullah simülasyon ve geriye uyumluluk kontrolü istiyor — her değişikliğin mevcut fonksiyonları bozup bozmadığını doğrulatıyor.
- "En temiz çözüm bu mudur?" sorusu ile kalite standardını yükseltiyor — pragmatik çözümle yetinmiyor.
- Kullanıcı perspektifinden düşünüyor: "banka kartı kullananlar ne yapacak?", "iki maaş alan ne yapacak?"
