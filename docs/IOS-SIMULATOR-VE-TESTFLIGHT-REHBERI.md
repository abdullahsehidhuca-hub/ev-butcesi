# iOS'ta görme rehberi: Simülatör, kendi iPhone'unuz ve TestFlight (11 Kasım 2026)

Bu belge, her düzenlemeyi Mac'teki iOS Simülatöründe ya da iPhone'unuzda TestFlight üzerinden nasıl göreceğinizi
adım adım anlatır. Teknik terimler ilk geçtiği yerde açıklanmıştır.

## 0. Bugün ne kuruldu

- **Capacitor** (web uygulamasını gerçek bir iPhone uygulamasına saran kabuk) projeye eklendi. Aynı web kodu hem
  Vercel'de hem iPhone uygulamasında çalışır; iki ayrı uygulama yoktur.
- `ios/` klasöründe gerçek bir **Xcode projesi** oluştu (Xcode: Apple'ın uygulama derleme programı; Mac'inizde kurulu,
  sürüm 26.5). Bağımlılıklar CocoaPods yerine Apple'ın kendi paket yöneticisiyle (Swift Package Manager) geliyor; ek kurulum gerekmez.
- Uygulama kimliği (Bundle ID): `com.evbutcesi.app`. Görünen ad: **Ev Bütçesi**. Mağazaya gitmeden önce kimlik
  değiştirilebilir; TestFlight'a ilk yüklemeden sonra kalıcıdır (bkz. 3. bölüm).
- Tek komutluk döngü: `npm run ios:sim` → web paketini derler, iOS projesine kopyalar, simülatör için derler,
  simülatöre yükler, açar ve ekran görüntüsünü `logs/ios-sim-son.png` dosyasına yazar. Bugün uçtan uca çalıştı:
  iPhone 17 Pro simülatöründe (iOS 26.5) uygulama açıldı; açılış yaklaşık 3 saniye.
- Simülatörün gerçek iOS Safari motorunda dört sekme de (Özet, Ödemeler, Rapor, Ayarlar) örnek veriyle açıldı ve
  ekran yazıları doğrulandı (`scripts/ios-simulator-tur.mjs`). Bu, "Safari / iPhone'da deneme" eksiğinin makine
  tarafını kapatır; elle dokunarak gezme sizde (1. bölüm).

## 1. Simülatörde görmek (Apple hesabı gerekmez)

**Simülatör nedir?** Mac'te açılan sanal bir iPhone penceresi. Gerçek iOS ve gerçek Safari motoru çalışır; dokunma
yerine fareyle tıklanır.

1. Bundan sonra her iş sonunda uygulama simülatöre otomatik yüklenir ve açılır; Mac'inizde **Simulator** penceresi
   belirir. Hiçbir şey yapmanız gerekmez, sadece bakın ve tıklayarak gezin.
2. Kısayollar: fare tıklaması = dokunma; iki parmakla kaydırma = kaydırma; ⌘ + ⇧ + H = ana ekran; ⌘ + K = klavyeyi
   göster/gizle; Device > Erase All Content and Settings = temiz telefon.
3. Kendiniz tekrar açmak isterseniz Terminal'de proje klasöründe:
   ```bash
   npm run ios:sim
   ```
   Farklı model için: `npm run ios:sim -- --device "iPhone 17e"` (küçük ekran) ya da `"iPad Pro 11-inch (M5)"`.
4. Simülatördeki veri simülatörde kalır; gerçek verinize ve buluta dokunmaz (aile hesabına giriş yapmadıkça).
5. Sorun olursa: Simulator penceresini kapatıp komutu yeniden çalıştırın. Xcode lisans uyarısı gelirse Xcode'u bir kez
   açıp kabul edin.

## 2. Kendi iPhone'unuzda görmek (ücretsiz Apple ID yeterli, TestFlight gerekmez)

Apple'a başvurmadan, ücret ödemeden, kendi telefonunuzda çalıştırmanın yolu budur.

1. iPhone'u kabloyla Mac'e bağlayın; telefonda "Bu bilgisayara güven" deyin.
2. Terminal: `npm run ios:open` → Xcode projeyi açar.
3. Xcode > Settings > Accounts > + → normal Apple ID'nizle giriş yapın (ücretsiz).
4. Sol listede **App** > ortadaki **Signing & Capabilities** sekmesi > Team: adınızı seçin. "Automatically manage
   signing" işaretli kalsın. Bundle ID çakışma uyarısı verirse `com.evbutcesi.app` yerine size özel bir kimlik yazın
   (örnek: `tr.sehid.evbutcesi`); aynı kimliği `capacitor.config.json` içinde de güncellememiz gerekir, bana söyleyin.
5. Üstteki cihaz seçicide iPhone'unuzu seçin, ▶︎ (Run) basın. İlk seferde telefonda Ayarlar > Genel > VPN ve Aygıt
   Yönetimi > geliştirici uygulamasına güvenin; bir daha ▶︎ basın.
6. Sınırlar (ücretsiz hesap): uygulama 7 gün sonra açılmaz, Xcode'dan yeniden ▶︎ gerekir; en fazla 3 uygulama.
   Günlük kullanım için yeterli değildir, "telefonda görmek" için yeterlidir.

## 3. TestFlight ile iPhone'unuzda görmek (düzenli kullanım için önerilen yol)

**Önemli ayrım:** TestFlight için Apple'a "uygulama başvurusu" yapılmaz. Gereken şey **Apple Developer Program**
üyeliğidir (yıllık ücretli, bireysel). İç test (Internal Testing) grubu için **App Review (inceleme) yoktur**; yüklediğiniz
sürüm birkaç dakika içinde telefonunuza düşer. İnceleme yalnız "dış test" (External Testing) ve mağaza yayını için gerekir.

### 3a. Tek seferlik kurulum (siz yaparsınız)

1. **Üyelik:** developer.apple.com/programs → Enroll → Individual. Apple ID ile giriş, kimlik doğrulama, ödeme. Onay
   genellikle 1–2 gün. (Şirket olarak değil, birey olarak başvurun; daha hızlıdır.)
2. **Uygulama kaydı:** appstoreconnect.apple.com → My Apps → + → New App. Platform iOS, ad "Ev Bütçesi", dil Türkçe,
   Bundle ID: önce developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → + → App IDs →
   `com.evbutcesi.app` (ya da seçtiğiniz kimlik; **bu adımdan sonra kimlik değişmez**). SKU: `evbutcesi`.
3. **Xcode imzası:** `npm run ios:open` → App > Signing & Capabilities > Team: Developer hesabınız. Xcode gerekli
   sertifikayı kendisi üretir.
4. **Simge:** TestFlight 1024×1024 piksel uygulama simgesi ister. Elinizdeki simge 512 piksel; 1024'lük bir sürüm verirseniz
   (ya da bana "mevcut simgeyi büyüt" derseniz) `ios/App/App/Assets.xcassets/AppIcon.appiconset` içine koyarım.
5. **Telefon:** App Store'dan **TestFlight** uygulamasını indirin.

### 3b. Her sürümde (ben yaparım, siz yalnız telefonda güncellersiniz)

1. Sürüm numarası artırılır (`ios/App/App.xcodeproj` içinde `CURRENT_PROJECT_VERSION`).
2. Xcode'da Product > Archive (ya da komutla `xcodebuild archive`), ardından Distribute App > TestFlight & App Store →
   Upload. Komut satırından yapabilmem için App Store Connect API anahtarı gerekir (3c).
3. 5–30 dakika işlenir. App Store Connect > TestFlight > Internal Testing > grup (örn. "Aile") → üyeler: siz ve Kadriye.
   İlk seferde gruba eklemek gerekir; sonraki sürümler kendiliğinden düşer, TestFlight bildirim gönderir.
4. Telefonda TestFlight > Ev Bütçesi > Güncelle.

### 3c. Yüklemeyi bana devretmek için (isteğe bağlı, önerilir)

App Store Connect > Users and Access > Integrations > App Store Connect API > Team Keys > + → ad "DevHub", rol
**App Manager**. İnen `.p8` dosyasını, Key ID'yi ve Issuer ID'yi depoya DEĞİL, Mac'te `~/.appstoreconnect/private_keys/`
klasörüne koyun ve bana "API anahtarı hazır" deyin. Sonra her işte archive + upload komutlarını ben çalıştırırım
(`xcrun altool --upload-app --apiKey … --apiIssuer …`). Anahtar dosyası ekranda ve depoda görünmez.

## 4. Bundan sonraki çalışma düzeni

Her işte sırayla: `npm test` → `npm run build` → `npm run ios:sim` (simülatörde açılır, ekran görüntüsü alınır,
yazılar OCR ile denetlenir) → raporda "simülatörde görüldü" notu. TestFlight kurulunca aynı zincirin sonuna
archive + upload eklenir ve raporda sürüm numarası yazılır. Vercel'e yükleme ayrıca ve yalnız istenince yapılır.

## 5. Yerel kabuğun bilinen sınırları (Faz 3 iş listesi)

1. **Google ile giriş** yerel kabukta çalışmaz (açılır pencere yok). E-posta / şifre girişi çalışır. Çözüm: Capacitor
   Firebase Authentication eklentisi ya da Apple ile Giriş (mağaza için zaten zorunlu).
2. **AI uç noktaları** (`/api/...`) yerel kabukta göreli adresle erişilemez; v3 şu an bunları kullanmıyor. AI özellikleri
   v3'e gelince Vercel adresi ayarla verilir.
3. **Açılış ekranı ve simge** Capacitor'ın varsayılanı; marka simgesi ve açılış rengi eklenecek.
4. **Bildirimler** yerel bildirim eklentisiyle (@capacitor/local-notifications) yapılacak; bu Faz 2'den buraya devredilen maddedir.
5. **Widget** (ana ekranda "Serbest" tutarı): WidgetKit ile ayrı bir hedef; çekirdeğin özetini paylaşılan depodan okur.
6. Eski uygulama (`/eski`) yerel kabukta açılmaz; yalnız web'de kalır. Bu bilinçli bir sınırdır.

## 6. Bugün simülatörde görülen

- Temiz kurulumda "Hoş geldiniz · 3 adımda başlayın" ekranı; sonra simülatörde elle eklenen "Bütçe · 450.000 ₺"
  hesabıyla Özet ve Ayarlar ekranları. (Bu hesap simülatörde elle girildi; kod kendiliğinden hesap oluşturmaz,
  temiz Chrome profilinde doğrulandı.)
- Safari motorunda örnek veriyle: Özet (Serbest, günlük pay, bankada / bloke), Ödemeler (dönem seçici, kalan ödeme,
  süzgeçler), Rapor (Sana özel uyarılar, harcandı), Ayarlar (dönem, hesaplar, birikim). Yatay taşma ekran görüntüsünden
  OCR ile ölçülemez; bunu Chrome ölçümleri kapatıyor, gözle teyidi sizden rica ederim.

## 7. Yedek verisiyle ekranları görmek ve Vercel sorusu (11 Kasım 2026, sonraki tur)

**Yedek verisi.** Verdiğiniz eski uygulama yedeği (ev-butcesi-2026.07.29.json) depoya girmeyen `yedek/` klasöründe
duruyor (kişisel mali veri; git dışında). Üç yolla kullanılıyor:

1. **Simülatördeki uygulama:** `node scripts/yedek-simulator.mjs --kaydir 3` yedeği v3 verisine çevirip simülatördeki
   uygulamanın yerel depolamasına yazar ve uygulamayı açar. "--kaydir 3" tüm tarihleri 3 ay ileri alır ki Temmuz verisi
   bugünkü döneme (15 Ekim – 14 Kasım) düşsün; tutarlar değişmez. Kaydırmasız istersek parametreyi kaldırırız.
2. **Geliştirme sunucusunda:** `/?ornek=yedek` adresi yedeği kaydırmadan, "bugün" olarak yedekteki son işlem gününü
   (25 Temmuz 2026) alarak açar. Tarayıcı turları bununla yapılıyor.
3. **Gerçek kullanım:** Ayarlar > Yedekten geri yükle artık eski uygulamanın yedeğini de tanır; dosyayı seçince kaç hesap,
   düzenli ödeme ve işlem aktarılacağını söyler, onaydan sonra yükler. iPhone'da dosyayı Dosyalar / iCloud'dan seçersiniz.

Dönüşümde ne oluyor: aylık bütçe (410.000 ₺, Temmuz 435.000 ₺) "Maaş" gelir kalemi olarak her ay alınmış yazılır; sabit
giderler, taksitler, kategoriler, kart harcamaları aktarılır; "karta aktarıldı" işaretli harcamalar için harcamaya tarih
yazılır ve bankadan karta aynı tutarda aktarım kaydı oluşur; TL birikim havuzu "Birikim" hesabına aktarım olur.
Aktarılmayanlar: altın cinsinden borç (Dostlar Sandığı), konfor kartı yüklemeleri, hesap açılış bakiyeleri (0 yazılır;
bankadaki gerçek tutarı "bakiye düzeltme" ile girersiniz).

**Vercel sorusu — teyit bekliyor.** Anladığım: artık web sitesi (Vercel adresi) kullanılmayacak; uygulama yalnız iPhone
uygulaması olarak sizde (simülatör, kendi telefonunuz, TestFlight) ve ileride App Store'dan çalışacak. Teknik karşılığı:

- Arayüz kodu (tasarım, ekranlar) zaten uygulama paketinin **içinde** gidiyor; Capacitor onu Apple'ın dağıtımıyla (TestFlight /
  App Store) telefona koyar. Bunun için Vercel gerekmez. ✔ Bugün böyle.
- Veriler Firebase'de (aile hesabı, eşitleme). Bu değişmez. ✔
- Vercel'de kalan tek şey `api/` klasöründeki yapay zekâ uç noktaları (fiş okuma, ekstre analizi, danışman). Bunlar eski
  uygulamanın özellikleri; v3 henüz kullanmıyor. Vercel kapanınca bu üç işlev bir yere taşınmalı; en doğal yer yine
  Firebase (Cloud Functions, ücretli "Blaze" planı gerektirir ama kullanım küçükken aylık maliyet sıfıra yakındır).
- Kadriye'nin de uygulamayı kullanması için TestFlight'a tester olarak eklenmesi yeterli.

Onaylarsanız yapacaklarım: (1) `vercel.json` ve Vercel bağlantısını kaldırmak, README'yi güncellemek; (2) AI uç noktalarını
Firebase Functions'a taşımak (v3'e AI gelince); (3) web adresini kapatmak sizin Vercel panelinizden olur, adımlarını yazarım.
Onay gelene kadar Vercel'e dokunmadım; yalnız yeni yükleme yapmıyorum.
