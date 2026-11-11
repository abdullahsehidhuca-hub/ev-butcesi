# Yapay zekâ işlevlerini Firebase'e kurma rehberi (12 Kasım 2026, düzeltilmiş)

## Önceki rehberde ne yanlıştı

Bilgisayarınızda denetledim:
- Firebase'de anahtar kayıtlı değil.
- Functions hizmeti projede hiç açılmamış.

Yani adımlar ya başlayamadı ya da anahtar adımında kaldı. Rehberdeki hatalar:

1. **Klasör yolu yoktu.** "Proje klasörüne geçin" yazıyordu, ama klasörün yeri yazılmamıştı. Komutlar başka bir
   klasörde çalıştırılınca `functions` klasörü ve `functions:deploy` komutu bulunamaz.
2. **Sıra eksikti.** Anahtar kaydı (Secret Manager) Blaze planı olmadan çalışmayabilir. Rehber bunu söylemiyor, hata
   çıkınca ne yapılacağını da anlatmıyordu.
3. **Hiçbir adım kendini denetlemiyordu.** Bir komut hata verdiğinde nedenini anlamak size kalıyordu.

Artık her şeyi tek komut yapıyor ve her adımı kendisi denetliyor. Bir adım başarısız olursa ne yapılacağını Türkçe
yazıp duruyor.

## Kurulum

### 1. Blaze planına geçin (bir kez, tarayıcıda)

1. Şu adresi açın: https://console.firebase.google.com/project/ev-butcesi-96167/usage/details
2. "Spark" yazan planın yanındaki yükseltme düğmesine basın.
3. **Blaze**'i seçin ve ödeme hesabı bağlayın.

Plan yalnız bu projeyi kapsar; diğer Firebase projeleriniz Spark'ta kalır. Ödeme hesabı sayfasından bir bütçe uyarısı
(ör. aylık 5 $) kurmanızı öneririm.

### 2. Terminal'de iki komut

Mac'te Terminal uygulamasını açın. Aşağıdaki satırları sırayla kopyalayıp yapıştırın, her birinden sonra Enter'a basın.

```
cd "/Users/abdullahsehid/DEVHUB/DevHub/server/data/repos/abdullahsehidhuca-hub__ev-butcesi"
npm run ai:kurulum -- --kontrol
```

İkinci komut **hiçbir şeyi değiştirmez**, yalnız durumu gösterir. Bugün bilgisayarınızda şu çıktıyı veriyor:

```
✔ Firebase oturumu: abdullahsehidhuca@gmail.com
✔ Proje erişimi: ev-butcesi-96167
✘ Anahtar gizli depoda: ANTHROPIC_API_KEY yok
✘ Canlı uç nokta: yüklü değil (HTTP 404)
```

Sonra kurulumu başlatın:

```
npm run ai:kurulum
```

Komut sırayla şunları yapar:

1. Firebase girişini ve proje erişimini denetler.
2. Gerekli paketleri kurar.
3. **Anahtarı sorar.** Anthropic Console'dan (https://console.anthropic.com → API Keys) kopyaladığınız anahtarı
   yapıştırıp Enter'a basın. Yazdığınız anahtar ekranda görünmez; bu normaldir.
4. Yükler. İlk seferde 3–5 dakika sürer. Google bir hizmeti açmak için onay sorarsa `Y` yazıp Enter'a basın.
   Eski paketlerin kaç gün tutulacağını sorarsa Enter'a basmanız yeterli.
5. Eski kod paketlerini 1 gün sonra silen ayarı kurar.
6. Canlı adresleri denetler: oturumsuz istek reddediliyor mu, iPhone uygulamasına izin var mı.

Son satırda **"Kurulum tamam"** görmelisiniz. Görmezseniz son 20 satırı bana iletin.

Notlar:
- `cd` satırındaki klasör, DevHub'ın bu proje için kullandığı klasördür. Komutlar ancak bu işin dosyalarını içeren
  klasörde çalışır. DevHub işi birleştirdikten sonra da aynı klasörde çalışırlar.
- `npm run ai:kurulum` "Missing script" derse klasörde bu işin dosyaları yok demektir; bana iletin.
- Firebase girişi istenirse `firebase login` yazın ve açılan tarayıcıda abdullahsehidhuca@gmail.com ile giriş yapın.
- Anahtarı yenilemek için: `npm run ai:kurulum -- --anahtar-yenile`

## Model değiştirmek (deneme sonrası)

Model tek satırda seçiliyor: `functions/ai/providers.js` dosyasındaki `AI_MODEL`. Bugünkü değer: `claude-sonnet-4-6`.

Model değişikliği iki adımdır:

1. Bana "modeli X yap" dersiniz; o satırı ben değiştiririm.
2. Siz `npm run ai:kurulum` çalıştırırsınız.
   - Yeni model başka bir sağlayıcıdansa (ör. Gemini), komut o sağlayıcının anahtarını sorar.
   - Aynı sağlayıcıdansa (ör. Claude Haiku 5.5) anahtar sorulmaz, yalnız yüklenir.

Uygulama tarafında değişiklik gerekmez. Telefon aynı adresleri çağırmaya devam eder.

Desteklenen modeller ve fiyatları: `docs/AI-MODEL-VE-MALIYET-RAPORU.md`. Hepsi aynı sağlayıcı katmanından çağrılır;
deneme betiği de üretimle aynı kodu kullanır. DeepSeek ve Mistral PDF ekstre okuyamaz; seçilirlerse ekstre analizi
anlaşılır bir hata verir.

## Ne kuruluyor (özet)

- **Üç uç nokta:** `aiAdvisor` (danışman), `analyzeReceipt` (fiş), `analyzeStatement` (PDF ekstre).
  - Bölge europe-west1.
  - Adres: `https://europe-west1-ev-butcesi-96167.cloudfunctions.net/...`
- **Oturum:** her istekte sunucuda doğrulanır.
- **Anahtar:** Google'ın gizli anahtar deposunda durur; uygulamaya ve depoya girmez.
- **Danışman sınırı:** günde 3 hak, veritabanında sayılır, Türkiye saatiyle gece sıfırlanır.
- **Maliyet koruması:** en fazla 3 sunucu kopyası çalışır. Boşta kopya yoktur, eski kod paketleri 1 gün sonra silinir.
- **Erişim:** yalnız iPhone uygulaması, geliştirme sunucusu ve Vercel kapanana kadar eski web adresi tarayıcıdan
  çağırabilir.
- **Durum:** v3 ekranlarında AI düğmesi henüz yok; ekran aşamasında eklenecek.

## Geliştirici notları

- `npm test`: birim testleri. Önce `cd functions && npm install` gerekir.
  - `tests/ai-providers.test.js`: sağlayıcı katmanı.
  - `tests/functions.test.js`: bölge, gizli anahtar, CORS.
- `npm run test:ai`: emülatörde uçtan uca denetim. Canlıya ve AI sağlayıcısına istek gitmez.
- `npm run ai:kurulum -- --kontrol`: canlı durumu değiştirmeden raporlar.
- Veritabanı kuralı değişmedi. Sayaç `aiUsage/{uid}` yolunda; yalnız sunucu yazar.
