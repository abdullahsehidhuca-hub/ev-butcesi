# v3 arayüzü ilk sürüm — "Sade ve ferah" taslağı yeni motora bağlandı (7 Kasım 2026)

> **Düzeltme (2026-11-07, Abdullah):** Bu görsel tasarım ONAYLANMADI. İş akışı taslağı "onaylı"
> olarak iletmişti; bu yanlıştı. Gerekçe: kutu içinde kutular, web araştırması ve güncel trend
> incelemesi yok, ilk bakışta yapay zekâ tasarımı olduğu belli. Bu dosyadaki "onaylı" ifadeleri
> geçersizdir. Veri bağlantısı (`src/v3` → `src/core`) korunur; görsel katman yeniden tasarlanacak.

Çalışma dalı: `agent/23`. `main`'e birleştirilmedi (birleştirme canlıya çıkar; ayrı karar).

## Ne yapıldı
- Yeni arayüz `src/v3/` altında yazıldı ve **/v3** adresinde açılıyor. `/` adresindeki yayındaki
  uygulama (`src/App.jsx`) değişmedi; v3 ayrı paket olarak yalnız /v3'te yüklenir.
- Arayüz yeni hesap motoruna (`src/core`) bağlı; ekranlar hesap yapmaz, çekirdek fonksiyonlarını
  çağırır (`computePeriod`, `projection`, `installmentLoad`, `balanceOf`, `quickAdd`,
  `payObligation`, `favorites`, `suggestCategory`/`learnCategory`, `addInstallmentPurchase`).
- Ekranlar (onaylı taslağın 4 sekmesi + sağ altta + düğmesi):
  - **Güncel:** kullanılabilir kalan bütçe (güvenle harcanabilir), doluluk çubuğu, toplam giriş /
    planlanan ödemeler, hesap bakiyeleri şeridi, yaklaşan ödemeler (dokununca "ödendi/alındı",
    kart borcu için "ödemeyi kaydet"), son harcamalar. Hesap yoksa 3 adımlı karşılama.
  - **Analiz:** dönem harcaması, kategori dağılımı, kategori bütçeleri (aşım kırmızı).
  - **Planlama:** gelecek 3 ayın taksit yükü, bu dönemin tüm ödemeleri ve durumu, aktif
    taksitler (kalan taksit), gelecek 6 ay planı.
  - **Ayarlar:** ay döngüsü (maaş günü), hesap / kategori / maaş / sabit ödeme / taksitli
    alışveriş ekleme, bu sürümün verisini silme, eski sürüme dönüş bağlantısı.
  - **Hızlı harcama çekmecesi:** tutar → (açıklama) → kategori → Kaydet. Hesap kategoride son
    kullanılandan gelir; açıklamadan kategori önerilir, seçim öğrenilir.
- Veri bu cihazda ayrı anahtarda (`evButcesi.v3.state`) saklanır; eski uygulamanın verisi okunmaz
  ve değiştirilmez (karar: eski veriler aktarılmayacak). Okunamayan veri silinmez, `.bozuk` ekli
  anahtara yedeklenir; kaydetme başarısızsa ekranda uyarı çıkar.
- `vercel.json`: /v3 adresi doğrudan açıldığında ve yenilendiğinde çalışsın diye yönlendirme.
- Testler: `tests/v3.test.js` (tutar ayrıştırma/gösterimi, dönem etiketleri, saklama). 43/43 geçiyor.
  `npm run build` başarılı. Ekranlar örnek veriyle sunucu tarafında çizilip metinleri kontrol edildi.

## Neden böyle yapıldı
- Eski uygulamayı yerinde değiştirmek yayındaki kullanımı (Abdullah ve Kadriye'nin bütçesi)
  riske atardı ve yeni motor eski veri yapısıyla uyumsuz. Ayrı adres, ikisinin yan yana
  denenmesini sağlar.
- Bulut senkronu ve veritabanı kuralları henüz yazılmadığı için v3 yalnız cihazda saklıyor;
  canlı veritabanına deneme verisi yazılmadı.
- Görünüm taslaktaki değerlerle `src/v3/v3.css` içinde (yalnız `.v3` kapsamında) kuruldu;
  eski temanın `X` nesnesi yeni arayüzde kullanılmadı (müşteri notu: renk paletine sadık kalma).

## Taslaktan bilinçli sapmalar
- Ad, meslek ve banka gibi kişisel örnek metinler ("Abdullah & Kadriye", "Eczane") koda
  yazılmadı; tüm satırlar kullanıcının girdiği veriden gelir.
- Üst bardaki fiş tarama düğmesi ve aile avatarları yok: AI fiş okuma ertelendi, aile paylaşımı
  bulut senkronuna bağlı.
- "Birikim & Döviz" şeridi yerine **hesap bakiyeleri** şeridi: birikim/altın çekirdekte henüz yok.
- 10-11 px yazılar 12 px'e çıkarıldı; uyarı rengi #D97706 yerine #B45309 (beyaz üzerinde küçük
  yazı için yeterli karşıtlık); klavye odak halkası ve hareket azaltma desteği eklendi.
- Giriş alanları 16 px (iOS Safari 16 px altında yakınlaştırma yapar).

## İç düşünme süreci
- Alternatif: v3'ü ayrı bir HTML girişi (`v3.html`) olarak açmak. Tek giriş + adres kontrolü daha
  az yapılandırma istedi ve PWA bildirimi ortak kaldı.
- Gelir kaleminde günü geçmiş maaş "gecikti" görünüyordu; dönem ortasında eklenen maaş genelde
  zaten yatmıştır. "Alındı mı?" olarak değiştirildi.

## Doğrulanamayanlar
- iPhone Safari, karanlık mod ve ekran okuyucu ile cihazda deneme yapılmadı.
- Vercel'de /v3 yönlendirmesi canlıda denenmedi (yapılandırma Vercel belgesindeki biçimde).
- Görsel tasarım üretimi bu aşamada yapılmadı; Gemini CLI/API kullanılmadı (onaylı taslak hazır geldi).

## Sonraki adım
1. Abdullah /v3'ü telefonda denesin; taslağa uygunluk ve eksikler için geri bildirim.
2. Ay kapatma ekranı (devir kararları: taşı / ertele / vazgeç) — çekirdekte `closePeriod` hazır.
3. Kayıt kayıt bulut senkronu + veritabanı kuralları (emülatörde), ardından aile paylaşımı.
4. Kart hesap kesim günü; kur girişi (dövizli kalemler); düzenleme/silme ekranları; karanlık mod.

## Gözlem
- Müşteri onay notunda tasarımın "tamamen yapay zekâ ile" yapıldığını, web'deki güncel tasarımların
  incelenmediğini ve Adobe Firefly ile daha iyi görseller çıkarılabileceğini belirtti; "mevcut hali
  daha düzgün duruyor" ifadesi hangi sürümü kastettiği açısından netleştirilmeli.

## Düzeltme isteği sonrası (2026-11-07)
- Kodda ve ROADMAP'te "onaylı" ifadeleri kaldırıldı; v3 görseli geçici olarak işaretlendi.
- Abdullah'ın önerdiği yol: Adobe Firefly (Claude hesabındaki bağlantı) ve Claude Chrome eklentisiyle
  görsel tasarım, web'deki güncel finans uygulaması tasarımlarının incelenmesi. Bu ajan ortamında
  tarayıcı, web araması, Chrome eklentisi ve Firefly erişimi yok; bu adım Abdullah'ın Claude
  masaüstü/Chrome oturumunda yapılmalı.
- Sıradaki iş: görsel yön (moodboard + 2-3 ekran) Firefly/web araştırmasıyla üretilsin, Abdullah
  onaylasın; ardından yalnız `src/v3/v3.css` ve bileşen düzeni bu yöne göre yeniden yazılsın.
- İkinci düzeltme isteği: web araştırması + Adobe Firefly (Chrome Claude eklentisi) + Claude Design ile
  iki ayrı çalışma çıkaracak, kendi kendine yürüyen prompt hazırlandı: `docs/TASARIM-PROMPTU-V3.md`.
- Üçüncü geri bildirim (renk ve yazı daha zarif): `mockups/v3-palet-yazi.html` (3 palet × 3 yazı × açık/koyu,
  karşıtlıklar ölçüldü) ve `docs/TASARIM-PROMPTU-V3.md` sonuna 'Revizyon 1' promptu eklendi. Uygulama kodu değişmedi.

## 2026-11-08 · Dış taslak (C tasarımı) mevcut v3'e uyarlandı (iş #31)
Kaynak: Abdullah'ın `ev-butcesi-v3-src.zip` paketi (Özet, Ödemeler, Rapor, Ayarlar, Ekle, Çöz ekranları).
Paket olduğu gibi yapıştırılmadı; mevcut adres, menü, veri saklama ve çekmecelere uyduruldu:
- Adres yine **/v3** (paketteki ayrı `v3.html` girişi alınmadı). Menü adları korundu:
  Güncel ← Özet, Analiz ← Rapor, Planlama ← Ödemeler (+ eski Planlama'daki 3 aylık taksit yükü ve
  aktif taksitler), Ayarlar ← gruplu liste. Sekme `#home/#report/#plan/#settings` ile adreste kalır.
- Veri örnek veri değil, cihazdaki gerçek v3 verisi (`evButcesi.v3.state`). Örnek veri yalnız test
  fikstürü: `tests/fixtures/v3-sample.js`. Hesap yoksa karşılama ekranı.
- Listedeki ✓ doğrudan "ödendi" yazmaz; mevcut ödeme çekmecesini açar (tutar, hesap, kısmi ödeme).
- Harcama ekle: taslak görünümü + mevcut kurallar (açıklamadan kategori önerisi ve öğrenme,
  kategori yoksa kategorisiz kayıt, hesap yoksa hesap ekleme yönlendirmesi, hata mesajı).
- Çöz: "nakitten aktar" gerçek aktarım kaydıdır; "ertele" ve "asgari öde" yalnız tahmin planıdır,
  ayrı anahtarda (`evButcesi.v3.plan`) tutulur. Tema seçimi `evButcesi.v3.tema`.
- Ayarlar'da yalnız çalışan satırlar var (aile daveti, hatırlatma, yedekleme, CSV henüz yok;
  görüntü satırı olarak konmadı). Aile üyesi bölümleri üye verisi gelince açılır.
- Erişilebilirlik: metin olarak kullanılan mavi/yeşil/kırmızı/turuncu ve ikincil yazı ≥4,5:1
  olacak şekilde koyulaştırıldı (taslakta mavi 3,2:1, ikincil yazı 3,3:1 idi); görünür odak;
  360 px'te kategori ızgarası 3 sütun. Türkçe ek hataları ("10 Aralık’da", "Nisan’ta") ekten
  bağımsız ifadelere çevrildi.
- `src/v3/Screens.jsx` kaldırıldı (yerine `src/v3/screens/`). `Sheets.jsx` form çekmeceleri korunur.
- Doğrulama: `npm test` 48/48, `npm run build` başarılı; ekranlar örnek, boş ve tek hesaplı veriyle
  sunucu tarafında çizildi. Gerçek tarayıcı / iPhone Safari'de denenmedi.

### 2026-11-08 · Örnek veri modu ve eski/yeni v3 karşılaştırması
- Yalnız geliştirmede **/v3?ornek**: örnek aile verisi (`src/v3/sampleData.js`, testler de bunu kullanır),
  tarih 26 Kasım 2026'ya sabit, ayrı anahtar (`evButcesi.v3.ornek.*`). Gerçek v3 verisine dokunmaz;
  `import.meta.env.DEV` dışında yüklenmez, örnek kayıtlar canlı pakete girmez (dist'te denetlendi).
- Eski uygulamanın yedeği kullanılmadı: biçim eski, gerçek kişisel finans verisi içerir, eski veri
  aktarımı iptal kararı var.
- Uyarlamada kaybolan gösterimler (karar bekliyor): ana rakam `safeToSpend` yerine `remaining`
  (bütçe ayrımı düşülmüyor), "Bütçelere ayrılan" ve "Toplam giriş" rakamları, maaş için "Alındı mı?"
  işaretleme, son işlemlerde aktarım/gelir/ödeme kayıtları, Analiz'de kategori tutarları ve önceki dönem
  karşılaştırması, 6 aylık planın gelir/ödeme/bütçe dökümü.

## 2026-11-08 · Kaybolan gösterimler geri eklendi, sadeleştirildi (iş #34)
İstek: uyarlamada veri kaybı olmasın, gösterim profesyonelleşsin, aşırı karmaşık yerler veri kaybetmeden sadeleşsin.
- **Güncel:** ana rakam yeniden **Güvenle harcanabilir** (`safeToSpend`: gelir − düzenli ödemeler − harcama −
  bütçelere ayrılan). Örnek veride 9.800 ₺ (önceki uyarlama 18.290 ₺ gösteriyordu). "Günde" tutarı da buna göre.
  Çubuk bütçe ayrımını ayrı dilim olarak gösterir. Toplam giriş (alınan/beklenen), düzenli ödemeler (ödenmemiş
  kısım), harcanan ve bütçelere ayrılan satırları **"Nasıl hesaplandı?"** açılır alanında: veri duruyor, ilk bakış sade.
- **Hesap bakiyeleri** Güncel'e geri geldi (yatay kartlar + net toplam, "Yönet" → Ayarlar).
- **Yaklaşan** listesi beklenen maaşı da gösterir; günü geçmiş ama işaretlenmemiş gelir "Alındı mı?" der, ✓ mevcut
  "alındı" çekmecesini açar.
- **Son işlemler** tüm türleri gösterir: harcama, iade, gelir, aktarım (hesap → hesap), düzenli ödeme / kısmi ödeme.
- **Analiz:** tüm kategoriler tutar + yüzde ile (halka yalnız ilk 4 + Diğer), her kategoride ve toplamda önceki
  döneme göre değişim, "düzenli ödemeler ayrıca" satırı, limitlerde "kaldı / aşıldı". 6 aylık planın gelir /
  ödemeler / bütçeler dökümü grafiğin altında "Aylık döküm" açılır alanında.
- **Ayarlar → Veri:** yedek indir (JSON), yedekten geri yükle (doğrulanır, önce onay sorar, geçersiz dosya veriye
  dokunmaz), işlemleri CSV indir (Excel/Numbers; noktalı virgül, ondalık virgül). Dosyalar yalnız cihaza iner.
- Testler: 7 yeni test (ana rakam dökümü, gelirli yaklaşan liste, tüm işlemler, kategori toplamı, hesap toplamı,
  yedek gidiş-dönüş ve red, CSV). `npm test` 55/55, `npm run build` başarılı; dört ekran örnek veriyle sunucu
  tarafında çizildi. Gerçek tarayıcı / iPhone Safari'de denenmedi; dosya indirme ve geri yükleme tarayıcıda denenmedi.

### Rakiplere göre hâlâ eksik olanlar (öncelik sırasıyla; web'de doğrulanmadı, genel bilgiye dayanır)
1. Ay kapatma ekranı (devir: taşı / ertele / vazgeç) — çekirdekte `closePeriod` hazır; eski uygulamada vardı.
2. İşlem düzenleme / silme ve işlemlerde arama-süzme.
3. Birikim hedefleri ve acil durum fonu; döviz/altın birikim havuzu ve kur girişi (eski uygulamada vardı).
4. Banka ekstresi CSV içe aktarma (eski uygulamada vardı) ve haftalık yedek hatırlatması.
5. Ödeme hatırlatma bildirimleri, abonelik takibi.
6. Bulut eşitleme + aile paylaşımı (veritabanı kuralları ile, emülatörde).

### 2026-11-08 · Başlık: Kullanılabilir + Bankada / Bloke dökümü, ilk hâl karşılaştırma raporu
- Abdullah'ın isteği: ilk hâldeki başlık rakamı (bloke sonrası kalan) tek bakışta; bankadaki tutar ve bloke
  dokununca açılan yerde. Gerekçe: harcama bankadan yapıldığı için referans bankadır; banka tutarı kayıtların
  doğru girilip girilmediğini söyler.
- Güncel kartı: "Kullanılabilir" + Bankada / Bloke satırı → `src/v3/screens/BakiyeSheet.jsx` (hesap, bankadaki
  tutar hesap hesap, bloke kalemleri, bloke sonrası bankada kalan, bankayla karşılaştır + görünür düzeltme).
- Rapor: `docs/RAPOR-ILK-HAL-V3-KARSILASTIRMA.md` (taşınan / taşınmayan / eksik, öncelik sırası). Rakip bilgisi
  web'de doğrulanmadı. `npm test` 57/57, build başarılı; tarayıcıda denenmedi.
