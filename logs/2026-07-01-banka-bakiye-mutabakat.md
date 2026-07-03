# Banka Bakiyesi ↔ Uygulama Mutabakatı (Haziran 2026)

## Ne yapıldı
30.06.2026 uygulama yedeği (`ev-butcesi-2026.06.30.json`) ile Kuveyt Türk
"EV BÜTÇESİ" hesabının 15.06–30.06.2026 ekstresi (`Hesap Ekstresi.pdf`)
satır satır karşılaştırıldı.

- Uygulamanın "Bankadaki Tutar" = `remainingY = 410.000 − groupA` formülü
  koddan (App.jsx 600-748) doğrulandı.
- Haziran groupA = 395.278,50 → app Bankadaki Tutar = **14.721,50**
- Ekstre dönem sonu bakiye = **20.474,50**
- Fark = **5.753,00** (uygulama daha AZ gösteriyor)

## KESİN SONUÇ (PDF görsel okumayla düzeltildi)
pdftotext, A044B ve A00XT satırlarında **Tutar ve Bakiye kolonlarını ters
okumuştu**. PDF görsel okunduğunda gerçek değerler ortaya çıktı: o iki
transfer 308.000/119.586 değil, **102.000'er TL**. Düzeltilmiş işlem
zinciri kuruşu kuruşuna doğrulandı (kapanış 20.474,50 = OUT 502.285,68,
IN 512.000).

- A044B −102.000 "Kiralar+burslar" → **gerçek** kira+burs ödemesi
- A00XT −102.000 "Ev Kira+Babam+Burs" → **HATALI/mükerrer**, hemen
  A02PR +102.000 ile geri alınmış (net sıfır). Kullanıcının "ters işlemli
  hatalı transfer" tespiti doğrulandı.

**Fark 5.753 = 8.500 − 2.747 (tam):**
1. **+8.500 (asıl sebep):** Uygulama Ev Kirası 69.000 + Babam kira 27.000
   + Burslar 14.500 = **110.500**'ü "ödendi" sayıyor; bankadan kira+burs
   için yalnızca **102.000** çıkmış (A044B). 8.500 TL app'te ödenmiş
   görünüyor ama hesaptan çıkmamış.
2. **−2.747:** App'te olmayan gerçek çıkışlar — Man ped 1.000 (22.06) +
   2. elektrik MEPAŞ 1669009 1.747 (30.06).

Doğrulama: 14.721,50 + 8.500 − 2.747 = **20.474,50** = reel bakiye. ✓

## Diğer bulgular
1. **Çift sayma YOK.** groupA'daki her kalem ekstrede birebir görülüyor.
   4 Haziran faturası yalnız billEntries'te; tekrar yok. "Faturalar kartı
   çift sayıyor" hipotezi doğrulanmadı.
2. Doğalgaz 430 (15.06) hesap sıfırlanmadan önce = geçen ay artanından,
   Haziran'da olmaması doğru.
3. Hesap, +102.000/−102.000 round-trip dışında temiz bir bütçe hesabı.

## Sonraki adım
- Abdullah: 110.500 mü 102.000 mü? Ev Kirası/Babam kira/Burslar'dan
  hangisi 8.500 fazla/erken "ödendi" işaretlenmiş, bul ve düzelt.
- Man ped 1.000 girişini ekle.
- 2. elektrik 1.747 geçen aya mı ait karar ver (fiziken 30.06'da çıktı).

## Gözlem
Abdullah forensik/denetim tipi istekte net veri ve kanıt bekliyor;
"teorik gerekçelerle oyalanma" uyarısı belirgin. Hipotezini sundu ama
"doğru kabul etme" dedi — bu doğrulama disiplini güçlü.
