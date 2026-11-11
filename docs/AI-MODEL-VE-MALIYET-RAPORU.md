# AI modeli seçimi ve Firebase'i en az maliyetle çalıştırma (12 Kasım 2026)

İki soruya yanıt: (1) Firebase'de harcamayı en aza indirmek için ne yapıldı, ne kaldı; (2) fiş, PDF ekstre ve danışman
işleri için en ucuz ve işini kesin yapan model hangisi.

Kısa sonuç:
- Resmi fiyatlara göre görevlerin üçünü de yapabilenler arasında en ucuz model **Claude Haiku 5.5**. Bugün kullanılan
  Sonnet 4.6'dan yaklaşık **20 kat ucuz**.
- "Kesin işlevsellik" ancak ölçülerek söylenebilir. Bunun için deneme betiği hazır (aşağıda); anahtarlar girilince çalışır.
- DeepSeek'i önermiyorum: veriyi Çin'de saklıyor ve PDF okuyamıyor.

## 1. Fiyatlar (resmi sayfalardan, 12 Kasım 2026'da okundu)

1 milyon token başına $. Token, modelin metni böldüğü küçük parçadır; Türkçe bir kelime ortalama 2–3 token eder.

| Model | Giriş | Çıkış | Görsel (fiş) | PDF (ekstre) | Veri nerede / eğitimde kullanılır mı |
|---|---|---|---|---|---|
| Claude Sonnet 4.6 (bugün) | 3,00 | 15,00 | Var | Var | ABD; API verisi eğitimde kullanılmaz |
| Claude Sonnet 5.5 | 2,00 | 10,00 | Var | Var | Aynı |
| **Claude Haiku 5.5** | **0,10** | **0,50** | Var | Var | Aynı |
| Gemini 3.1 Flash-Lite | 0,25 | 1,50 | Var | Var | Ücretli katmanda kullanılmaz; **ücretsiz katmanda kullanılır** |
| Gemini 3.8 Flash | 0,75 | 3,75 | Var | Var | Aynı. 1 Ocak 2027'den itibaren 1,50 / 7,50 |
| DeepSeek Flash | 0,30 | 1,20 | Var | **Yok** | **Çin'de saklanır** (gizlilik politikası, 10 Şubat 2026) |
| Mistral Small / Medium | ? | ? | Var | Sohbet arayüzünde yok | AB |

Notlar:
- DeepSeek fiyatı yoğun saat fiyatıdır; Türkiye'de akşam ve hafta sonu yarı fiyattır.
- Mistral'ın model başına fiyat tablosu sayfadan okunamadı (tarayıcıda çiziliyor). Sayfada örnek olarak yalnız Mistral
  Large için 0,50 / 1,50 yazıyor; Small ve Medium fiyatlarını doğrulayamadım.
- Claude 4.7 ve sonrası aynı metni yaklaşık %30 daha fazla token sayar. Aşağıdaki tahminlerde bu hesaba katıldı.

## 2. Çağrı başına tahmini maliyet

Varsayımlar (ölçüm değil): fiş 2.000 giriş + 1.000 çıkış token; ekstre 8.000 + 3.000; danışman 20.000 + 6.000.
Deneme betiği gerçek token sayısını ölçüp bu tablonun yerine gerçek rakamı yazar.

| Model | Fiş | Ekstre | Danışman | 100 aile, ayda aile başına 10 fiş + 2 ekstre + 30 danışman |
|---|---|---|---|---|
| Sonnet 4.6 (bugün) | 0,021 $ | 0,069 $ | 0,150 $ | ~485 $ / ay |
| Sonnet 5.5 | 0,018 $ | 0,060 $ | 0,130 $ | ~420 $ / ay |
| **Haiku 5.5** | **0,0009 $** | **0,0030 $** | **0,0065 $** | **~21 $ / ay** |
| Gemini 3.1 Flash-Lite | 0,0020 $ | 0,0065 $ | 0,014 $ | ~45 $ / ay |
| Gemini 3.8 Flash | 0,0053 $ | 0,017 $ | 0,038 $ | ~121 $ / ay (2027'de ~242 $) |
| DeepSeek Flash | 0,0018 $ | yapamaz | 0,013 $ | ~41 $ / ay (ekstre hariç) |

## 3. "Kesin işlevsellik" nasıl ölçülecek

Ucuz model ancak işini doğru yapıyorsa ucuzdur. Bunu tahminle değil, sizin gerçek fiş ve ekstrelerinizle ölçeceğiz.
Deneme betiği (`npm run ai:model-dene`) üretimdeki istem metinlerinin aynısını her modele gönderir ve şu kesin
kuralları denetler:

- **Fiş:** toplam, fişteki toplamla kuruşu kuruşuna aynı; kalemlerin toplamı fiş toplamını tutuyor; kategoriler
  izinli listeden; biçim doğru.
- **Ekstre:** harcama satırı sayısı ve tutarların toplamı, ekstredeki değerlerle kuruşu kuruşuna aynı; tarih ve
  tutar biçimi doğru.
- **Danışman:** istenen beş başlığın hepsi var ve yanıt Türkçe. İçeriğin isabetini makine ölçemez; yanıtlar
  dosyaya yazılır, yan yana okuyup siz değerlendirirsiniz.

Sonuç her model ve görev için "başarılı / deneme" ve **%95 güvenle "en az %X"** olarak verilir (Clopper-Pearson alt
sınırı). Hiç hata çıkmadığında:

- en az %90 sözü için **29** başarılı çağrı,
- en az %95 sözü için **59** başarılı çağrı gerekir.

Örnek: 10 fiş × 3 tekrar = 30 çağrı hatasız geçerse "bu model fiş toplamını en az %90,5 doğrulukla okur" denebilir.

Ölçülemeyen kalan risk: denemedeki fiş ve ekstreler bankalarınızın ve marketlerinizin biçimini temsil eder; başka
bankaların ekstre düzenleri için ayrı deneme gerekir.

### Sizin yapacaklarınız

1. Telefonla 10 fiş fotoğrafı (her biri 4 MB'tan küçük) ve 2–3 kredi kartı ekstresi PDF'i hazırlayın.
2. Her dosya için doğru değeri yazın:
   - fiş için fişin altındaki TOPLAM;
   - ekstre için harcama satırı sayısı ve bunların toplamı.
   
   Dosyaları bana iletin, yerleştirmeyi ben yaparım. Depoya girmeyen `yedek/ai-test/` klasörüne konacaklar.
3. Denenecek sağlayıcılar için API anahtarı açın. Önerim: Anthropic (zaten var) ve Google AI Studio (Gemini).
   Anahtarları bana yazmayın; denemeyi kendi Terminal'inizde çalıştırırsınız ya da birlikte yaparız.
   Gemini'yi gerçek verinizle denerseniz **ücretli katmanı açın**; ücretsiz katmanda gönderilen veri Google'ın ürün
   geliştirmesinde kullanılabilir.
4. Çalıştırma: Terminal'de aşağıdaki satırları sırayla yapıştırın. `read -s` satırları anahtarı ekranda göstermeden
   sorar ve komut geçmişine yazmaz.

   ```
   cd "/Users/abdullahsehid/DEVHUB/DevHub/server/data/repos/abdullahsehidhuca-hub__ev-butcesi"
   read -s "ANTHROPIC_API_KEY?Anthropic anahtarı: "; echo; export ANTHROPIC_API_KEY
   read -s "GEMINI_API_KEY?Gemini anahtarı (yoksa Enter): "; echo; export GEMINI_API_KEY
   npm run ai:model-dene -- --tekrar 3
   ```

   Anahtarı boş bırakılan sağlayıcı atlanır. Sonuç tablosu ekrana ve `yedek/ai-test/sonuc/` klasörüne yazılır.
   Deneme maliyeti, tüm modellerle 10 fiş + 3 ekstre + danışman × 3 tekrar için kabaca 2–4 $ eder. Bunun büyük kısmı
   Sonnet'lerden gelir.

### Önerdiğim karar yolu

- Haiku 5.5 fiş ve ekstrede hatasız geçerse üç işin hepsinde Haiku 5.5. Danışman yanıtı sizi tatmin etmezse yalnız
  danışmanda Sonnet 5.5 kullanırız (karma kullanım; bunun için uç nokta başına model seçimi eklenir, küçük bir
  değişiklik — bugün tek model seçilebiliyor).
- Haiku bir görevde hata yaparsa o görev için Gemini 3.1 Flash-Lite (ücretli katman) ya da Sonnet 5.5 sonuçlarına bakarız.

**Modeli üretime almak tek satır.** Sunucu artık seçilen modele göre doğru istek biçimini gönderiyor (Claude 4.7
ve sonrası için yeni düşünme biçimi dahil). Deneme betiği de aynı kodu kullanıyor. Seçilen model
`functions/ai/providers.js` içindeki `AI_MODEL` satırına yazılır ve `npm run ai:kurulum` çalıştırılır. Ayrıntı:
`docs/AI-FIREBASE-FUNCTIONS-REHBERI.md`.

## 4. Firebase'i en az harcamayla çalıştırmak

**Yapıldı:**
- `npm run functions:deploy` artık yüklemeden sonra eski kod paketlerini 1 gün sonra otomatik silen temizlik ayarını
  da kuruyor (`firebase functions:artifacts:setpolicy`). Böylece paket depolama ücreti sıfırda kalır.
- Functions zaten boştayken kapanıyor (en az kopya 0) ve en fazla 3 kopyayla sınırlı. Boşta bekleme ücreti yok.

**Ölçüm: eşitlemenin indirdiği veri.** Uygulama her soğuk açılışta ailenin tüm v3 verisini indiriyor
(`src/v3/useCloud.js`). Gerçek yedeğinizle ölçtüm:

| | Değer |
|---|---|
| Kapsanan süre | 4 dönem (15 Nisan – 25 Temmuz 2026) |
| İşlem sayısı | 227 (işlem başına ~310 bayt) |
| Bulut verisinin boyutu | 76.848 bayt (~77 KB); sıkıştırılmış 7.556 bayt |
| Verinin %91'i | işlemler |

Veri her ay büyüyor; bir yılda aile başına ~230 KB olur. Firebase'in bu veriyi aktarırken sıkıştırıp sıkıştırmadığını ve
faturanın hangisinden kesildiğini doğrulayamadım. Bu yüzden hesap iki uçlu:

- Aile başına ayda 180 soğuk açılış varsayımıyla (2 kişi × günde 3) bir yıllık veriyle ayda 4–41 MB eder.
- 10 GB ücretsiz indirme kotası, sıkıştırma yoksa **~240**, varsa **~2.400** aileye yeter.

**Önerilen iyileştirme (onayınızı bekliyor):** "değişiklik defteri".

- Her kayıt değiştiğinde aile altında küçük bir "şu kayıt değişti" notu yazılır.
- Telefon, son gördüğü buluttan sonraki notları okur ve yalnız değişen kayıtları indirir.
- Tüm veri yalnız ilk kurulumda ya da uzun süre açılmayan cihazda indirilir.

Beklenen etki: soğuk açılışta tipik indirme birkaç KB'a iner, kota **on binlerce aileye** yeter.

Bu turda yapmadım; üç nedeni var:
1. Uygulamanın en hassas parçasına (aile verisinin eşitlenmesi) dokunuyor. Hata, gerçek verinizde kayıp ya da çift
   kayıt demek.
2. **Veritabanı kuralı değişikliği gerektiriyor** (yeni defter yoluna aile üyelerinin yazma izni).
3. CLAUDE.md gereği bu boyuttaki değişiklik önce planla onaylanmalı.

Onaylarsanız ayrı bir düzeltme işinde testleri ve emülatör denemesiyle yaparım.

Acele etmeye gerek yok: bugün tek aileyle ayda birkaç MB indiriliyor, kota sınırına mağazaya çıkıp yüzlerce aileye
ulaşınca yaklaşılır.
