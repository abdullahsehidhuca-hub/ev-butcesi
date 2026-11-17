# Android sürümü: kurulum durumu ve sizin yapacaklarınız (16 Kasım 2026, İş #77)

Bu belge Ev Bütçesi'nin Android hâlini, Mac'te nasıl göreceğinizi ve Google Play'e geçmek için sizin yapacağınız
adımları anlatır. Teknik terimler ilk geçtiği yerde açıklanmıştır.

## 0. Kısa cevaplar

- **Mac'te Android'i nerede görürüm?** **Android Studio** içindeki **Android Emulator**'da (Mac'te açılan sanal Android
  telefon). Kurdunuz; oluşturduğunuz **Pixel 10 Pro XL** sanal cihazında uygulama açıldı. iOS Simülatörünün karşılığıdır.
- **TestFlight'ın karşılığı:** **Google Play Console › Dahili test**. Seçiminiz bu. Hesap 17 Kasım 2026'da açıldı ve ödendi; 17 Kasım'da doğrulamalar bitti ve uygulama "Ev Bütçesi - Aile" (`com.evbutcesi.app`) taslak olarak oluşturuldu. Sıradaki adım dahili test kanalının kurulumu (3.1. bölüm).
- **Android telefonunuz yok:** Sorun değil. Sanal Pixel'de Google Play Store da var; Play hesabı açılınca dahili test
  sürümünü sanal Pixel'e de Play'den kurabilirsiniz (Google hesabınızla giriş yaparak).

## 1. Bugün yapılanlar

| Ne | Durum |
|---|---|
| Capacitor Android kabuğu (`android/` klasörü, Android Studio projesi) | Eklendi; iOS ile aynı web kodu, aynı kimlik `com.evbutcesi.app` |
| Java 21 (Android derlemesi için şart) | Homebrew ile kuruldu (`/opt/homebrew/opt/openjdk@21`) |
| Simge ve açılış ekranı | Mevcut Ev Bütçesi logosundan üretildi (iOS'takiyle aynı) |
| Android geri tuşu | Açık çekmeceyi kapatır; çekmece yoksa uygulamayı arka plana alır (kapatmaz) |
| `npm run android:emu` | Derler, sanal Pixel'i açar, yükler, açar, ekran görüntüsü alır (`logs/android-emu-son.png`) |
| `npm run android:paket` | Google Play'e yüklenecek imzalı paketi (.aab) üretir; ilk paket 261116.2029 hazır |
| Yükleme anahtarı (imza dosyası) | Oluşturuldu: `~/.ev-butcesi/android-yukleme.jks` ve parolası `~/.ev-butcesi/android-imza.json` |

Emülatörde denenenler: açılış ekranı ve logo, "Giriş yap · Kayıt ol · Davet kodum var" ekranı, durum çubuğu (saat, pil)
koyu yazıyla görünüyor, "Giriş yap" çekmecesi açılıyor, geri tuşu çekmeceyi kapatıyor, ikinci basışta uygulama arka
plana geçiyor. Giriş yapılmış ana ekranlar (Özet, Ödemeler, Rapor, Ayarlar) emülatörde henüz denenmedi.

Geri tuşu notu: bir yazı alanı seçiliyken ilk basış yalnız klavyeyi/odağı kapatır, ikinci basış çekmeceyi kapatır. Bu
Android'in olağan davranışıdır.

## 2. Sanal Pixel'de uygulamayı kendiniz açmak

1. Android Studio'yu açın → **More Actions → Virtual Device Manager** → Pixel 10 Pro XL satırındaki **▶** (oynat).
2. Sanal telefonun uygulama listesinde **Ev Bütçesi**'ne dokunun (fareyle tıklayın).
3. Kısayollar: fare = dokunma; sağdaki dikey araç çubuğunda geri (◁), ana ekran (○), döndürme düğmeleri var.

Her işten sonra güncel sürümü ben `npm run android:emu` ile yüklerim; siz yalnız açıp bakarsınız.

## 3. Google Play Console hesabı (sizin yapacağınız tek seferlik adım)

**Durum (17 Kasım 2026):** hesap açık (kişisel hesap, kimlik 6055803633861513807), kayıt ücreti ödendi, imza dosyaları
yedeklendi. Play Console ana sayfasında "Uygulama oluştur" düğmesi şu dört görev bitene kadar kapalı:

1. **Kimlik bilgilerinizi doğrulayın:** Ana Sayfa › bu kartta **Başla** › nüfus cüzdanı ya da pasaportun fotoğrafını
   yükleyin (üzerinde oynama yapmayın). Onay birkaç gün sürebilir.
2. **Satıcı (tacir) statünüzü beyan edin:** Ana Sayfa › bu kartta **Başla**. Uygulamadan para kazanmıyorsanız
   "tacir değilim" seçilir. İleride satış ya da abonelik olursa tacir olursunuz ve Google adres ile telefonunuzu
   mağaza sayfasında AB kullanıcılarına gösterir; beyan sonradan değiştirilebilir. Karar sizin.
3. **Android mobil cihaza erişim doğrulaması (zorunlu çıktı):** gerçek bir Android telefonda Google Play'den "Google
   Play Console" uygulamasını kurun, abdullahsehidhuca@gmail.com ile oturum açın, "Abdullah Şehid HUCA" geliştirici
   hesabını seçip ekrandaki talimatı izleyin. Bunu yalnız hesap sahibi yapabilir; Mac'teki sanal Pixel kabul edilmez.
   Ödünç telefonda işlem bitince Play Console'dan ve Google hesabından çıkış yapın.
4. **İletişim telefonunu doğrulama:** kimlik onaylandıktan sonra açılır; telefona gelen kodu girersiniz.

**Güncelleme (17 Kasım 2026, sonra):** Android cihaz ve telefon doğrulaması bitti; ana sayfada görev kalmadı ve
"Uygulama oluştur" açıldı. Formda ad "Ev Bütçesi - Aile" ve paket adı `com.evbutcesi.app` (kullanılabilir) hazır.
Varsayılan dil, ücretsiz/ücretli seçimi ve üç beyan kutusu hesap sahibinin onayıyla işaretlenir.

**Güncelleme (17 Kasım 2026, akşam):** Uygulama oluşturuldu: "Ev Bütçesi - Aile", `com.evbutcesi.app`, Play uygulama
kimliği 4974985907478438641, durum **Taslak**. Dahili test kanalı "Etkin değil"; üç kurulum görevinden 0'ı bitti
(test kullanıcılarını seçin, sürüm oluşturun, sürümü önizleyip onaylayın). Yol planı 3.1. bölümde.

### 3.1. Dahili test yol planı (sıradaki adımlar)

**Ertelendi (kullanıcı kararı, 17 Kasım 2026):** Play dahili test kurulumu arayüz düzeltmelerinden sonraya kaldı.
Şimdi ekranlar iOS'ta (TestFlight) baştan gezilir; her düzeltme iOS ve Android'e birlikte işlenir, Android'de
`npm run android:emu` ile emülatörde doğrulanır. Aşağıdaki adımlar arayüz bitince sırayla yapılacak.

Dahili test, uygulama kurulumu (mağaza sayfası, içerik beyanları) bitmeden açılabilir; Google bunu "isteğe bağlı,
hemen" diye sunuyor. Uygulama inceleme bitene kadar indirirken geçici bir adla görünür; bu normaldir.

1. **Test kullanıcıları listesi** (Test edin ve yayınlayın › Dahili test › Test kullanıcıları): "Aile" adlı bir e-posta
   listesi; içinde sizin Google hesabınız ve Kadriye'nin Google (Gmail) adresi. Listeyi ben doldururum, **Kaydet**'e
   sizin onayınızla basarım. Kadriye'nin Google adresi sizden gelecek.
2. **Yeni sürüm oluştur:** Play App Signing'i ("Google tarafından oluşturulan anahtar", varsayılan) kabul etmek, imzalı
   paketi yüklemek, sürüm notunu yazmak. Paket dosyası: `android/app/build/outputs/bundle/release/app-release.aab`.
   DevHub tarayıcısının araçları dosya seçme penceresini dolduramıyor; dosyayı kolay bulmanız için masaüstüne
   kopyalarım, siz sayfadaki yükleme alanına sürükleyip bırakırsınız (tek seferlik).
3. **Önizle ve kullanıma sun:** Play'in uyarılarını okurum, "Dahili teste kullanıma sun" düğmesine sizin onayınızla
   basılır. Dahili test sürümleri incelemesiz, dakikalar içinde açılır.
4. **Telefona/sanal Pixel'e kurulum:** Test kullanıcıları sekmesindeki **katılım bağlantısını** kopyalarım. Bağlantıyı
   test kullanıcısının Google hesabıyla açık bir Android cihazda açıp "Test kullanıcısı ol" › Play Store'dan **Yükle**.
   Sanal Pixel'de önce Play Store'a kendi Google hesabınızla giriş yapmanız gerekir.
5. **Sonraki yüklemelerin otomatikleşmesi (önerilen, isteğe bağlı):** TestFlight'taki `ios:testflight` gibi bir
   `android:yukle` komutu için Google Cloud'da bir hizmet hesabı (Play'e yükleme yetkili özel bir anahtar dosyası)
   açılır ve Play Console'da bu hesaba yalnız sürüm yetkisi verilir. Anahtar `~/.ev-butcesi` altında durur, depoya girmez.
   Bunu açmazsanız her yeni paketi 2. adımdaki gibi elle sürüklersiniz.
6. **Ertelenebilir:** mağaza girişi, gizlilik politikası, veri güvenliği formu ve içerik derecelendirmesi yalnız kapalı
   test ve herkese yayın için gerekir (12 kişi, 14 gün şartı). Aile içi kullanımda şimdilik gerekmez.

Aşağıdaki maddeler hesap açılırken yapılan adımların kaydıdır.

DevHub tarayıcısında **play.google.com/console/signup** sayfası abdullahsehidhuca@gmail.com hesabıyla açık. Bu hesap
sonradan değiştirilemez; Play'deki uygulamanın sahibi olur.

1. **Hesap türü:** sayfada iki seçenek var. Eczane ya da şirket adına yayın düşünmüyorsanız kuruluş seçeneğini değil,
   **kendiniz için (bireysel)** olan seçeneğin **Başla** düğmesine basın. Kuruluş hesabı D-U-N-S numarası ister.
2. **Geliştirici adı:** Play'de uygulamanın altında herkese görünen ad (ör. "Abdullah Şehid Huca" ya da "Ev Bütçesi").
3. **İletişim bilgileri:** e-posta ve telefon doğrulaması (kod gelir).
4. **Kimlik doğrulaması:** Google adınızı ve adresinizi kimlik belgesiyle doğrular; birkaç gün sürebilir.
5. **Kayıt ücreti:** tek seferlik 25 ABD doları (kartla). Ödeme sizin adımınızdır; ben bu sayfada hiçbir düğmeye basmadım.
6. **Android cihaz doğrulaması (bu hesapta istendi, yukarıdaki 3. görev):** Google yeni bireysel hesaplarda, Play Console uygulamasıyla gerçek bir Android
   telefona erişiminizi doğrulamanızı isteyebiliyor. Bu adım çıkarsa bir yakınınızın Android telefonuna Play Console
   uygulamasını kurup kendi hesabınızla bir kez giriş yapmanız yeterli; sonra çıkış yapılabilir. Sanal Pixel bu doğrulama
   için kabul edilmeyebilir.

Dört görev bitip "Uygulama oluştur" düğmesi açılınca bana haber verin. Sonrasını birlikte yaparız:

- Play Console'da uygulama kaydı (ad, Türkçe, ücretsiz, uygulama).
- **Dahili test** kanalı ve test kullanıcıları (siz ve Kadriye'nin Google hesabı).
- İlk paket yükleme. **Play App Signing** açık kalacak: asıl imza anahtarını Google tutar, bizim dosyamız yalnız "yükleme
  anahtarı" olur; kaybolursa Google'dan sıfırlatılabilir.
- Dahili test bağlantısını telefonda ya da sanal Pixel'de açıp Play Store'dan kurmak.

Not: Mağazada herkese yayın için Google, yeni bireysel hesaplardan önce en az 12 kişilik kapalı testin 14 gün sürmesini
ister. **Dahili test** (yalnız aile) bu şarta bağlı değildir.

## 4. Yedeklemeniz gereken dosyalar

Mac'inizde gizli `~/.ev-butcesi` klasöründe iki dosya var: `android-yukleme.jks` (imza dosyası) ve `android-imza.json`
(parolası). İkisi de depoya girmez. Mac değişir ya da silinirse yeni sürüm yüklemek için gerekir; Play App Signing
sayesinde kaybı telafi edilebilir ama zahmetlidir. İkisini birlikte güvenli bir yere (ör. parola yöneticisi ya da
şifreli yedek) kopyalayın. Parolayı kimseye göndermeyin.

## 5. Bundan sonraki çalışma düzeni

Her işte sırayla: `npm test` → `npm run build` → `npm run ios:sim` ve `npm run android:emu` → `npm run ios:testflight` ve
`npm run android:paket` (Play hesabı açılınca paket dahili teste yüklenir). Raporda iki platformun derleme numarası
birlikte yazılır. Kural (kullanıcı, 16 Kasım 2026): her düzenleme iOS ve Android'e birlikte işlenir.

## 6. Bilinen farklar ve açık maddeler

- Android'de tarayıcı motoru Chrome'dur (iOS'ta Safari). Yazı tipi, kaydırma ve tarih seçici gibi küçük farklar giriş
  yapılmış ekranlarda emülatörde denetlenecek.
- İlk açılış emülatörde 10–20 saniye sürebiliyor (sanal cihazın soğuk açılışı); sonraki açılışlar hızlı.
- Google ile giriş, bildirimler ve ana ekran aracı (widget) iOS'ta olduğu gibi Android'de de ayrı işlerdir.
- Fiş okuma (kamera / galeri) Android'de dosya izni ister; ilk denemede kontrol edilecek.

## 7. Teknik ayrıntı (geliştirici için)

- Gradle 8.14 Java 21 ister; bu Mac'te varsayılan Java 8, Android Studio'nun kendi Java'sı 25. Betikler
  `scripts/android-env.mjs` üzerinden `/opt/homebrew/opt/openjdk@21`'i kullanır (`ANDROID_JAVA_HOME` ile değiştirilebilir).
- Derleme numarası iOS'takiyle aynı tarih-saat etiketidir (`versionName`, ör. 261116.2029); Play'in istediği tam sayı
  (`versionCode`) 1 Ocak 2026'dan beri geçen dakikadır.
- İmza bilgileri Gradle'a ortam değişkeniyle gider (`android/app/build.gradle`), komut satırında ve depoda görünmez.
