# Ev Bütçesi — İlk hâl ile v3 karşılaştırma raporu (8 Kasım 2026)

Kapsam:
- **İlk hâl:** yayındaki uygulama. `main` dalı, `/` adresi, `src/App.jsx` (9.113 satır). Yerelde: http://localhost:5181/
- **v3:** `agent/34` dalı, `/v3` adresi, `src/v3/` + `src/core/`. Yerelde: http://localhost:5180/v3?ornek

Yöntem: iki sürümün kodu satır satır okundu. İlk hâlde bileşenler (`Dashboard`, `AnalysisScreen`,
`PlanningScreen`, `Settings`, modallar) ve `calcMonth` hesabı incelendi. v3 ekranları örnek veriyle sunucu
tarafında çizildi.

Rapor beş bakış açısıyla yazıldı: endüstri mühendisi, analist, yazılım şefi, UX/UI ve rakip analizi. Bunlar
ayrı kişiler değil; aynı incelemenin beş başlığıdır.

Doğrulanamayanlar:
- İki sürüm de gerçek tarayıcıda ve iPhone'da yan yana açılıp karşılaştırılmadı.
- Rakip bilgileri genel ürün bilgisine dayanır; bu ortamda web araması yapılamadı ve güncel mağaza sayfaları
  kontrol edilmedi. Son tabloyu karar vermeden önce mağazalardan doğrulayın.

İşaretler: ✅ taşındı · 🟡 kısmen / farklı biçimde · ❌ taşınmadı · ➕ v3'te yeni

---

## 1. Özet: tek bakışta

| | İlk hâl | v3 |
|---|---|---|
| Ana ekran | Yeşil degrade başlık, 4 kutu (Aylık bütçe, Bankadaki tutar, Bloke, Bloke sonrası kalan) + risk halkası, ödeme hatırlatıcı, 7 renkli kısayol kutusu, 4 açılır menü | Tek ana rakam (**Kullanılabilir**), altında Bankada / Bloke satırı → döküm çekmecesi, hesap kartları, Yaklaşan / Son işlemler |
| Kavram sayısı | Yüksek: A/B/C grupları, konfor kartı, KK aktarım bayrakları, ekstre modu, kumbara, tampon | Düşük: gelir, düzenli ödeme, harcama, kategori limiti, hesap |
| Veri | Firebase (aile ortak, bulut) + haftalık zorunlu yedek | Yalnız bu cihaz (localStorage) + elle JSON yedek / CSV |
| Hesap motoru | `App.jsx` içinde, test yok | `src/core`, saf fonksiyonlar, 57 test |
| Ölçek | ~40 ekran / modal | 4 sekme + 10 çekmece |

**Sonuç:** v3 günlük akışta (bu ay ne kadar harcayabilirim, ne ödeyeceğim, kayıtlar bankayla tutuyor mu)
ilk hâlden daha sade ve daha güvenilir. Ancak ilk hâldeki şu işlevler v3'te henüz yok:
- birikim / varlık (döviz, altın) ve hedefler,
- planlı etkinlik kumbarası,
- ay kapatma ritüeli,
- aile paylaşımı ve bulut,
- fiş okuma ve AI danışman,
- banka ekstresi CSV analizi,
- çok aylı trend analizi.

**v3 bugünkü hâliyle ilk hâlin yerine geçemez.** Ana dala alınmadan önce en az bölüm 6'daki P0 ve P1
maddeleri bitmelidir.

---

## 2. Başlık (en önemli istek) — bu turda yapılan

İlk hâldeki başlık kutuları ve `calcMonth` karşılıkları:
- **Aylık bütçe** = gelir girişi (yoksa ayarlardaki bütçe).
- **Bankadaki tutar (Y)** = aylık bütçe − bankadan gerçekten çıkanlar (A grubu: ödenen sabitler, aktarılan KK,
  konfor kartı, ödenen fatura / borç).
- **Bloke edilen tutar (B)** = kesin çıkacak ama çıkmamış ödemeler.
- **Bloke sonrası kalan bütçe (X)** = Y − B.
- Tahmini giderler (C grubu: değişken gider tahmini, konfor kartı kalanı, beklenmeyen gider fonu, etkinlik
  kumbarası) yalnız bilgi olarak gösteriliyor, rakamdan düşülmüyordu.

| İlk hâl | v3 (bu tur) | Not |
|---|---|---|
| Bloke sonrası kalan bütçe (başlıkta) | ✅ **Kullanılabilir**, ana rakam | v3 kategori limitlerinin harcanmamış kısmını da düşer. İlk hâlde bu yalnız bilgi notuydu; v3 daha temkinli. |
| Aylık bütçe kutusu | ✅ Döküm çekmecesinde "Aylık bütçe (gelir)" | Alınan / beklenen ayrımıyla |
| Bankadaki tutar kutusu | ✅ Başlıkta "Bankada" + çekmecede hesap hesap | **Daha doğru:** ilk hâlde gelirden çıkanlar düşülerek bulunan teorik bir rakamdı. v3'te her banka / nakit hesabın açılış bakiyesi + tüm hareketleriyle hesaplanır. |
| Bloke edilen tutar kutusu ve dökümü | ✅ Başlıkta "Bloke" + çekmecede kalem kalem (Kira, kart ekstresi, Doğalgaz…) | Karttan otomatik çekilen taksitler blokeye girmez (bankadan çıkmaz) |
| "Bankadaki Reel Tutar / Bloke sonrası kalan" satırı | ✅ "Bloke sonrası bankada kalan" | |
| — | ➕ **Bankayla karşılaştır** | Hesap seçilir, banka uygulamasındaki bakiye yazılır. Tutarsa tarih kaydedilir. Tutmazsa fark, yönü (eksik gelir mi, eksik harcama mı) ve son tutan karşılaştırmadan beri girilen hareket sayısı gösterilir. Fark istenirse görünür "Bakiye düzeltme" kaydıyla kapatılır (Analiz'de ayrı görünür; gizli sıfırlama yok). |
| Risk skoru halkası (başlık sağı) | ❌ | Bölüm 6, P2 |
| Tahmini giderler bilgi notu | 🟡 | v3 değişken gider tahmini yerine kategori limitlerini kullanır; beklenmeyen gider fonu ve kumbara yok |

Örnek veride:
- Kullanılabilir 9.800 ₺ = gelir 60.000 − düzenli ödemeler 29.250 − harcanan 12.460 − bütçelere ayrılan 8.490.
- Bankada 51.045 ₺, bloke 30.340 ₺, bloke sonrası bankada 20.705 ₺.

İki rakamın farklı olması beklenir. Kullanılabilir bu dönemin gelirine göre hesaplanır. Bankadaki tutar ise
önceki aylardan kalan parayı ve birikim hesabını da içerir.

---

## 3. Ekran ekran: ne taşındı, ne taşınmadı

### 3.1 Güncel (ilk hâl: Dashboard)
| İlk hâl | Durum | v3'te nerede / not |
|---|---|---|
| Ödeme hatırlatıcı (yaklaşan ödemeler, toplam, gün sayısı) | ✅ | Yaklaşan listesi: tarih rozeti, "9 gün sonra", ✓ ile öde. Beklenen maaş da listede ("Alındı mı?"). |
| KK harcaması 2+ gündür karta aktarılmadı uyarısı | ❌ (bilinçli) | v3'te kart harcaması karta yazılır, ödeme ekstre olarak gelir; harcama başına aktarım bayrağı yok. Aşırı mühendislik olarak çıkarıldı. |
| Kredi kartı ile ödeme kutusu (tek çekim + taksit) | ✅ | + düğmesi → hesap seçimi kart; taksitli alışveriş Ayarlar'da |
| Hesaptan ödeme kutusu | ✅ | + düğmesi (hesap kategoride son kullanılandan gelir) |
| Hesap kartı / konfor harcaması kartı (limit, yükleme) | ❌ | Yerine kategori limiti kullanılabilir; ayrı kart kavramı yok |
| Borç ödemeleri kutusu | 🟡 | Borç yükümlülük türü çekirdekte var; Planlama'da "Aktif taksitler ve borçlar". Döviz / altın cinsinden borç yok (kur girişi yok). |
| Fatura ödemeleri (fatura girişi, son ödeme tarihi, ödendi) | 🟡 | Sabit ödeme + ödeme çekmecesinde gerçek tutar yazılabiliyor. Fatura geçmişi, ortalama ve anomali uyarısı yok. |
| Harcama fişi (fotoğraf → kalemler) | ❌ | AI fiş okuma ertelendi |
| Taksit simülasyonu ("bu taksiti alırsam ne olur") | ❌ | Bölüm 6, P1. Çekirdekte `projection` ve `installmentLoad` hazır. |
| Sabit gider onayları menüsü (x/y ödendi) | ✅ | Planlama: "2 ödendi · 1 otomatik", süzgeçler |
| Önceki aydan taşınan kalemler | 🟡 | Çekirdekte `closePeriod` taşıma kararı var; ay kapatma ekranı yok |
| Kredi kartı aktarımları menüsü (kart bazlı toplam) | 🟡 | Kart başına tek "ekstre" kalemi; kalem kalem aktarım listesi yok |
| Değişken gider takibi (zarf) | ✅ | Analiz: kategori limitleri, kaldı / aşıldı, bugüne düşen pay çizgisi |
| Aylık işlem geçmişi (düzenle / sil) | 🟡 | Son 8 işlem, tüm türler. **Tam liste, arama, düzenleme ve silme yok** (P0). |
| — | ➕ | Eksiye düşme tahmini + "Çöz" (nakitten aktar / kartı ertele / asgari öde), plana göre hız rozeti, günlük harcanabilir |

### 3.2 Analiz (ilk hâl: AnalysisScreen, ~1.900 satır)
| İlk hâl | Durum | Not |
|---|---|---|
| Ay seçici (geçmiş ayları inceleme) | ❌ | v3 Analiz yalnız bu dönem (Planlama'da dönem seçici var) |
| Harcama trendi (çok aylı) | ❌ | Yalnız önceki dönemle karşılaştırma var |
| Bütçe ve harcama + birikim grafiği | ❌ | |
| Aylık değişim | ✅ | Toplamda ve her kategoride önceki döneme göre % ve tutar |
| Kategori karşılaştırma / kategorik analiz | ✅ | Tüm kategoriler tutar + %, halka grafik |
| İçgörüler | 🟡 | Limit aşım tahmini, açık verecek ay, biten taksit. İlk hâldeki uyarı çeşitliliği (`genWarnings`) daha fazlaydı. |
| AI finans danışmanı | ❌ | Dış servis ve gizlilik kararı gerekir |
| Durum özeti | 🟡 | Güncel ekranındaki özet karta dağıldı |
| Banka ekstresi CSV içe aktarma ve analiz | ❌ | `papaparse` paketi hâlâ yüklü (P1) |
| Fatura analizi (geçmiş, ortalama, anomali) | ❌ | |
| — | ➕ | 6 ay "ay sonunda kalan" çubukları + aylık döküm |

### 3.3 Planlama (ilk hâl: PlanningScreen)
| İlk hâl | Durum | Not |
|---|---|---|
| 12 ay haritası (ay ay gelir / gider) | 🟡 | 6 ay; Analiz → Aylık döküm |
| Artış tahminleri (kira / fatura artış tarihi) | ❌ | |
| Borçlar + borç bitiş planlayıcısı | 🟡 | Kalan taksit sayısı, 3 aylık taksit yükü, biten taksitler. Erken kapatma senaryosu yok. |
| Birikim → Varlıklarım (TL, USD, EUR, altın; al / sat) | ❌ | README'de vaat edilen özellik (P1) |
| Birikim → Hedeflerim (hedefe aktarım, tamamlananlar) | ❌ | P1 |
| Planlı etkinlikler + kumbara + taksit hakkı | ❌ | P2 |
| — | ➕ | Dönem seçici, maaştan önce / sonra ayrımı, süzgeç (fatura / taksit / kart) |

### 3.4 Ayarlar ve sistem
| İlk hâl | Durum | Not |
|---|---|---|
| Giriş, e-posta doğrulama, aile oluşturma / davet, üye yetkisi | ❌ | v3 hesapsız, tek cihaz. **En büyük açık** (P0). |
| Bulut (Firebase), aile ortak veri | ❌ | P0, veritabanı kuralları emülatörde denenerek |
| Haftalık zorunlu yedek ritüeli, bulut yedek listesi | 🟡 | v3: elle JSON yedek indir / geri yükle + CSV. Hatırlatma yok (P1). |
| Ay kapatma ritüeli (devir kararları) | ❌ | Çekirdek hazır (`closePeriod`: taşı / ertele / vazgeç), ekran yok (P0) |
| Kartlar, ekstre modu | 🟡 | Kredi kartı hesabı + kesim günü alanı; ekstre / anlık mod seçimi yok |
| Kurlar (USD / EUR / altın) | ❌ | Dövizli kalemde "kur eksik" uyarısı çıkıyor (P1) |
| Beklenmeyen gider fonu, acil durum fonu hedefi | ❌ | P1 |
| Konfor kartı limiti | ❌ (bilinçli) | Kategori limitiyle karşılanır |
| Sabit / değişken gider ayarları | ✅ | Düzenli ödemeler, kategoriler ve limitler |
| Fatura bütçeleri | ❌ | |
| Takvime aktar (ICS) | ❌ | Rakiplerde nadir; P2 |
| İlk açılış sihirbazı + tanıtım | 🟡 | 3 adımlı karşılama |
| — | ➕ | Maaş gününe göre dönem, çok hesap bakiyesi, bankayla karşılaştırma, kısmi ödeme, açıklamadan kategori öğrenme, koyu tema, CSV dışa aktarma |

---

## 4. Uzman başlıklarına göre bulgular

### Endüstri mühendisi (süreç ve dokunuş sayısı)
- **Harcama girişi:**
  - İlk hâl: kutu seç (KK / hesap) → modal → tutar, kategori, kart / hesap → kaydet. 4-6 dokunuş, 2 karar noktası
    (kart mı hesap mı).
  - v3: + → tutar → kategori → kaydet. 4 dokunuş; hesap kendiliğinden gelir.
- **Kart ödemesi:** ilk hâlde her harcama ayrıca "aktarıldı" işaretleniyordu, yani kayıt başına ek iş ve
  unutulma riski vardı. v3'te ayda bir ekstre ödemesi var. Bu, en büyük süreç kazancı.
- **Ay sonu:** ilk hâlde ritüel vardı; v3'te yok. Ay sonu süreci tanımsız kaldı, bu bir süreç açığıdır.
- **Doğrulama döngüsü:** bankayla karşılaştırma artık tek ekranda. Önerilen ritim: haftada bir, yedekle
  birlikte.

### Analist (veri bütünlüğü)
- İlk hâlde "Bankadaki tutar" gerçek bakiye değil, gelirden çıkanlar düşülerek bulunan bir tahmindi. Önceki
  aydan devreden para ve birikim hesabı bu rakama girmiyordu. v3 hesap bazlı gerçek bakiye tutuyor, bu yüzden
  bankayla karşılaştırma anlamlı hâle geldi.
- v3 kullanılabilir rakamı ilk hâlden daha temkinli: kategori limitlerinin harcanmamış kısmını düşer.
  Kullanıcıya "fazla harcayabilirim" yanılgısı vermez.
- Kaybolan veri türleri:
  - varlıklar (döviz / altın),
  - hedefler ve kumbara,
  - fiş kalemleri,
  - fatura geçmişi,
  - artış tarihleri.
- Bunlar v3 veri modelinde **alan olarak da yok**. Eski veri aktarımı iptal edildiği için ilk hâldeki bu
  veriler v3'e gelmez.

### Yazılım şefi (mimari ve risk)
- **İlk hâl:** tek dosya, 9.113 satır, hesap ile arayüz iç içe, test yok. Babel dosyayı "500 KB üstü" diye
  uyarıyor. Firebase'e belge bütün olarak yazılıyor; çakışma riski var.
- **v3:** `src/core` saf ve test edilmiş (57 test). Arayüz ince. v3 paketi 92 KB, sıkıştırılmış 29 KB (ilk hâlin ana paketi
  942 KB, sıkıştırılmış 238 KB).
- **Riskler:**
  1. v3 yalnız cihazda saklıyor; tarayıcı verisi silinirse veri gider. Elle yedek var, hatırlatma yok.
  2. Aile kullanımı v3'te mümkün değil.
  3. Kur desteği yok.
  4. Ana dala alınırsa `/` hâlâ ilk hâli açar; geçiş planı ayrıca yazılmalı.

### UX/UI
- **İlk hâlde aşırı mühendislik:**
  - 4 başlık kutusu + 7 renkli kutu + 4 açılır menü + ödeme hatırlatıcı: ilk ekranda 16 bilgi odağı;
  - 8-11 px yazılar; bilgi ikonları; emoji ikonlar;
  - iç içe modallar; ayrıca A/B/C grubu, konfor kartı, ekstre modu gibi kullanıcının öğrenmesi gereken
    kavramlar.
- **v3:**
  - ilk ekranda 1 ana rakam + 2 yardımcı rakam;
  - ayrıntı dokununca açılıyor;
  - en küçük yazı 13 px, dokunma alanı ≥ 44 px, görünür odak, koyu tema;
  - kontrast ölçülerek düzeltildi.
- **v3 açıkları:**
  - işlem düzenleme / silme yok (yanlış girişi düzeltmenin yolu yok); en sık şikâyet konusu olur;
  - görsel kimlik hâlâ iOS sistem görünümüne yakın; Abdullah'ın "özgün tasarım" isteği karşılanmış değil;
  - gerçek cihazda denenmedi.

### Rakip analizi (genel bilgi; web'de doğrulanmadı)

| İşlev | YNAB | Monarch | Copilot | Spendee / Wallet | TR banka uygulamaları | İlk hâl | v3 |
|---|---|---|---|---|---|---|---|
| Bütçe / kategori limiti | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ |
| "Ne kadar harcayabilirim" tek rakam | ✅ | 🟡 | ✅ | 🟡 | ❌ | ✅ | ✅ |
| Yaklaşan ödemeler / abonelik takibi | 🟡 | ✅ | ✅ | 🟡 | 🟡 | ✅ | ✅ (abonelik tespiti yok) |
| Bankayla mutabakat | ✅ | 🟡 | 🟡 | 🟡 | — | ❌ | ✅ |
| Otomatik banka bağlantısı | ✅ (TR yok) | ✅ (TR yok) | ✅ (TR yok) | 🟡 | ✅ (yalnız kendi bankası) | ❌ | ❌ |
| CSV / ekstre içe aktarma | ✅ | ✅ | 🟡 | ✅ | — | ✅ | ❌ |
| Hedefler / birikim | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Çok para birimi / altın | 🟡 | 🟡 | ❌ | ✅ | ✅ | ✅ | ❌ |
| Aile / ortak kullanım | ✅ | ✅ | 🟡 | ✅ | ❌ | ✅ | ❌ |
| Trend raporları (çok ay) | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 |
| Bildirim / hatırlatma | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ❌ |
| Taksit yükü takibi (TR'ye özgü) | ❌ | ❌ | ❌ | ❌ | 🟡 | ✅ | ✅ |
| Maaş gününe göre ay | 🟡 | 🟡 | ✅ | 🟡 | ❌ | 🟡 | ✅ |
| Eksiye düşme tahmini + çözüm | ❌ | 🟡 | 🟡 | ❌ | ❌ | ❌ | ✅ |

Rekabet avantajı olabilecek, rakiplerde zayıf olan alanlar:
- taksit yükü,
- maaş gününe göre dönem,
- eksiye düşme tahmini + çözüm,
- bankayla karşılaştırma,
- TL / altın.

Bu alanlarda v3 şu an üç tanesinde önde (taksit, maaş günü, eksi tahmini). Altında ise geride.

Geride kalınan temel alanlar:
- aile paylaşımı,
- hedefler,
- CSV içe aktarma,
- bildirim,
- işlem düzenleme.

---

## 5. Bilinçli olarak taşınmayanlar (aşırı mühendislik)
- **Harcama başına "karta aktarıldı" bayrağı:** yerine ayda bir ekstre ödemesi geldi.
- **Konfor harcaması kartı ve banka kartı ayrı limitleri:** yerine kategori limiti kullanılıyor.
- **A/B/C grupları:** kullanıcıya gösterilmiyor. Yalnız sonuç (kullanılabilir, bankada, bloke) ve dökümü var.
- **Ekstre / anlık mod seçimi:** v3 tek model kullanır (kart harcaması sonraki dönem ekstreye).

---

## 6. Eksikler ve öneri sırası

**P0 — ana dala almadan önce şart**
1. İşlem listesi: tüm işlemler, dönem süzgeci, arama, **düzenleme ve silme**.
2. Ay kapatma ekranı: devreden kalemler için taşı / ertele / vazgeç kararı. Çekirdekte hazır.
3. Bulut eşitleme + aile paylaşımı: Firebase, kayıt kayıt yazma. Veritabanı kuralları yazılmalı ve
   emülatörde denenmeli.
4. Yedek hatırlatması: bulut gelene kadar haftalık.

**P1 — rakiplerle eşitlik**

5. Birikim / varlıklar (TL, USD, EUR, altın) + kur girişi; dövizli borç.
6. Hedefler ve acil durum fonu.
7. Banka ekstresi CSV içe aktarma; çift kayıt kontrolü ve kategori önerisi ile.
8. Taksit simülasyonu ("bu alışverişi 6 taksitle alırsam 6 ay nasıl görünür").
9. Çok aylı trend ve geçmiş ay seçici (Analiz).
10. Ödeme hatırlatma bildirimleri (PWA bildirimi, iOS 16.4+ ana ekran uygulamasında).

**P2 — fark yaratacak**

11. Risk skoru (ilk hâldeki halka); sade bir "bu ay durum" göstergesi olarak.
12. Fatura geçmişi ve anomali uyarısı; abonelik tespiti.
13. Planlı etkinlik kumbarası.
14. Fiş okuma ve AI danışman. Dış servise veri gider; gizlilik kararı gerekir.
15. Özgün görsel kimlik: Abdullah'ın onayı bekleniyor.

---

## 7. Bu turda kodda değişenler
- **Güncel başlık kartı:** ana rakam "Kullanılabilir". Altında "Bankada" ve "Bloke" var; satıra dokununca
  döküm çekmecesi açılır. Önceki "Nasıl hesaplandı?" açılır alanı bu çekmeceye taşındı.
- **Yeni `src/v3/screens/BakiyeSheet.jsx`:**
  - kullanılabilir hesabı,
  - hesap hesap bankadaki tutar ve son karşılaştırma durumu,
  - kalem kalem bloke,
  - bloke sonrası bankada kalan,
  - bankayla karşılaştırma (çekirdekteki `reconcile`, `recordReconciliation`, `adjustBalance`).
- **`src/v3/selectors.js`:** `balanceView` eklendi.
- **Testler:** 2 test eklendi; toplam 57/57 geçiyor. `npm run build` başarılı.

---

## 8. Devam turu (8 Kasım 2026, agent/35)

Bölüm 6'daki P0 maddelerinden üçü kapandı:

| P0 | Durum | v3'te nerede |
|---|---|---|
| 1. İşlem listesi, arama, düzenleme, silme | ✅ | Güncel → Son işlemler → satıra dokun (düzenle / sil) ya da "Tüm işlemler" (dönem süzgeci, arama, net toplam). Kapalı dönemin kaydı yalnız görüntülenir. `src/v3/screens/IslemlerSheet.jsx` |
| 2. Ay kapatma ekranı | ✅ | Geçmiş dönem kapatılmadıysa Güncel'de bant çıkar. Çekmecede dönem özeti ve her açık ödeme için "taşı / ertele (taksit, borç) / yok say" kararı ile "Ödendi" kısayolu. Dönemler sırayla kapanır. `src/v3/screens/KapatSheet.jsx` |
| 3. Bulut eşitleme + aile paylaşımı | 🟡 | Kod yazıldı, canlıda denenmedi (bölüm 9) |
| 4. Yedek hatırlatması | ✅ | İşlem varken son yedek 7 günü geçtiyse Güncel'de engellemeyen bant: "Şimdi yedek indir" / "Yarın hatırlat". Yedek indirilince tarih kaydedilir. |

Ayrıca düzeltilen hata: "Ay döngüsü" değiştirilince eski işlemler dönem değiştirebiliyordu (ipucu "girilmiş kayıtlar dönemini korur" diyordu ama korumuyordu). Artık çekirdekteki `setPayDay` kullanılıyor; test eklendi.

Doğrulama: `npm test` 60/60, `npm run build` başarılı; Güncel, Tüm işlemler, Düzenle ve Ay kapatma örnek veriyle sunucu tarafında çizildi. Gerçek tarayıcıda ve iPhone'da denenmedi.

### Kalan iş sırası (önerilen)
1. **Bulut + aile paylaşımı (P0-3).** Firebase'e kayıt kayıt yazma, aile üyesi daveti, Firestore güvenlik kuralları ve emülatör testleri. Bu bir veritabanı kuralı değişikliğidir ve canlı veriye dokunur; başlamadan önce Abdullah'ın onayı gerekir: aynı Firebase projesi mi, ayrı koleksiyon mu, eski veri aktarılmayacak kararı sürüyor mu.
2. P1: birikim/varlıklar + kur girişi, hedefler ve acil durum fonu.
3. P1: banka ekstresi CSV içe aktarma (papaparse yüklü), çift kayıt kontrolü.
4. P1: taksit simülasyonu, çok aylı trend + geçmiş ay seçici (Analiz), ödeme bildirimleri.
5. P2: risk skoru, fatura geçmişi/anomali, etkinlik kumbarası, fiş okuma.

---

## 9. Bulut eşitleme ve aile paylaşımı (8 Kasım 2026, agent/35 düzeltme)

Abdullah'ın kararları (8 Kasım 2026):
- Aynı Firebase projesi kullanılacak.
- v3, ilk hâlle karşılaştırılabilsin diye ayrı tutulacak; son hâl verilince tek koleksiyon olacak.
- Eski veri aktarılmayacak. v3 ekranlarını denemek için ilk hâlin verisi kullanılabilir.

Nasıl çalışıyor:
- **Yer:** `families/{familyId}/v3`. Eski uygulamanın `families/{familyId}/data` yoluna v3 hiç dokunmaz; eski uygulama da v3 yolunu okumaz.
- **Giriş ve aile:** eski uygulamayla aynı oturum ve aile kaydı (`userFamilies/{uid}`, `families/{familyId}/members`). Giriş eski sürümden bir kez yapılır; /v3 aynı oturumu kullanır. v3'te ayrı giriş ekranı henüz yok.
- **Kayıt kayıt yazma:** yalnız değişen hesap, işlem, kategori, düzenli ödeme ya da kapalı dönem yazılır. İki kişi aynı anda farklı kayıtları değiştirirse ikisi de korunur.
- **Çevrimdışı:** değişiklik bu cihazda saklanır. Bağlantı gelince buluttaki güncel verinin üzerine uygulanır; bu arada eşin sildiği kayıt geri gelmez (testle doğrulandı).
- **İlk bağlantı:** bulutta v3 verisi varsa o geçerlidir. Bu cihazdaki v3 verisi karışmaz, yerel bir kopya olarak saklanır. Bulut boşsa Güncel'de "Aile hesabına yükle" uyarısı çıkar; yükleme onay ister.
- **Kimin girdiği:** yeni işlemlere ekleyen üye yazılır. Ailede iki üye varsa listelerde baş harf rozeti görünür.
- **Yedek hatırlatması:** aile hesabına eşitlenirken gösterilmez.
- **Silme ve geri yükleme:** eşitliyken "Tüm verileri sil" ve "Yedekten geri yükle" aile hesabındaki v3 verisini tüm üyeler için değiştirir; çekmece ve onay metni bunu açıkça söyler.
- **Örnek veri modu** (/v3?ornek) buluta hiç bağlanmaz.
- **Ortak yapılandırma:** Firebase yapılandırması `src/firebaseConfig.js` dosyasına taşındı; eski uygulama da aynı dosyayı kullanır, davranışı değişmedi.

**Veritabanı kuralları — canlıda değişiklik YAPILMADI.** Kurallar depoda yok ve bu ortamdan görülemedi.
v3 yolu `families/{familyId}` altında olduğu için mevcut aile kuralı geçerli olur. Kural yalnız `data` alt yoluna izin
veriyorsa v3 yazamaz; ekranda "Bulutla eşitlenemedi — veritabanı kuralları v3 yoluna izin vermiyor olabilir" uyarısı
çıkar ve veri cihazda kalır. Önerilen kural parçası (Firebase konsolunda mevcut kurallara eklenmeli; uygulanmadan önce
emülatörde denenmeli):

```json
"families": {
  "$familyId": {
    "v3": {
      ".read": "auth != null && root.child('families/' + $familyId + '/members/' + auth.uid).exists()",
      ".write": "auth != null && root.child('families/' + $familyId + '/members/' + auth.uid).exists()",
      "schemaVersion": { ".validate": "newData.isNumber()" }
    }
  }
}
```

Doğrulama:
- Eşitleme kuralları (ağaç biçimi, kayıt kayıt fark, çevrimdışı birleştirme, ilk bağlantı) 8 testle doğrulandı. Testler Firebase'i bellekte taklit eder.
- `npm test` 68/68, `npm run build` başarılı.
- **Doğrulanamayan:** Firebase emülatörü bu bilgisayarda çalışmadı (Java ve firebase-tools yok). Canlı veritabanına deneme verisi yazılmadı. Gerçek oturumla iki cihaz arası eşitleme denenmedi.

Sıradaki adımlar:
1. Kuralları konsoldan depoya almak (`database.rules.json`), v3 parçasını eklemek, emülatörde denemek.
2. İlk hâlin verisini v3 biçimine çeviren **yalnız deneme amaçlı** dönüştürücü. Yalnız örnek veri modunda yüklenir, buluta yazılmaz. Eski verinin alan adlarını doğru eşlemek için bir eski yedek dosyası (Ayarlar → Yedekleme → JSON indir) gerekir.
3. v3 içinde giriş ve davet koduyla katılma ekranı.
