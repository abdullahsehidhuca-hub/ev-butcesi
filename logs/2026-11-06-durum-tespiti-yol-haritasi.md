# Durum Tespiti ve Yol Haritası — 6 Kasım 2026

## Ne yapıldı
Kod tabanı baştan sona incelendi (yalnızca okuma; uygulama kodunda değişiklik yapılmadı).
`npm ci` + `npm run build` çalıştırıldı: derleme BAŞARILI (1,4 sn), tek JS dosyası 941 kB (sıkıştırılmış 237 kB).
Tarayıcıda/telefonda canlı deneme YAPILMADI; UI gözlemleri koddan çıkarılmıştır.

## Genel tablo
- Tüm uygulama tek dosyada: `src/App.jsx` 9.099 satır. Analiz ekranı tek başına ~1.900, Planlama ~1.600 satır.
- Otomatik test yok. Para hesaplayan bir uygulama için en büyük teknik risk bu.
- 3 aylık gerçek kullanım değerli bir "ihtiyaç listesi" üretmiş: ay döngüsü (maaş gününe göre), kart ekstre modu, taksit, borç erteleme, devir, fatura, birikim. Bu bilgi korunmalı; kod yeniden kurulabilir.

## Bulgular (önem sırasıyla)

### A. Veri güvenliği / veri kaybı (kritik)
1. **Tüm veri tek parça yazılıyor** (`saveDB`, App.jsx:158). Her küçük değişiklikte `families/{id}/data` baştan sona üzerine yazılır. Abdullah ve Kadriye aynı anda giriş yaparsa son kaydeden diğerinin girdisini silebilir.
2. **Çevrimdışı açılışta eski veri buluta yazılabilir** (`loadDB`, App.jsx:142 + App.jsx:8893). Firebase okunamazsa telefondaki eski kopya yüklenir, ilk değişiklikte bu eski kopya buluttaki güncel verinin üstüne yazılır.
3. **Yankı yazma**: buluttan gelen her güncelleme varsayılanlarla birleştirilip tekrar buluta yazılıyor (App.jsx:8878-8893).
4. Otomatik yedek yalnız son 7 gün; yedek de aynı veritabanında.

### B. Güvenlik (kritik)
1. **AI uç noktaları kimlik doğrulamıyor** (`api/_anthropic.js` getToken/getUid). Token yalnızca çözülüyor, imzası denetlenmiyor; herhangi bir sahte metinle API anahtarınız üzerinden AI çağrısı yapılabilir. Günlük limit bellekte tutulduğu için sunucu her uyandığında sıfırlanır ve uid sahtelenebilir. `firebase-admin` paketi kurulu ama kullanılmıyor.
2. `prompt` serbest metin; uç nokta pratikte açık bir AI vekili.
3. **Veritabanı kuralları depoda yok**, denetlenemedi. `nameIndex` (isim→e-posta) girişten önce okunuyor; `invitations` 6 haneli kodla korunuyor. Kurallar gevşekse e-postalar okunabilir, davet kodu tahmin edilebilir.

### C. Hesaplama mantığı ve "sonraki aylara etki" (yüksek)
`calcMonth` (App.jsx:550) her ayı, o ayın kendi kaydından değil **bugünkü ayarlardan** hesaplıyor:
1. Sabit giderler `settings.fixedExpenses`'ten okunuyor → bir sabit gideri bugün değiştirmek geçmiş ayların raporunu da değiştirir.
2. Döviz/altın borçları her ay için **canlı kurla** hesaplanıyor → geçmiş aylar kur oynadıkça değişir.
3. Borç kalan ay sayısı "bugüne" göre (`remainingMonths` + `monthsAhead`) → geçmiş ay görünümleri tutarsız.
4. Ekstre modunda geçen ayın KK sabit giderleri de bugünkü listeden alınıyor.
5. Taşınan fatura iki ayrı yolla izleniyor (`carriedItems` ve `prevBillCarry`); ikincisi hesaplanıp kullanılmıyor gibi görünüyor — çift/eksik sayım riski, doğrulanmalı.
6. Ay anahtarı cihaz saatiyle hesaplanıyor (`cmk`); iki telefonun saati/maaş günü ayarı farklıysa farklı ay görülebilir.

Kök neden: "plan" (gelecek yükümlülükler) ile "gerçekleşen" (o ay olan) aynı veri yapısında karışık; kapanan ay dondurulmuyor.

### D. Veri girişi (yüksek)
Aynı harcama türü 7 farklı listeye dağılmış: `ccSingle`, `accountEntries`, `debitCardEntries`, `cardEntries`, `variableEntries`, `billEntries`, `carriedItems`; ayrıca `fixedPaid`, `ccTransferred`, `accountTransferred` gibi işaret tabloları. Kullanıcı "ne aldım, ne kadar, nereden ödedim" yerine "hangi modal" sorusunu düşünmek zorunda kalıyor.

### E. Arayüz / erişilebilirlik (orta)
- Ana ekranda 48 yazı ≤11 px (9–11 px); 13 px altı çoğunlukta.
- `user-scalable=no, maximum-scale=1` yakınlaştırmayı engelliyor (index.html).
- Tüm stiller satır içi; tema global değişkenlerle (`let X`) değişiyor.
- index.html'de `</html>` sonrasında fazladan bir `<link>` satırı var; `theme-color` manifest ile farklı.
- Service worker yok → "PWA" gerçek çevrimdışı çalışmıyor.
- README port 3000 diyor, vite.config 5180.
- vercel.json'da SPA yönlendirmesi yok (şu an tek adres olduğu için sorun çıkarmıyor; sayfa yolları eklenirse gerekir).

## Yol haritası (öneri)

**Faz 0 — Acil koruma (1 hafta, mevcut uygulamada)**
- AI uç noktalarında `firebase-admin` ile gerçek token doğrulama + kalıcı limit.
- Veritabanı kurallarını depoya al, gözden geçir.
- Çevrimdışı açılışta buluta otomatik yazmayı durdur; yankı yazmayı kaldır.
- Haftalık JSON dışa aktarımını teşvik et (zaten var).

**Faz 1 — Doğru veri modeli (yeniden kurulumun kalbi)**
- Tek "işlem" (transaction) kaydı: tarih, tutar, kategori, ödeme kaynağı (hesap / kart / banka kartı), ödendi mi.
- "Yükümlülükler" ayrı: sabit gider, taksit, borç — her biri kendi takvimini üretir; ay görünümü bu takvimden türetilir.
- Ay kapatıldığında ay **dondurulur** (o ayın tutar, kur ve kalemleri sabitlenir).
- Kayıtlar tek tek yazılır (tüm veri değil) → iki kişi aynı anda güvenle kullanır.
- Hesap kuralları ayrı, test edilen bir modülde (ay döngüsü, ekstre, taksit, devir). Mevcut 3 aylık veriden test senaryoları üretilir.

**Faz 2 — Sade arayüz**
- Tek "+ Ekle" akışı (tutar → kategori → kaynak; varsayılanlar son kullanımdan).
- Ana ekran 3 soru: Bu ay ne kadar kaldı? Yaklaşan ödemeler? Plana göre neredeyim?
- Analiz ve Planlama sadeleştirilir; yazılar ≥15 px, dokunma alanı ≥44 px, yakınlaştırma açık.
- Önce HTML mockup, onay sonrası kod (CLAUDE.md kuralı).

**Faz 3 — Taşıma ve yayın**
- Eski veriden yeni modele dönüştürücü; iki sürüm bir ay paralel çalışır, sonuçlar karşılaştırılır.
- iOS/Android: PWA (service worker + manifest) yeterli; mağaza gerekirse Capacitor ile aynı kod paketlenir.

## Açık sorular (Abdullah'a)
1. Yeniden yazım mı, mevcut üzerinde kademeli dönüşüm mü? (Önerim: veri modeli + hesap motoru yeniden, ekranlar kademeli.)
2. "Herkes kullanabilsin" = başka aileler de mi? Öyleyse güvenlik ve maliyet (AI) kararları değişir.
3. Uygulama mağazası gerekli mi, ana ekrana ekleme yeterli mi?
4. En çok zaman alan veri girişi hangisi? (Kart harcaması, fiş, ekstre?)

## Sonraki adım
Faz 0 için onay; ardından Faz 1 veri modeli taslağının sade dille sunulması.

## Ek — Faz 1 çekirdeği (aynı gün, düzeltme isteği)
- Ne yapıldı: Veri modeli ve hesap motoru `src/core/` altında yeniden yazıldı; `tests/core.test.js` (10 test) ve `npm test` betiği eklendi. Mevcut arayüz (`src/App.jsx`) değişmedi, yeni çekirdeğe henüz bağlı değil.
- Neden: Geçmiş ayların bugünkü ayardan/kurdan yeniden hesaplanması ve dağınık giriş listeleri kök nedendi; yeni modelde tek işlem tipi, takvim üreten yükümlülükler, ileriye dönük tutar değişikliği ve dondurulan dönem var.
- Değerlendirilen alternatif: Mevcut `calcMonth` üzerinde yama — reddedildi; ay verisi ayarlardan türediği sürece geçmiş korunamaz.
- Yorum: "Tüm veriler çok tuşlamalı" ifadesi "veri girişi çok fazla dokunuş istiyor" olarak anlaşıldı; hedef 2 adımlı giriş + sık kullanılanlar (widget kaynağı).
- Sonraki adım: Yol haritası artık kök dizinde `ROADMAP.md`; sıradaki maddeler orada işaretli.
