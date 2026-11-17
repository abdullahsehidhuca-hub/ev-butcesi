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

## 2. Kendi iPhone'unuzda doğrudan görmek (TestFlight beklemeden, 1–2 dakika)

Komut: `npm run ios:cihaz` (`scripts/ios-cihaz.mjs`). Derler, geliştirici imzasıyla (takım Y2CGKFL66N) imzalar, eşleşmiş
iPhone'a yükleyip açar. Telefon ulaşılamıyorsa derlemeye girmeden nedenini yazar.

Durum (16 Kasım 2026): iPhone 17 Pro Max bu Mac'le eşleşmiş, geliştirici cihazı olarak kayıtlı; Geliştirici Modu açık.
Menü ancak telefon Xcode'a kabloyla bağlanıp tanındıktan sonra Ayarlar'da görünür.

1. iPhone: Ayarlar > Gizlilik ve Güvenlik > en altta Geliştirici Modu > aç. Telefon yeniden başlar; açılışta "Aç" deyin.
2. iPhone kilidi açık ve Mac'le **aynı Wi-Fi'de** olmalı (ya da kabloyla bağlı). Tailscale bu bağlantıyı taşımaz; Xcode
   telefonu yerel ağda arar. Dışarıdayken bu yol çalışmaz, TestFlight (3. bölüm) çalışır.
3. İlk çalıştırmada telefon Apple hesabında geliştirici cihazı olarak kaydedilir ve geliştirme profili oluşturulur.

## 3. TestFlight ile iPhone'unuzda görmek (düzenli kullanım için önerilen yol)

**Önemli ayrım:** TestFlight için Apple'a "uygulama başvurusu" yapılmaz. Gereken şey **Apple Developer Program**
üyeliğidir (var; takım Y2CGKFL66N). İç test (Internal Testing) grubu için **App Review (inceleme) yoktur**. İnceleme yalnız
"dış test" (External Testing) ve mağaza yayını için gerekir. Yükleme betiği derlemeleri "yalnız iç test" olarak işaretler;
bu derlemeler App Store'a ya da dış teste gönderilemez.

Hazır olanlar: 1024 px simge (saydamlık yok), şifreleme beyanı (`ITSAppUsesNonExemptEncryption = false`), takım kimliği.

### 3a. Tek seferlik kurulum (siz yaparsınız; telefondan Safari ile yapılabilir)

**Tamamlandı (16 Kasım 2026, İş #71):** paket kimliği `com.evbutcesi.app` kayıtlı; App Store Connect kaydı "Ev Bütçesi - Aile"
("Ev Bütçesi" adı App Store'da alınmış; ana ekranda yine "Ev Bütçesi" görünür), dil Türkçe, SKU `evbutcesi`. iPhone 17 Pro Max
geliştirici cihazı olarak kayıtlı (otomatik imza arşivde en az bir kayıtlı cihaz istiyor). İç test grubu "Aile" (tüm
derlemelere erişim) ve test kullanıcısı abdullahsehidhuca@gmail.com hazır. İlk derleme 261116.1333 iç testte.

1. **Paket kimliği:** developer.apple.com/account/resources/identifiers → + → App IDs → App → Description `Ev Butcesi`,
   Bundle ID Explicit `com.evbutcesi.app` → Continue → Register.
2. **Uygulama kaydı:** appstoreconnect.apple.com → Uygulamalar → + → Yeni Uygulama. Platform iOS, ad "Ev Bütçesi" (alınmışsa
   sonuna ek yapın; sonra değişebilir), dil Türkçe, paket kimliği `com.evbutcesi.app`, SKU `evbutcesi`, Tam erişim.
3. **Telefon:** App Store'dan **TestFlight** uygulaması.

### 3b. Her sürümde (ben yaparım, siz yalnız telefonda güncellersiniz)

1. `npm run ios:testflight` (`scripts/ios-testflight.mjs`): web derlemesi, cap sync, tarih-saatten derleme numarası
   (ör. 261112.1530), App Store arşivi ve yalnız iç test işaretiyle yükleme. Xcode'daki Apple hesabı kullanılır.
2. 5–15 dakika işlenir. İlk sürümde: App Store Connect > TestFlight > İç Test > + grup (örn. "Aile") → üyeler: siz ve
   Kadriye. Otomatik dağıtım açık kalırsa sonraki sürümler kendiliğinden düşer.
3. Telefonda TestFlight > Ev Bütçesi > Yükle; uygulama sayfasında Otomatik Güncellemeler açık. Her derleme 90 gün geçerli.

### 3c. Mac başında kimse yokken imza (bir kez gerekir)

12 Kasım 2026 denemesi: uzaktan imza, Mac ekranında açılan anahtar zinciri izin penceresinde bekliyor. Mac başındayken bu
pencerede (ya da ilk `npm run ios:cihaz` / `ios:testflight` sırasında) Mac parolasını yazıp **Her Zaman İzin Ver** deyin;
sonra imza uzaktan da çalışır. İsteğe bağlı: Sistem Ayarları > Genel > Paylaşma > **Ekran Paylaşımı** açılırsa böyle
pencereler telefondan bir VNC uygulamasıyla Tailscale üzerinden yanıtlanabilir.

Xcode hesabı yerine App Store Connect API anahtarı (rol App Manager; `.p8` dosyası depoda DEĞİL) kullanılacaksa
`ASC_KEY_PATH`, `ASC_KEY_ID`, `ASC_ISSUER_ID` ortam değişkenleriyle aynı komut çalışır.

## 4. Bundan sonraki çalışma düzeni

Her işte sırayla: `npm test` → `npm run build` → `npm run ios:sim` (simülatörde açılır, ekran görüntüsü alınır,
yazılar OCR ile denetlenir) ve `npm run android:emu` → `npm run ios:testflight` ve `npm run android:paket` (Play hesabı
açılınca dahili teste yüklenir); raporda iki platformun derleme numarası. Android ayrıntıları: `docs/ANDROID-PLAN-VE-KURULUM-REHBERI.md`. Kural (kullanıcı, 16 Kasım 2026):
her düzenleme TestFlight'a yüklenir, kontrol oradan yapılır; Functions ya da veritabanı kuralı da değiştiyse önce onlar yüklenir. Web sitesi yayını yok
(Vercel 12 Kasım 2026'da kapatıldı).

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

**Vercel — kapatıldı (12 Kasım 2026, İş #71).** Proje Vercel panelinden silindi; `vercel.json` ve `api/` depodan
kaldırıldı, AI uç noktaları Firebase Functions'ta. Aşağıdaki metin 11 Kasım'taki soruyu kayıt için tutuyor.

**Vercel sorusu (11 Kasım).** Anladığım: artık web sitesi (Vercel adresi) kullanılmayacak; uygulama yalnız iPhone
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
