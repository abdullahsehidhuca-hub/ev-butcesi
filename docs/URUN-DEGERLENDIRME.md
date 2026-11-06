# Ürün Değerlendirmesi — Ticari Sürüm İçin (6 Kasım 2026)

Kapsam: `src/core/` hesap motoru, veri modeli, menüler arası senkron, arayüz ve mağaza
hazırlığı. Karar: eski veriler aktarılmayacak (Abdullah, 2026-11-06); uygulama sıfırdan
kullanıcılarla başlar. Değerlendirme kodu okuyarak ve `npm test` (38 test) ile yapıldı;
arayüz henüz yok, cihazda deneme yapılmadı.

## 1. Motor fonksiyonları: ne yapar, doğrulandı mı, sınırı ne?

| Alan | Fonksiyon | Doğrulama | Sınır |
|---|---|---|---|
| Dönem | `periodOf`, `periodRange`, `dateInPeriod` | Maaş günü, 29-31 ve Şubat sınırları test edildi | Saat dilimi yok; tarih "YYYY-MM-DD" yerel gün kabul edilir |
| Para | `toMinor`, `toBase` | Kuruş tam sayı; eksik kur 0 sayılmaz, raporlanır | Kur geçmişi tutulmuyor; açık dönem ve projeksiyon güncel kurla |
| İşlem | gider / gelir / aktarım / iade | Hesap para birimiyle zorunlu eşleşme, doğrulama | Bölünmüş fiş (tek işlem, çok kategori) yok |
| Yükümlülük | sabit, taksit, borç, maaş | Erteleme kuyruğu uzatır, tutar değişikliği ileriye dönük, kısmi ödeme | Faizli kredi (anapara/faiz ayrımı) yok; haftalık/yıllık tekrar yok |
| Dönem özeti | `computePeriod` | Gelir, yükümlülük, harcama, kalan, güvenle harcanabilir | Kategori bütçesi yalnız serbest harcamayı izler, yükümlülükleri değil |
| Ay kapatma | `closePeriod` | Dondurma, devir kararları, kartlı kalemi devretmeme | Kapatmayı geri alma yok |
| Projeksiyon | `projection`, `installmentLoad` | Gelecek aylar, biten taksitler, hesap bazında yük | Plan görünümüdür, gerçekleşeni içermez |
| Kart | `cards` (özet), kart bakiyesi | Önceki dönem harcaması + otomatik taksit − ödeme − iade | Hesap kesim gününe göre ekstre ayrımı yok; asgari ödeme / faiz yok |
| Bakiye | `balanceOf`, `reconcile`, `adjustBalance` | Kuruşu kuruşuna, farkın kaynağı listelenir, görünür düzeltme | Açılış bakiyesi kullanıcıdan alınır; banka bağlantısı yok |
| Hızlı giriş | `quickAdd`, `payObligation`, `favorites` | Varsayılan hesap, kısayol, kapalı döneme kayıt yok | Tekrarlayan serbest harcama şablonu yok |
| Etiketleme | `suggestCategory`, `learnCategory` | Türkçe harf, kelime başı, en uzun eşleşme, öğrenme | Tutar/tarih örüntüsü kullanılmıyor; yalnız metin |
| Düzenleme | `updateTransaction`, `deleteTransaction`, arşiv/sonlandırma | Kapalı dönem koruması, kullanımdaki kaydı silmeme | Geri al (undo) ve değişiklik geçmişi yok |

## 2. Bu turda bulunup düzeltilen hatalar
1. **Kısmi ödeme** kalemi tamamen kapatıyordu; kalan borç görünmüyor, "kalan para" fazla çıkıyordu.
   Artık `partial` ödeme kalanı açık bırakır.
2. **İade** desteklenmiyordu; iade gelir gibi sayılırdı. Artık `refund` türü kategoriden,
   kart borcundan düşer ve hesaba geri girer.
3. **Maaş günü değişince** geçmiş işlemler başka aya kayıyordu. Artık her işlemin dönemi
   girildiği anda damgalanır; değişiklik yalnız yeni kayıtları etkiler.
4. **Kapalı döneme düzenleme/silme** korumasızdı. Artık engelli; açık dönemdeki kayıt da
   kapalı döneme taşınamaz.
5. **Silinen kategori/hesap/yükümlülük** raporlarda sahipsiz kayıt bırakabilirdi. Kullanımdakiler
   silinmez; kategori arşivlenir, yükümlülük sonlandırılır, öğrenilmiş etiketler temizlenir.
6. Yükümlülükte olmayan kategori ve 1-31 dışı son ödeme günü kabul ediliyordu; artık reddedilir.

## 3. Menüler arası veri ve etiket senkronu
İlke: **tek kaynak, türetilmiş görünümler.** Ekranlar veriyi kopyalamaz; her ekran aynı
kayıtlardan hesaplanır. Böylece bir düzenleme ana ekrana, aylık özete, hesap bakiyesine,
kart borcuna, kısayollara ve projeksiyona aynı anda yansır (`tests/integrity.test.js`).

Arayüz yazılırken uyulacak kurallar:
- Ekran bileşenleri hesap yapmaz; yalnız `src/core` fonksiyonlarını çağırır.
- Kategori adı/simgesi işlemde saklanmaz, `categoryId` ile okunur; ad değişince her yerde değişir.
- Arşivlenen kategori seçim listelerinde görünmez, geçmiş raporlarda görünür.
- Etiket önerisi kabul ya da düzeltildiğinde `learnCategory` çağrılır.
- Kapalı dönem ekranlarında düzenleme düğmeleri gösterilmez (motor zaten reddeder).

Eksik: iki cihaz arasında kayıt kayıt senkron (Firebase) henüz yazılmadı; motor buna uygun
(koleksiyonlar `{ id: kayıt }`), ama çakışma kuralı (aynı kaydı iki kişi düzenlerse) belirlenmeli.

## 4. Görsel arayüz önerisi (mockup ile doğrulanacak)
Bilgi mimarisi — 4 sekme + ortada sabit "+" düğmesi:
1. **Bugün:** Bu ay kalan / güvenle harcanabilir, yaklaşan 3 ödeme (tek dokunuş "ödendi"),
   bütçesi aşılan kategoriler. Tek büyük rakam, en fazla 3 kart.
2. **Hareketler:** Tüm işlemler tek listede, aya göre gruplu; arama ve filtre (hesap, kategori).
3. **Plan:** Gelecek 6-12 ay: gelir, yükümlülük, taksit yükü, biten taksitler.
4. **Hesaplar:** Bakiyeler, banka mutabakatı, kartlar.
"+" akışı: tutar klavyesi → sık kullanılan kategoriler → kaydet (hesap ve tarih önceden dolu,
değiştirilebilir). Ay kapatma, ay bitince Bugün ekranında tek kart olarak çıkar.

Tasarım kuralları: yazı ≥15 px (tutarlar ≥17 px), dokunma alanı ≥44 px, yakınlaştırma açık,
karanlık mod, renk yalnız anlam taşıyorsa (kırmızı = aşım), her ekranda yükleniyor / boş /
hata durumu. Eski tasarımdaki cam efekti ve 9-11 px yazılar terk edilmeli.

## 5. Ticari ürün için eksikler (öncelik sırasıyla)
**P0 — mağazaya çıkmadan şart**
- Veritabanı kuralları: aile başına izolasyon, davet kodu deneme sınırı, isim→e-posta
  dizininin girişsiz okunamaması. Şu an depoda kural yok, denetlenemedi.
- Kayıt kayıt senkron + çakışma kuralı + çevrimdışı kuyruk.
- Uygulama içinden hesap ve veri silme (Apple zorunluluğu), Apple ile Giriş.
- Gizlilik politikası, KVKK aydınlatma metni, açık rıza; AI'ya giden verinin açıkça belirtilmesi.
- Yedek/dışa aktarma (CSV/JSON) ve geri yükleme.
- Çökme ve hata raporlama (ör. Sentry), sürüm numarası.

**P1 — ilk sürümde olmalı**
- Hesap kesim gününe göre kart ekstresi, son ödeme günü bildirimi.
- Haftalık/yıllık tekrar (sigorta, vergi), faizli kredi takvimi.
- Bölünmüş fiş, geri al (undo), değişiklik geçmişi (kim neyi değiştirdi — aile kullanımı için).
- Birikim / döviz / altın hesapları ve hedefler.
- Bildirimler: yaklaşan ödeme, bütçe aşımı, ay kapatma.
- Onboarding: hesaplar + açılış bakiyesi + maaş + sabit giderler 3 dakikada.

**P2 — büyüme**
- Widget (iOS WidgetKit / Android) — Capacitor kabuğu gerekir.
- Banka ekstresi içe aktarma (CSV/PDF) + etiketleme.
- Abonelik modeli ve AI kotası; çoklu dil ve para birimi biçimi.

## 6. Önerilen sıradaki iş
1. Ana ekran, "+" akışı ve ay kapatma için HTML mockup (onay sonrası kod).
2. Kayıt kayıt senkron katmanı ve veritabanı kuralları taslağı (emülatörde test).
3. Hesap kesim günlü kart ekstresi.
