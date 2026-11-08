# Ev Bütçesi v3 — Görsel tasarım promptu (Claude Design + Adobe Firefly)

Hazırlayan: iş #23 düzeltme isteği (Abdullah, 2026-11-07).
Kullanım: aşağıdaki kutunun içindekini olduğu gibi kopyalayıp **Chrome'da Claude eklentisi açıkken**
Claude'a yapıştırın. Başlamadan önce Chrome'da Adobe hesabınızla firefly.adobe.com'a giriş yapın;
Claude giriş ekranını, şifreyi veya ödeme ekranını sizin yerinize geçemez.

Neden bu prompt: ilk v3 görseli reddedildi (kutu içinde kutu, web/trend araştırması yok, ilk bakışta
yapay zekâ tasarımı olduğu belli, Plus Jakarta Sans + koyu yeşil kalıbı). Prompt önce gerçek araştırma
yaptırır, sonra iki bağımsız çalışma çıkartır. Ekran içerikleri ve metinler `src/v3/` ile `src/core/`
kodundan alınmıştır; tasarımcı kodu görmeden doğru ekranı çizebilsin diye promptun içindedir.

---

````text
Rolün: kıdemli mobil ürün tasarımcısısın. Türkiye'de bir aile bütçesi uygulamasının (Ev Bütçesi, sürüm 3)
yeni görsel kimliğini ve ana ekranlarını tasarlayacaksın. İşi baştan sona KENDİN yürüt: her adımın
sonunda onay bekleme, bir sonraki adıma geç. Yalnız şu durumlarda dur ve bana sor:
(a) bir sitede giriş, şifre, doğrulama kodu ya da CAPTCHA istendiğinde,
(b) Adobe Firefly'da ücretli kredi satın alma ya da plan yükseltme istendiğinde
    (en fazla 40 üretim kredisi harca; daha fazlası gerekiyorsa sor),
(c) bir sitenin kullanım koşulları ekran görüntüsü almayı ya da kopyalamayı yasaklıyorsa.
Gerçek kişisel ya da finansal veri yükleme; yalnız aşağıdaki örnek verileri kullan.

== 1. ÜRÜN ==
- Kim kullanıyor: Türkiye'de yaşayan çiftler ve aileler. İlk kullanıcı Konya'da bir eczacı ve eşi;
  ileride App Store ve Google Play'de herkese satılacak ticari ürün. Ana kullanım iPhone Safari / iOS.
- Dert: Ay maaş gününden maaş gününe sayılır (ör. 15 Kasım – 14 Aralık). Kira, fatura, kredi kartı
  taksitleri, borçlar ve market harcaması karışıyor. Kullanıcı üç soruya bir bakışta cevap istiyor:
  1) Bu ay güvenle ne kadar harcayabilirim? 2) Yaklaşan ödemeler neler? 3) Gelecek aylarda taksit yüküm ne?
- İlke: az dokunuş. Harcama girişi en fazla 2 adım: tutar → kategori. Hesap ve tarih kendiliğinden dolar.
- Uygulamadaki rakam bankadaki rakamla kuruşu kuruşuna aynı olmalı; güven duygusu tasarımın merkezinde.

== 2. ÖNCE GERÇEK ARAŞTIRMA (en az 25 dakika, atlama) ==
Tarayıcıda gerçekten ara ve sayfaları aç; hafızandan liste yazma. Her kaynak için adres, tarih ve
neyi neden beğendiğini not et.
- Ödül ve vitrinler: Apple Design Awards (son 3 yıl), App Store 'Uygulama Günlükleri' finans seçkileri,
  Google Play 'Best of' listeleri, Awwwards / CSS Design Awards mobil kategorisi.
- Ekran arşivleri: Mobbin, Screenlane, Page Flows, Dribbble ve Behance'te 'budget app', 'personal finance',
  'family finance', 'bütçe uygulaması' aramaları (son 12 ay, en çok kaydedilenler).
- Gerçek ürünler (ekran görüntülerini mağaza sayfalarından incele): Copilot Money, Monarch Money, YNAB,
  Revolut, Monzo, Emma, Wallet by BudgetBakers, Spendee, Lunch Money, Rocket Money; Türkiye'den Papara,
  Enpara.com, Garanti BBVA, Akbank, Param. Bu listeyi doğrula; kapanmış ya da değişmiş ürünü çıkar,
  araştırmada bulduğun daha iyi örnekleri ekle.
- Güncel arayüz akımları: iOS 26 'Liquid Glass' ve Apple Human Interface Guidelines güncel sürümü,
  Material 3 Expressive. Bunları körü körüne kopyalama; ne alınır, ne alınmaz yaz.
Araştırma çıktısı: 'ARASTIRMA.md' — 12-20 kaynak, her biri 2-3 cümle; sonunda 5 maddelik
'bu üründe işe yarayacak fikirler' ve 5 maddelik 'kaçınılacak klişeler' listesi.

== 3. KESİNLİKLE KAÇIN (önceki taslak bu yüzden reddedildi) ==
- Kutu içinde kutu: her bölümü beyaz kartlara koyup kartların içine yine çerçeveli satırlar dizmek.
- Jenerik 'yapay zekâ tasarımı' görünümü: Inter / Plus Jakarta Sans + tek koyu yeşil + gri arka plan +
  büyük rakam + ince ilerleme çubuğu + emoji ikonlar kalıbı; mor-mavi degrade; her yerde glassmorphism.
- 12 px altı yazı, yalnız renkle verilen anlam, imleçle görünen işlev.
- Eski uygulamanın kahve/krem degrade ve neumorphism dili (renk paletine sadık kalmak zorunlu DEĞİL).
Özgün bir kimlik iste: bir fikir/metafor bul (ör. ayın akışı bir zaman çizelgesi, kumbaranın dolup
boşalması, takvim yaprağı…), onu tipografi, renk ve düzenle tutarlı uygula. Seçtiğin fikri gerekçelendir.

== 4. ÇİZİLECEK EKRANLAR VE GERÇEK İÇERİK ==
Genişlik 390 pt (iPhone 15/16) tasarla; 360 pt'de taşma olmasın. Alt sekmeler: Güncel · Analiz ·
Planlama · Ayarlar, ayrıca her ekranda görünen bir Ekle (+) düğmesi. Örnek veri (TL, Türkçe biçim:
14.550 ₺, 48.265,44 ₺):

A) GÜNCEL (ana ekran)
- Üstte dönem: '15 Kasım – 14 Aralık', alt satır 'Kasım dönemi · Bitişe 18 gün'.
- Odak rakam: 'Kullanılabilir kalan bütçe' 14.550 ₺. Yanında: Harcandı 42.750 ₺ · Bütçelere ayrılan 2.700 ₺.
  Gelirin ne kadarının kullanıldığı görsel olarak anlaşılmalı (%71). (60.000 − 42.750 − 2.700 = 14.550)
- Toplam giriş +60.000 ₺ · Planlanan ödemeler 25.000 ₺ (kalan 17.750 ₺ serbest harcama).
- Hesaplar: Maaş hesabı 26.845,44 ₺ · Nakit 1.250 ₺ · Bonus kart -8.740 ₺ (kart borcu eksi görünür).
- Yaklaşan ödemeler (dokununca 'Ödendi' işaretlenir): Kira 20.000 ₺ · 5 Aralık · '3 gün kaldı';
  Bonus kart ödemesi 8.740 ₺ · 'Kart borcu'; Buzdolabı taksiti 5.000 ₺ · 'Taksit 2/6' · 'Otomatik';
  Maaş +60.000 ₺ · 'Alındı mı?'.
- Son harcamalar: Migros · Market · Maaş hesabı · -1.420 ₺ · Bugün; Opet · Yakıt · Bonus kart · -1.150 ₺ · Dün;
  İade · Giyim · +450 ₺ · 3 Aralık.
- Uyarı durumu örneği: 'Ekim dönemi kapanmadı — 2 ödeme açık kaldı' (ay kapatmaya çağırır).

B) HIZLI HARCAMA EKLE (alt sayfa / sheet)
- Büyük tutar alanı '345 ₺', açıklama 'Örn: Market alışverişi', sık kullanılan kategoriler (Market, Yakıt,
  Dışarıda yemek, Sağlık, Giyim, Tümü), hesap seçimi 'Bonus kart' (kategoride son kullanılan hesaptan
  geldiği belirtilir), Kaydet ve Vazgeç. Açıklama 'migros' yazılınca Market kendiliğinden seçilir.

C) PLANLAMA
- 'Gelecek 3 ayın taksit yükü' 14.200 ₺ /ay; 'Biten taksitler — Şubat: Buzdolabı'.
- Bu dönemin ödemeleri listesi: Ödendi / Bekliyor / Kısmi · kalan 400 ₺ / Otomatik durumları.
- Aktif taksitler: Buzdolabı · Bonus kart · Taksit 2/6 · Sonra 4 taksit · 5.000 ₺.
- Gelecek 6 ay: her ay Gelir / Ödemeler / Bütçeler ve kalan; eksiye düşen ay kırmızı ve metinle belirtilir.

D) ANALİZ
- 'Kasım dönemi harcamalar' 17.750 ₺; kategori payları (Market %24, Yakıt %19…); bütçeler:
  Market 4.200 / 5.000 ₺ · 800 ₺ kaldı; Yakıt 3.300 / 3.000 ₺ · 300 ₺ aşıldı.

E) DURUMLAR (en az küçük örnek olarak): ilk açılış 'Hoş geldiniz — 3 adımda başlayın'
(1. Banka hesabı ve bugünkü bakiye, 2. Maaş ve maaş günü, 3. Kira, fatura gibi sabit ödemeler);
yükleniyor (iskelet, düzen zıplamaz); boş liste ('Bu dönemde henüz kayıt yok'); hata
('Son değişiklik kaydedilemedi'); karanlık mod.
Ayarlar ekranını çizmek zorunlu değil.

== 5. ERİŞİLEBİLİRLİK VE PLATFORM ==
- Gövde yazısı en az 15 pt, ikincil 13 pt, tutarlar en az 17 pt; dokunma alanı en az 44×44 pt.
- Metin karşıtlığı WCAG AA (4.5:1); kırmızı/yeşil anlamı ayrıca metin ya da işaretle de verilmeli.
- Türkçe karakterler (ç, ğ, ı, İ, ö, ş, ü) seçilen yazı tipinde eksiksiz olmalı; bunu kontrol et.
- Yazı tipi ücretsiz ve web'de kullanılabilir olsun (Google Fonts ya da açık lisans); lisansını yaz.
- iPhone çentiği ve alt çubuğu (safe area) için boşluk bırak.

== 6. ÇALIŞMA A — ADOBE FIREFLY (Chrome'da Claude eklentisiyle) ==
1. firefly.adobe.com'u aç (giriş yapılmamışsa dur ve bana söyle).
2. Araştırmadan çıkan fikirle 3 farklı görsel yön için ruh hali panosu (moodboard) üret: her yön için
   renk, doku, yazı karakteri hissi ve bir ana görsel metafor. Promptları İngilizce yaz, kullandığın
   her promptu kaydet.
3. En güçlü yönü seç; Firefly ile ana ekran (A) ve hızlı ekle (B) için yüksek çözünürlüklü arayüz
   konsept görselleri üret (Text to Image, en-boy 9:19.5). Gerekirse ikon/illüstrasyon setini de üret.
4. Firefly görsellerindeki yazılar bozuk olacaktır; bu yüzden konsepti gerçek metinlerle yeniden kur:
   Adobe Express ya da tek dosyalık HTML/CSS ile A, B, C ekranlarını Firefly yönünün renk, doku ve
   illüstrasyonlarını kullanarak gerçek Türkçe metinle çiz.
5. Çıktılar: 'A-firefly/' klasörü — moodboard görselleri, kullanılan promptlar (prompts.md),
   ekran görselleri (PNG, 1x ve 3x), varsa HTML.

== 7. ÇALIŞMA B — CLAUDE DESIGN ==
1. Claude Design'da (claude.ai) yeni bir proje aç; Firefly çalışmasından BAĞIMSIZ, araştırmadaki
   farklı bir fikri seç (iki çalışma birbirine benzememeli).
2. A, B, C, D ekranlarını ve E durumlarını etkileşimli prototip olarak kur: sekmeler arası geçiş,
   + ile açılan alt sayfa, 'Ödendi' dokunuşu, açık/koyu mod geçişi.
3. Çıktılar: 'B-claude-design/' — paylaşım bağlantısı, dışa aktarılmış tek dosya HTML, ekran görüntüleri.

== 8. SON TESLİM ==
'KARSILASTIRMA.md' dosyası yaz:
- Her çalışma için: ana fikir, renk paleti (HEX), yazı tipleri ve boyut ölçeği (pt), köşe ve boşluk
  değerleri, bileşen listesi (sekme çubuğu, satır, alt sayfa, düğme, rozet), karanlık mod renkleri.
- Erişilebilirlik kontrolü: karşıtlık oranlarını ölç ve yaz; 44 pt ve 15 pt kurallarının sağlandığını göster.
- Kaçınılan klişeler listesinin her maddesine göre öz-değerlendirme (geçti / kaldı ve neden).
- Hangisini önerdiğin ve neden; iki çalışmanın birleştirilebilecek en iyi parçaları.
- Bir geliştiricinin React + CSS ile uygulayabileceği tasarım belirteçleri (design tokens) tablosu.
Her şeyi tek bir klasörde topla ve sonunda bana klasörün yerini, harcanan Firefly kredisini ve
yapamadığın adımları (nedenleriyle) kısa bir özetle bildir. Yapamadığın bir şeyi yapılmış gibi yazma.
````

---

## Sonra ne yapılacak
1. Claude'un ürettiği klasörü (özellikle `KARSILASTIRMA.md` ve seçtiğiniz çalışmanın görselleri)
   bu depoya `mockups/v3-tasarim/` altına koyun ve hangisini onayladığınızı yazın.
2. Onaydan sonra yalnız görsel katman (`src/v3/v3.css` ve `src/v3/*.jsx` yerleşimi) yeniden yazılır;
   hesap motoru ve veri bağlantısı değişmez.

Not: Eklediğiniz `Ev Bütçesi v3 — Prompt Testi.html` dosyası paketlenmiş bir tasarım çıktısıdır
(Inter, Manrope, Nunito yazı tiplerini içeriyor); bu promptla yeniden üretildiğinde karşılaştırma
kaynağı olarak kullanılabilir.

---

## Revizyon 1 — Renk paleti ve yazı tipi daha zarif (Abdullah, 2026-11-07)

Geri bildirim: 'fena olmamakla beraber gelişmeye muhtaç; renk paletleri ve metin paketi daha elegance
olabilir.' Seçenekleri önce `mockups/v3-palet-yazi.html` dosyasında telefonda açıp karşılaştırın
(3 palet × 3 yazı eşleşmesi × açık/koyu). Beğendiğiniz birleşimi aşağıdaki promptta işaretleyip
Claude Design / Firefly oturumuna yapıştırın.

````text
Önceki iki çalışmanın düzenini koru; yalnız renk paletini ve yazı tiplerini daha zarif hale getir.
Geri bildirim: 'fena değil ama gelişmeye muhtaç; renkler ve yazı paketi daha elegance olmalı.'

Zarafetten kastım:
- Az renk: zemin + mürekkep + tek vurgu rengi. Yeşil/kırmızı yalnız gelir/aşım anlamında ve küçük.
- Saf beyaz (#FFFFFF) zemin ve saf siyah yazı yok; sıcak kâğıt tonu zemin, çok koyu mürekkep yazı.
- Başlık ve büyük rakamlar için kaliteli bir serif (editoryal dergi hissi), metin ve tablolarda sakin
  bir grotesk; rakamlar sabit genişlikli (tabular) ve hizalı.
- Kalın (700+) yazı yok denecek kadar az; ağırlık 400-600. Harf aralığı küçük başlıklarda geniş,
  büyük rakamda dar.
- Gölge, degrade ve cam efekti yok; ayrım boşluk ve ince çizgiyle.

Seçtiğim yön (birini işaretle):
[ ] Palet 1 · Mürekkep ve pirinç — zemin #F6F3EE, yazı #1C1B22, ikincil #5E5A63, çizgi #E4DED5,
    vurgu #7A5C25, gelir #2F6B4F, aşım #A23B3B · koyu: #15141A / #EEEAE3 / vurgu #D4B77A
[ ] Palet 2 · Bordo ve taş — zemin #F4F1EE, yazı #211B1D, ikincil #625A5D, çizgi #E2DCD7,
    vurgu #6E2A35, gelir #36684A, aşım #9E3B1F · koyu: #171213 / #F1EBE8 / vurgu #E3A3AC
[ ] Palet 3 · Gece mavisi ve kum — zemin #F3F1EC, yazı #141B2D, ikincil #586074, çizgi #DFDBD2,
    vurgu #1F3A68, gelir #2D6A55, aşım #A33636 · koyu: #0F1422 / #ECEAE4 / vurgu #A9C1EC
[ ] Yazı A · Fraunces (başlık, rakam) + Hanken Grotesk (metin)
[ ] Yazı B · Newsreader + Schibsted Grotesk
[ ] Yazı C · Cormorant Garamond + Manrope
(Hepsi Google Fonts'ta açık lisanslı. Türkçe ğ, İ, ı, ş harflerini her ağırlıkta kontrol et; eksikse söyle.)

Bu paletler önerilen başlangıç; daha iyisini bulursan araştırmaya dayanarak öner ama karşıtlığı ölç:
metin ≥ 4,5:1, büyük rakam ≥ 3:1, koyu modda da aynı.

Teslim: aynı A, B, C ekranlarının yeni palet ve yazıyla açık + koyu hâli; 'KARSILASTIRMA.md'ye
'Revizyon 1' bölümü (eski → yeni renk/yazı tablosu, ölçülen karşıtlık oranları, hangi seçimi neden
önerdiğin). Önceki çıktıları silme, yanına '-r1' ekiyle kaydet.
````

Bu depodaki paletlerin karşıtlık oranları ölçüldü (WCAG): açık zeminde metin 15:1, ikincil yazı 5,6–6,1:1,
vurgu 5,6–10:1, gelir/aşım 5,6–6,0:1; koyu modda tümü 7,4:1 ve üzeri. Yazı tiplerinin Türkçe karakterleri
tarayıcıda denenmedi; taslağın en altındaki 'Türkçe karakter denetimi' satırından gözle kontrol edin.
