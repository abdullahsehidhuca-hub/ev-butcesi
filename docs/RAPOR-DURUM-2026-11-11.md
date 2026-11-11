# Ev Bütçesi — Durum raporu (11 Kasım 2026, güncel)

Hazırlayan: iş #61 (iş #52 raporunun güncellenmiş hâli). Kaynak: `src/core`, `src/v3` kodu; `npm test` (127 test) ve
`npm run build`; başsız Chrome'da 360 / 390 / 1280 px genişlikte gerçek tıklama denemeleri (`scripts/tarayici-deneme.mjs`).

İşaretler: ✅ tamam · 🟡 kısmen · ❌ yok

---

## 1. Tek bakışta

| Alan | Durum | Not |
|---|---|---|
| Hesap motoru (`src/core`) | ✅ | Saf fonksiyonlar, 127 test geçiyor |
| Bulut eşitleme ve aile hesabı | ✅ | Kayıt kayıt yazma, çevrimdışı birleştirme, giriş / kayıt / davet; kurallar `database.rules.json` (bu turda değişmedi) |
| v3 arayüzü — günlük akış | ✅ | 4 sekme + 25'ten fazla çekmece; tarayıcıda denendi, konsol hatası yok |
| v3 arayüzü — tanım düzenleme | ✅ | Hesap, kategori, düzenli ödeme düzenleme / silme / arşivleme / sonlandırma |
| **Görsel tasarım onayı** | ✅ | 11 Kasım: onaylı görünüm (`a.png`) ve görsel dil paketi `mockups/v3-tasarim/` altında; kaynak görünümü doğruluyor (bkz. 5) |
| **Birikim, kur, hedefler** | ✅ | 11 Kasım: Birikim çekmecesi (varlıklar, kur girişi, para ayır / al / bozdur), hedefler ve acil durum fonu önerisi |
| **Taksit denemesi** | ✅ | 11 Kasım: Ödemeler → "Taksit dene"; kayıt yapmadan 6 aylık plan karşılaştırması |
| **Rapor dönem seçici ve trend** | ✅ | 11 Kasım: geçmiş aylar (kapalı dönem dondurulmuş özetten), son 6 ay harcama çubukları, hedefler |
| Yayın | 🟡 | Kök adres (/) artık v3'ü açıyor, eski uygulama `/eski`; bu turun derlemesi henüz Vercel'e yüklenmedi (bkz. 6) |
| Safari / iPhone denemesi | ❌ | Yalnız Chrome'da denendi; Safari uzaktan otomasyon izni kapalı |

**Aşama:** Faz 1 (motor) bitti. Faz 2 (sade arayüz) görsel onay dahil bitti; Faz 2'de yalnız bildirimler (PWA'da sınırlı,
Faz 3 ile) ve Safari / iPhone elle turu kaldı. Faz 3 (Capacitor paketleme, widget, mağaza gereklilikleri) başlamadı;
kullanıcı kararıyla bu turda Faz 3'e geçilmedi.

---

## 2. Tamamlananlar (ekran ekran)

Sekmeler onaylı tasarımdaki sırada: **Özet · Ödemeler · Rapor · Ayarlar** (+ yuvarlak ekle düğmesi).

### Özet
- Dönem başlığı (maaş gününden maaş gününe), **Serbest** ana rakamı, günlük pay, plana göre hız rozeti.
- Bankada / Bloke satırı → **Döküm** çekmecesi: nasıl hesaplandı, tahmini devreden, hesap hesap bankadaki tutar,
  bloke kalemleri, bloke sonrası kalan; **Bankayla karşılaştır** ve görünür "bakiye düzeltme".
- **Karta aktarılmamış kart harcamaları**, **Kart blokesi** üç katman (tek satır → kart kart → kartın harcamaları).
- Hesap kartları şeridi → **Birikim ›** (yeni): varlıklar ve hedefler çekmecesi.
- Yaklaşan ödemeler (✓ ile ödendi / alındı), son işlemler, **Tüm işlemler** (dönem ve kategori süzgeci, arama, düzenleme, silme).
- **Eksiye düşüyor** uyarısı ve **Çöz**; **Ay kapatma**; **Devreden kararı** (geri alınabilir); **Birikimden serbest tutara aktar**.
- Yedek hatırlatması, kur eksik uyarısı, kaydedilemedi uyarısı, ilk açılış "3 adımda başlayın".

### Hızlı harcama ekle (+)
- Tutar → kategori → Ekle; açıklamadan kategori önerisi; kişi seçimi (aile hesabında).

### Ödemeler
- Dönem seçici, kalan ödeme özeti, süzgeçler (Tümü / Faturalar / Taksitler / Kartlar), maaştan önce / sonra,
  gelecek 3 ayın taksit yükü, biten taksitler, aktif taksit ve borçlar, ödeme ekle.
- **Taksit dene** (yeni): tutar, taksit sayısı, kart ve ilk taksit dönemi seçilir; aylık taksit, "plana sığıyor /
  şu ay eksiye düşer" kararı, 6 ay için taksitsiz-taksitli "ay sonunda kalan" tablosu; beğenilirse aynı değerlerle
  **Taksit olarak kaydet**.

### Rapor
- **Dönem seçici** (yeni): geçmiş aylara gidilir; kapalı dönem dondurulmuş özetten gelir, ileri dönem yok.
- "Sana özel" içgörüler, dönem harcaması ve önceki dönemle karşılaştırma, kategori payları (halka), kategori satırı →
  işlem listesi.
- **Son 6 ay harcama** (yeni): gerçekleşen serbest harcama çubukları ve önceki ayların ortalaması.
- 6 aylık "ay sonunda kalan" plan çubukları ve aylık döküm; kategori limitleri (bugüne düşen pay çizgisi yalnız bu dönemde).
- **Hedefler** (yeni): ilerleme çubukları; satır hedef düzenlemeyi, "Birikim ›" çekmeceyi açar.

### Birikim çekmecesi (yeni — Özet şeridinden, Rapor'dan ve Ayarlar'dan)
- Harcama hesabı dışındaki hesapların bugünkü TL karşılığı; döviz / altın için elle **kur girişi** (dış servis yok).
- **Para ayır / al**: TL'den birikime aktarım ya da döviz / altın alımı (kur varsa miktar kurdan, yoksa elle girilir;
  bankanın verdiği gerçek miktar yazılabilir). **Bozdur**: tersi. Kayıtlar gelir / gider sayılmaz, serbest tutara dokunmaz.
- **Hedefler**: ad, tür (birikim / acil durum fonu), hedef tutar, isteğe bağlı tarih (ayda gereken tutar), bağlı
  hesaplar; ilerleme hesap bakiyelerinden hesaplanır; düzenleme ve silme.
- **Acil durum fonu önerisi**: 6 aylık zorunlu gider (düzenli ödemeler + kategori limitleri); tek dokunuşla hedef olur.

### Ayarlar
- Maaş günü; hesaplar (kesim / son ödeme günü, asgari oran); **Birikim ve hedefler** grubu (yeni); kategoriler;
  düzenli ödemeler; kart ekstresi hangi bütçeden; görünüm; aile hesabı; yedek / CSV; tüm verileri sil.

### Kart ekstresiyle eşitle
- Metin, CSV / TXT ya da ekran görüntüsü (cihazda OCR); eşleşme listesi; eksikleri ekleme; gelecek ay taksitleri kipi.

---

## 3. Tarayıcı denemesinin sonucu (11 Kasım 2026)

`scripts/tarayici-deneme.mjs` + `scripts/tarayici-adimlar.mjs` ile başsız Chrome'da, örnek veriyle, 360 / 390 / 1280 px:
Birikim (aktarım, döviz hesabı, kur, bozdurma), acil fon → hedef ekleme / düzenleme, Taksit dene (sığıyor / eksiye düşer,
kayda ön dolu geçiş), Rapor dönem seçici (Ekim ↔ Kasım), trend, kategori → işlem listesi; kök adres (`/`) v3 karşılama
ekranı, `/eski` eski giriş ekranı. Sonuç: hiçbir adımda yatay taşma ve konsol hatası yok; tüm metin kontrolleri geçti.

Doğrulanamayan: Safari ve gerçek iPhone (otomasyon izni kapalı; elle bakılmalı).

---

## 4. Eksikler (öncelik sırasıyla)

1. **Bu turun derlemesini Vercel'e yüklemek** ve telefonda kök adresten açmak (ana ekran simgesi `/`'e gider; artık v3).
2. Safari ve iPhone'da elle tur; bulgular tek listede toplanır.
3. Ödeme bildirimleri (PWA'da sınırlı; Faz 3 ile birlikte).
4. `index.html` viewport'ta yakınlaştırma kapalı (`user-scalable=no`); erişilebilirlik için Faz 3 öncesi açılmalı.
5. Fatura geçmişi / anomali, etkinlik kumbarası, fiş okuma, AI danışman (ertelendi).
6. Faz 3: Capacitor paketleme, widget, Apple ile Giriş, gizlilik / KVKK metinleri, hesap silme.
7. Altın yalnız gram (karar: şimdilik böyle kalacak).

---

## 5. Görsel tasarım onayı — kapandı

- 11 Kasım 2026: Abdullah onaylı görünümü (`a.png`) ve görsel dilin kaynak paketini (zip) verdi. Kural: kaynak görünümü
  doğrulamıyorsa düzenlemeye devam edilmez.
- Doğrulama OCR ile yapıldı: görüntüdeki başlık, rakam ve etiketler ("Serbest 18.290 ₺", "Yaklaşan · 4", "Sana özel",
  "Ay sonunda kalan", "Kalan ödeme 30.340 ₺" vb.) kaynak paketinin ekranları ve örnek verisiyle örtüşüyor. Ayrıntı:
  `mockups/v3-tasarim/BENIOKU.md`.
- Depodaki `src/v3/v3.css` kaynağın 134 satırını aynen içeriyor (yalnız dokunma alanları 44 px); görünüm dili değişmedi.
  Hizalanan farklar: sekme adları ve sırası, ana rakam etiketi "Serbest", özet başlığındaki dönem satırı.

---

## 6. Sıradaki adım önerisi

1. Derlemeyi Vercel'e yüklemek; telefonda ana ekran simgesinden (kök adres) yeni arayüzü doğrulamak.
2. Safari / iPhone elle turu; bulguları gidermek.
3. Sonra AI ve analiz özelliklerine, ardından Faz 3'e geçiş.
