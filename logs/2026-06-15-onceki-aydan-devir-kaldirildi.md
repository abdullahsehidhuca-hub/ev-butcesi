# 2026-06-15 — "Önceki aydan devir" mekanizması kaldırıldı

## Ne yapıldı

`calcMonth` içindeki canlı devir düşümü (`carryoverDeficit`) tamamen kaldırıldı:
- `effectiveBudget = baseBudget - carryoverDeficit` → `effectiveBudget = baseBudget`
- Bütçe dökümündeki "Önceki aydan devir" satırı kaldırıldı (App.jsx ~950)
- "Geçen aydan … devir" uyarısı kaldırıldı (App.jsx ~1140)
- Artık hiçbir yerden çağrılmayan `calcFlat` fonksiyonu (64 satır) silindi
- `npx vite build` → başarılı

## Neden böyle yapıldı

Abdullah'ın bankadaki gerçek tutarı (221.586 ₺) ile uygulamanın gösterdiği (190.371 ₺)
arasında 31.215 ₺ fark vardı. Kök neden:

- Borç "Dostlar Sandığı" altın cinsinden (7 gr/ay), kur uygulamada **global** tutuluyor
  (`liveRates.XAU`), aya özel değil.
- Mayıs'ta borcu erteleyip kuru sıfırladığı için Mayıs borç maliyeti 0 görünüyor, Mayıs
  +14.425 artıdaydı, devir yoktu.
- Haziran'da borcu ödemek için kuru 6520 girince, bu kur **geçmişe dönük Mayıs'a da**
  uygulandı → Mayıs borcu 45.640 oldu → Mayıs −31.215 sahte açığa düştü.
- `carryoverDeficit` her render'da `calcFlat(önceki ay)` ile **canlı** hesaplandığı için bu
  sahte açık Haziran bütçesine "devir" olarak sızdı.

Abdullah'ın mimari itirazı doğruydu: kapanmış bir kasa (ay) yeni kasayı etkilememeli. Sadece
taksit ve sarkan fatura çok aylıdır ve onlar zaten kendi takvimleriyle taşınıyor. Devir
mekanizması ise kapanmış ayı dondurulmamış halde canlı yeniden hesaplayan tek "sızıntıydı".

## İç düşünme süreci

- İlk analizde masaüstündeki yedek üzerinden hesapladım; o yedekte Haziran borç ödemesi henüz
  işaretli değildi, bu yüzden "deviri silmek seni hedeften uzaklaştırır" gibi yanlış bir
  sonuca vardım. Ekran görüntüsü (190.371) gelince canlı veride borcun ödenmiş olduğu anlaşıldı
  ve tablo tersine döndü — kullanıcının talebi doğruydu.
- Alternatif çözümler değerlendirildi: (A) borç erteleme fonksiyonu eklemek, (B) kapanan
  ayların kurunu dondurmak, (C) devir mekanizmasını tümden kaldırmak. Kullanıcının "kapanan
  kasa etkilemez" ilkesi en temiz ve en az riskli olanı (C) işaret ediyordu; aynı zamanda
  kur/borç geriye dönük bozma sorununun tüm sınıfını ortadan kaldırıyor.
- Geriye uyumluluk kontrolü: Nisan ve Mayıs hiç etkilenmiyor (Nisan +3.961 artıyla kapanmış,
  Mayıs zaten devir almıyordu). Sadece Haziran etkileniyor: bütçe 378.785 → 410.000, banka
  190.371 → 221.586 (gerçek bakiyeyle birebir).

## Sonraki adım

- Push + Vercel deploy onayı bekliyor (kullanıcı "commitle" dedi, push ayrıca sorulacak).
- Açık iki konu: (1) ay kapatırken **devir yönetimi ekranı** (mockup hazır: mockups/devir-yonetimi.html),
  (2) **borç erteleme** fonksiyonu — global kur sıfırlama hilesine gerek kalmaması için.
- Gerçek açık verilen aylarda settlement artık ay-kapatma anında ele alınmalı (birikimden
  kapat / görmezden gel), canlı bütçe düşümüyle değil.

## Gözlem

Abdullah sorunu A/B çözüm ikilemi olarak değil, **mimari ilke** olarak çerçeveledi ("kapanan
kasa yeni kasayı niye etkilesin?"). Bu, sunulan seçenekler arasında seçim yaptırmak yerine
kökü sorgulayan güçlü bir yaklaşım — 5N1K kuralının kullanıcı tarafından uygulanmış hali.
