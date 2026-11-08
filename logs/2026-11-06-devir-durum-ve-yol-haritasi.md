# Devir Notu — İş #20 Sonu: Yapılanlar, Aşama, Yol Haritası (6 Kasım 2026)

Bu dosya yeni işlere referans olarak verilir. Tek yol haritası `ROADMAP.md`'dir; bu not o
ana kadarki durumun özetidir. Ayrıntılı bulgular: `logs/2026-11-06-durum-tespiti-yol-haritasi.md`,
ticari değerlendirme ve eksik listesi: `docs/URUN-DEGERLENDIRME.md`.

Çalışma dalı: `agent/20` (taban: `main`). `main`'e birleştirilmedi; `main`'e push Vercel'de
canlıya çıkar, bu yüzden birleştirme ayrı ve bilinçli bir karar olmalı.

## Neredeyiz?
| Faz | Durum |
|---|---|
| Faz 0 — Eski uygulamada acil koruma | Kısmen. AI uç noktası token doğrulaması ve çevrimdışı/yankı yazma düzeltmesi yapıldı; veritabanı kuralları bekliyor. |
| Faz 1 — Yeni veri modeli ve hesap motoru (`src/core/`) | Büyük ölçüde tamam, 38 otomatik test geçiyor. Kalan: kayıt kayıt senkron, birikim/altın, kart hesap kesim günü. |
| Faz 2 — Yeni arayüz | Başlangıç. İlk taslak hazır (`mockups/v2-taslak.html`); **UI/UX ajanıyla birlikte yeniden planlanacak** (Abdullah, 2026-11-06). |
| Faz 3 — Mağaza ve widget | Başlamadı. |

Yeni hesap motoru henüz hiçbir ekrana bağlı değil. Yayındaki uygulama (`src/App.jsx`) eski
hesabı kullanmaya devam ediyor.

## Alınan kararlar (Abdullah)
- Hedef: App Store ve Google Play'de herkesin kullanabileceği ticari uygulama.
- Veri modeli ve hesap motoru yeniden yazılır; eski uygulama yalnız fikir kaynağıdır.
- **Eski veriler aktarılmayacak**; uygulama yeni kullanıcılarla sıfırdan başlar.
- Öncelik temel işlevlerde: taksit, gelecek ay yükü, bankadaki tutarla birebir eşitlik.
  Fiş okuma ve AI danışman sonraya bırakıldı.
- Veri girişi az dokunuşlu olmalı (hedef: tutar → kategori); ileride widget.
- Arayüz işi ilgili UI/UX ajanının katılımıyla planlanacak.

## Yapılanlar (iş #20)
**Durum tespiti**
- Eski uygulamanın tamamı incelendi: tek dosyada 9.099 satır, test yok, aynı harcama 7 ayrı
  listede, geçmiş aylar bugünkü ayarlardan yeniden hesaplanıyor, tüm veri tek parça yazılıyor.

**Eski uygulamada güvenlik/koruma (Faz 0)**
- `api/`: AI uç noktaları artık Firebase giriş anahtarını sunucuda doğruluyor; dosya türü,
  boyut ve metin uzunluğu sınırı (`tests/api.test.js`). Canlıda gerçek girişle denenmedi.
- `src/App.jsx`: bulut okunamazsa eski yerel veri buluta yazılmıyor; buluttan geleni geri yazma
  (yankı) durduruldu.

**Yeni hesap motoru (`src/core/`, Faz 1)**
- Tek tip kayıt: gider, gelir, aktarım, iade; tutarlar kuruş cinsinden tam sayı.
- Tekrarlayan kalemler (sabit gider, taksit, borç, maaş) kendi takvimini üretir; erteleme
  takvimi uzatır; tutar değişikliği yalnız ileriyi etkiler; kısmi ödeme.
- Maaş gününe göre dönem; maaş günü değişse de eski kayıtlar ay değiştirmez.
- Dönem özeti: gelir, ödemeler, harcamalar, kalan, güvenle harcanabilir, kart borcu.
- Ay kapatma = dondurma; açık kalemlere karar (taşı / ertele / vazgeç).
- Taksitli alışveriş (kuruş farkı ilk taksitte), kalan taksit, gelecek ayların taksit/borç yükü.
- Hesap bakiyesi ve banka kontrolü: uygulama = banka, kuruşu kuruşuna; farkın kaynağı listelenir.
- Karttaki taksitler kart bakiyesine yansır, ay kapatmada çift taşınmaz.
- Türkçe karakterleri doğru işleyen etiketleme ve kullanıcı düzeltmesini öğrenme.
- Kapalı döneme düzenleme/silme engeli; kullanımdaki kayıt silinmez (arşiv/sonlandırma).
- Testler: `npm test` → 38/38 geçiyor; `npm run build` başarılı.

**Belgeler**
- `ROADMAP.md` (tek yol haritası, durum işaretli), `docs/URUN-DEGERLENDIRME.md`,
  `mockups/v2-taslak.html` (ana ekran, + Ekle, ay kapatma, yükleniyor/ilk açılış/bağlantı yok).

## Sıradaki adımlar (önerilen sıra)
1. **Arayüz planlaması (UI/UX ajanıyla):** `mockups/v2-taslak.html` ve
   `docs/URUN-DEGERLENDIRME.md` §3-4 başlangıç noktası. Bilgi mimarisi önerisi: Bugün /
   Hareketler / Plan / Hesaplar + ortada "+". Ekranlar hesap yapmaz, yalnız `src/core` çağırır.
2. **Kayıt kayıt senkron + veritabanı kuralları** (aile başına izolasyon, iki kişi aynı anda);
   emülatörde test, canlı veritabanına deneme verisi yazılmaz.
3. **Kart hesap kesim günü** ve son ödeme günü.
4. **Mağaza zorunlulukları:** hesap silme, Apple ile Giriş, KVKK/gizlilik, yedek/dışa aktarma,
   hata raporlama.
5. Birikim/döviz/altın, bildirimler, kurulum sihirbazı; ardından Capacitor ve widget.

## Açık sorular
- Ticari model: ücretsiz + abonelik mi, tek seferlik ücret mi? (AI ve senkron maliyetini etkiler.)
- Aile dışında tek kişilik kullanım da desteklenecek mi?
- Arayüz: mevcut sıcak krem/yeşil renk dili korunacak mı, yeni marka kimliği mi?

## Dikkat
- `CLAUDE.md` kuralları geçerli: önce planı konuş, görsel işlerde önce taslak.
- Eski uygulamadaki bulguların (tek parça yazma, geçmişi bozan hesap) çoğu yalnız yeni motorda
  çözüldü; eski ekranlara taşınmadı.

## Güncelleme — 2026-11-07 (iş #23, dal `agent/23`)
- Sıradaki adımlardan 1. madde başladı: v3 arayüzü /v3 adresinde. Ayrıntı ve yeni sıra:
  `logs/2026-11-07-v3-arayuz-ilk-surum.md`.
- Düzeltme (Abdullah, 2026-11-07): v3 görsel tasarımı onaylanmadı. Görsel yeniden yapılacak
  (web/trend araştırması, Adobe Firefly); veri bağlantısı korunuyor.
