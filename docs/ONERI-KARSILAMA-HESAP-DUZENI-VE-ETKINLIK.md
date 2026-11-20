# Öneri: Karşılamada hesap düzeni ve kısa süreli bütçeler

Tarih: 2026-11-20 · Durum: onaylandı; 1, 2 ve 3. adımlar uygulandı (bkz. 8 ve 9. bölüm). Kısa süreli bütçe için canlı veritabanı kuralı yayını onay bekliyor.

## 1. Sorun

Hoş geldiniz ekranı herkese aynı üç adımı soruyor: hesap, maaş, sabit ödemeler. Oysa insanlar parayı çok farklı yollarla takip ediyor:

- **Sizin düzeniniz:** bir bütçe ana hesabı var. Her kredi kartı için ayrı bir hesap var. Sabit ödemeler için de talimatlı bir hesap var. Konfor kartına (kahve, kafe) her hafta para gönderiyorsunuz. Amaç her hesabı bankayla karşılaştırabilmek. Bedeli ise her harcamada ve her ödemede ayrıca "aktardım" diye işaretlemek. Eşiniz bu yüzden kullanmak istemiyor.
- **Tek hesaplı kullanıcı:** yalnız maaş hesabını tanımlar. Kart ekstresi, sabit ödeme ve konfor harcaması o tek hesaptan düşer.
- **Kısa süreli bütçe:** kamp, tatil, ev arkadaşlarıyla ortak alışveriş gibi durumlar. Bunlar için uygulamada hiç ekran yok.

## 2. Bugün kodda zaten olanlar

Öneriler bunların üzerine kuruluyor; sıfırdan değil.

| Var olan | Nerede | Ne işe yarar |
| --- | --- | --- |
| Kredi kartı hesap türü | `src/v3/Sheets.jsx` › AccountSheet | Kartla yapılan harcama doğrudan kartın borcuna yazılır. Her harcamada ayrıca aktarım gerekmez. |
| Kart ekstresi ödemesi | `src/v3/Sheets.jsx` › PaySheet | Ayda bir kez ✓: ekstre tutarı ana hesaptan karta geçer. |
| Karttaki talimatlı ödeme | `src/core/accounts.js` › autoCharges | Kredi kartına bağlı sabit ödeme, işaretlenmese de dönem başında kendiliğinden düşer ("oto" etiketi). |
| Bankayla karşılaştırma | `src/core/accounts.js` › reconcile, BakiyeSheet | Bankadaki rakamı yazınca fark ve son tutan günden beri girilen kayıtlar listelenir. |
| Ödeme düğmeleri | `src/v3/screens/OdemeSecenekSheet.jsx` | Harcamada "Nereden ödendi" düğmeleri: Konfor kartı, Yemek kartı gibi. |

Bir eksik var. Talimatlı ödeme kendiliğinden düşme kuralı **yalnız kredi kartında** çalışıyor. Banka hesabındaki talimat hâlâ elle ✓ istiyor. Konfor kartına haftalık gönderim için de bir tekrar yok; sabit ödemeler yalnız ayda bir tekrarlanıyor.

## 3. Öneri A: Karşılamada tek soru, "Paranızı nasıl takip edersiniz?"

Üç adımın önüne tek bir seçim ekranı gelir. Seçime göre adımlar ve formlar kendini ayarlar. Seçim sonradan Ayarlar'dan değiştirilebilir.

**1. Tek hesap** ("Her şey maaş hesabımdan çıkar")
- Adımlar: maaş hesabı ve bakiyesi, maaş günü, sabit ödemeler.
- Kart ekstresi, sabit ödeme ve konfor harcaması bu hesaptan düşer. Kart sorulmaz.

**2. Kartlarımı da izlerim** (önerilen başlangıç)
- Adımlar: ana hesap, kredi kartları (ad, borç, kesim günü), maaş, sabit ödemeler.
- Kartla harcama tek dokunuşla karta yazılır. Ekstre gelince ayda bir kez "Ödendi" denir.
- Ayrıca aktarım girmeye gerek kalmaz. Eşinizin yükü burada kalkar: harcamayı yazıp "Kart" düğmesine basmak yeter.

**3. Her hesabı ayrı izlerim** (sizin düzeniniz)
- 2. seçeneğin hepsi, artı talimat hesabı ve konfor kartı.
- Haftada ya da ayda bir "Bankayla karşılaştır" hatırlatması gelir.

Bu ekran için metin seçenekleri (onaylı ses kartına göre):

- **Başlık**
  - A: "Paranızı nasıl takip edersiniz?"
  - B: "Hangi düzen size uyar?"
- **Alt metin**
  - A: "Sonradan Ayarlar'dan değiştirebilirsiniz."
  - B: (alt metin yok)

## 4. Öneri B: Zahmeti azaltan üç işlev

Bu üç işlev 3. seçenekteki tuşlamayı azaltır. 1. ve 2. seçeneği kullananları da etkilemez.

**B1. Talimatlı ödeme her hesapta kendiliğinden düşsün**
- Sabit ödeme formuna "Otomatik talimatla ödeniyor" seçeneği eklenir. İşaretliyse ödeme günü gelince ✓ beklemeden düşer.
- Bugün bu kural yalnız kredi kartında çalışıyor; banka hesabına da genişler.
- Tutar farklı çıkarsa satıra dokunup düzeltilir.
- Talimat hesabına her ay elle para aktarma yerine şu soru sorulur: "Bu ay talimat hesabına {tutar} aktarılsın mı?" Tek dokunuşla onaylanır.

**B2. Haftalık harçlık (konfor kartı)**
- Konfor kartına "Her hafta {gün} {tutar} yüklenir" tanımı eklenir.
- Aktarım o gün kendiliğinden kaydedilir.
- Özet'te "Bu hafta konfor kartında {tutar} kaldı" satırı görünür.
- Harcama girerken "Konfor" düğmesi tek dokunuş olur.
- Haftalık tekrar yeni bir kural; çekirdekte (`src/core`) hesap motoruna eklenmesi ve test yazılması gerekir.

**B3. Bankayla karşılaştırma hatırlatması**
- Elle aktarım işaretlemek yerine haftada bir şu hatırlatma gelir: "Bankadaki rakamları yazın, fark varsa gösterelim".
- Fark çıkarsa son tutan günden beri girilen kayıtlar listelenir. Bu işlev zaten var.
- Doğruluk her kaydı tek tek aktarmakla değil, haftada bir rakam yazmakla sağlanır.

## 5. Öneri C: Kısa süreli bütçe (kamp, tatil, gezi)

Karşılamada "Bütçe kur" yanına ikinci bir yol eklenir: **"Kısa süreli bütçe kur"**, alt yazısı "Kamp, tatil, gezi gibi".

İki tür:

**C1. Ortak harcama (kamp)**
- Herkes kendi telefonundan yaptığı harcamayı girer.
- Gün sonunda kategori toplamları görünür: neye ne kadar harcandı.
- "Hesaplaşma" ekranı kimin kime ne kadar göndermesi gerektiğini en az sayıda aktarımla gösterir.

**C2. Tatil bütçesi**
- Başta toplam bütçe girilir (örneğin 30.000 ₺ nakit + kart).
- Her harcama "Nakit" ya da "Kart" diye işaretlenir ve bütçeden düşer.
- Ekranın üstünde "Kalan: {tutar} · günde {tutar}" görünür.
- İsterseniz kart harcamaları bitişte ana bütçeye aktarılır; böylece iki kez girilmez.

Ortak noktalar:
- Başlangıç ve bitiş tarihi olur, süre dolunca bütçe arşive iner.
- Davet kodu ve onay akışı bugünkü bütçe davetiyle aynıdır.
- Ana ev bütçesinden ayrı durur; uygulamanın üstünde bütçe seçici çıkar.

Bu iş bir **veritabanı kuralı değişikliği** gerektirir: kullanıcı birden çok bütçeye üye olabilecek, hesaplaşma kayıtları tutulacak. Bu yüzden ayrı ve onaylı bir işte, önce emülatörde test edilerek yapılmalı. Canlıya yayın sizin onayınızla olur.

## 6. Önerilen sıra

1. **A (karşılama seçimi) + B1 (talimat her hesapta).** Hoş geldiniz ekranının bu işteki düzeltmesi. Veritabanı kuralı değişmez.
2. **B2 (haftalık harçlık) + B3 (karşılaştırma hatırlatması).** Çekirdeğe haftalık tekrar eklenir.
3. **C (kısa süreli bütçe).** Ayrı iş. Veritabanı kuralı değişir, önce emülatörde test edilir.

## 7. Sizden beklenen kararlar

1. Üç düzen (Tek hesap / Kartlarımı da izlerim / Her hesabı ayrı izlerim) uygun mu? Ad ya da sayı değişsin mi?
2. Seçim ekranının başlığı A mı B mi? Alt metni A mı B mi?
3. B1, B2, B3 işlevlerinden hangileri yapılsın?
4. Kısa süreli bütçede C1 ve C2 ikisi birden mi olsun, yoksa önce biri mi?
5. Önerilen sıra uygun mu?

## Değerlendirilen seçenekler

**Her hesabı ayrı izlemeyi herkese zorunlu kılmak**
- Bırakıldı. Tek hesap kullanan için gereksiz yük olur; eşinizin itirazı da tam olarak bu.

**Hesap düzenini hiç sormamak, her şeyi tek hesaba düşürmek**
- Bırakıldı. Sizin bankayla karşılaştırma ihtiyacınızı karşılamaz.

**Konfor kartını ayrı hesap yerine kategori bütçesi yapmak**
- Tek başına bırakıldı. Kategori bütçesi "ne kadar harcadım"ı söyler ama karttaki gerçek parayı söylemez.
- Haftalık harçlık (B2) iki ihtiyacı birlikte karşılıyor.

**Kısa süreli bütçeyi ana bütçenin içinde bir kategori olarak yapmak**
- Bırakıldı. Kampa katılanların hepsi ev bütçesinin üyesi değildir. Hesaplaşma ve ayrı üyelik ancak ayrı bir bütçeyle mümkün.

**Karşılaşılan zorluk**
- Talimatlı ödemenin kendiliğinden düşmesi bugün yalnız kredi kartında var.
- Banka hesabına genişletirken, daha önce elle ✓ girilmiş ödemelerin iki kez sayılmaması gerekir. Mevcut "aynı döneme bağlı kayıt varsa düşme" kuralı burada da kullanılacak.

## 8. Kararlar ve uygulama durumu (2026-11-20)

Kullanıcı kararları:
- Tüm öneriler kabul edildi.
- Önerilen sıra uygun bulundu.
- Kısa süreli bütçede C1 ve C2 birlikte yapılacak.
- B1, B2 ve B3 arasındaki seçim, işlevsellik, kolaylık ve kapsam ölçütleriyle bize bırakıldı.

### B işlevlerinin senaryolu seçimi

| Senaryo | B1 talimat | B2 haftalık harçlık | B3 karşılaştırma hatırlatması |
| --- | --- | --- | --- |
| Tek hesap kullanan | Kira, fatura ✓ beklemeden düşer | Gerekmez | Ayda bir ana hesabı karşılaştırır |
| Kartlarını izleyen | Banka hesabındaki talimatlar düşer | Gerekmez | Kart ve ana hesap haftada bir karşılaştırılır |
| Her hesabı ayrı izleyen (sizin düzeniniz) | Talimat hesabındaki ödemeler düşer | Konfor kartı her hafta kendiliğinden yüklenir | Her hesap haftada bir karşılaştırılır |
| Eşiniz (yalnız harcama giren) | Hiçbir şey işaretlemez | Yalnız "Konfor" düğmesine basar | Hatırlatma yalnız kurucuya gider |

**Seçim: üçü de yapılacak, şu sırayla.**
1. **B1 (şimdi):** Her düzende işe yarıyor ve en çok tuşlamayı kaldırıyor. Veri yapısına tek bir alan ekliyor.
2. **B3 (sonra):** En ucuzu. Var olan karşılaştırma ekranını kullanıyor ve her düzende doğruluğu sağlıyor.
3. **B2 (B3 ile birlikte):** Yalnız ayrı hesap düzeninde gerekiyor ama orada en büyük zahmet bu. "Bu ay talimat hesabına {tutar} aktarılsın mı?" sorusu da aynı tekrarlı aktarım altyapısını kullanacağı için B1'den buraya taşındı.

### Bu turda uygulananlar (1. adım: A + B1)

**Hesap düzeni seçimi**
- İlk hesaptan önce "Paranızı nasıl takip edersiniz?" ekranı çıkıyor.
- Seçim `settings.trackingMode` alanına yazılıyor.
- Hoş geldiniz adımları seçilen düzene göre değişiyor:
  - Tek hesap: 3 adım.
  - Kartlarımı da izlerim: 4 adım (kredi kartları eklenir).
  - Her hesabı ayrı izlerim: 5 adım (talimat hesabı ve konfor kartı eklenir).

**Talimatlı ödeme**
- Sabit ödeme ekleme ve düzenleme formuna "Otomatik talimatla ödeniyor" seçeneği eklendi.
- Seçenek işaretlenince ödeme, işaretlendiği dönemden itibaren ödeme günü gelince hesaptan kendiliğinden düşüyor. Geçmiş dönemlerin bakiyesi değişmiyor.
- Elle gerçek tutar girilirse otomatik çekimin yerine geçiyor; ödeme iki kez düşmüyor.
- Bakiye tahmini de talimatlı ödemeyi ödeme gününde düşüyor.

**Önceki turda bulunan iki hata düzeltildi**
- İlk maaş girilince bütçe ayı artık maaş gününden başlıyor.
- Maaşın yattığı hesap listesinde kredi kartı çıkmıyor.

**Metin değişikliği**
- Seçim ekranının alt metni "Sonradan Ayarlar'dan değiştirebilirsiniz." yerine "Sonradan istediğiniz hesabı ekleyebilirsiniz." oldu.
- Nedeni: seçim yalnız kurulum adımlarını belirliyor. Ayarlar'da değiştirilecek bir şey bırakmıyor, eski cümle yanlış beklenti yaratırdı.
- Hesap eklenmeden önce düzen "Hesap düzenini değiştir" bağlantısıyla değiştirilebiliyor.

**Veritabanı kuralı değişmedi.**

### Değerlendirilen seçenekler (uygulama)

**Talimatı "her zaman otomatik" bayrağı olarak tutmak**
- Bırakıldı. Eski bir sabit ödemede açılınca geçmiş dönemlerin bakiyesi de değişirdi.
- Bunun yerine talimatın açıldığı dönem (`autopayFrom`) tutuluyor.

**Maaş gününü her maaş eklemede bütçe ayı başlangıcı yapmak**
- Bırakıldı. Girilmiş kayıtların dönemi kayardı.
- Yalnız ilk maaşta ve henüz işlem yokken uygulanıyor. Sonrası için Ayarlar'daki bütçe ayı ayarı duruyor.

## 9. 2. ve 3. adım: uygulama durumu (2026-11-20)

### 2. adım: B3 + B2

**Bankayla karşılaştırma hatırlatması (B3)**
- Özet'te "Bankayla karşılaştırma zamanı" uyarısı çıkıyor.
- Hangi hesaplar için çıkar: kart dışındaki hesaplardan son karşılaştırması (yoksa açılışı) 7 günden eski olanlar. Tek hesap düzeninde bu süre 30 gün.
- "Şimdi karşılaştır" bakiye çekmecesini açıyor. "3 gün sonra hatırlat" uyarıyı erteliyor.
- Henüz hiç işlem yoksa sorulmuyor.

**Haftalık yükleme (B2)**
- Hesap ekleme ve düzenleme formunda yeni alanlar var: "Haftalık yükleme" tutarı, gün ve hangi hesaptan yükleneceği.
- Yükleme günü gelince aktarım kendiliğinden kaydediliyor.
- Kayıt kimliği hesap ve tarihten türüyor; iki cihaz aynı anda yazsa da tek kayıt oluyor.
- Silinen bir yükleme yeniden yazılmıyor.
- Özet'te "Konfor kartı: bu hafta {tutar} kaldı · {gün} günü {tutar} yüklenir" satırı görünüyor.

**Talimat hesabına aktarım**
- Talimatlı ödemeleri ana hesap dışındaki bir hesaptan çekilen her hesap için bu dönem eksik kalan tutar Özet'te soruluyor.
- "{tutar} aktar" tek dokunuşla ana hesaptan aktarıyor.
- "Bu dönem aktarmayacağım" uyarıyı o dönem için kapatıyor.

### 3. adım: C1 + C2 kısa süreli bütçe

**Nereden açılır**
- Ayarlar › Kısa süreli bütçeler.
- Bütçesi olmayan üye hesabının karşılama ekranındaki "Kısa süreli bütçe kur" satırı.

**Türler**
- **Ortak harcama:** herkes ödediğini girer. Neye ne kadar harcandığı ve "Hesaplaşma · kim kime ne gönderecek" listesi görünür. Paylaşım eşit, kuruş farkı kaybolmaz, en az sayıda aktarım çıkar.
- **Tatil bütçesi:** toplam bütçe girilir. "Kalan · günde {tutar} · {n} gün", harcanan, bugün harcanan ve nakit · kart toplamı görünür.

**Katılım**
- Kuran kişi 6 karakterli, 7 gün geçerli bir kod oluşturur.
- Kodu bilen herkes süresi içinde katılabilir. Kamp grubu için tek kod yeterli; e-posta eşleşmesi aranmaz.

**Yetkiler**
- Herkes kendi telefonundan harcama girer ve yalnız kendi girdiğini siler.
- Kuran kişi her kaydı silebilir.
- Üye bütçeden ayrılabilir.

**Ev bütçesine aktarma**
- "Harcamalarımı ev bütçesine ekle", kendi ödediğiniz harcamaları ev bütçesine yazar: kart harcamaları kredi kartına, nakit harcamalar nakit ya da varsayılan hesaba.
- Eklenenler işaretlenir, iki kez eklenmez.

**Veritabanı kuralı değişikliği (database.rules.json)**
- Yeni yollar eklendi:
  - `events/{id}`: meta, members ve expenses.
  - `eventInvites/{kod}`
  - `userEvents/{uid}`
- Mevcut kurallar değişmedi.
- Kurallar emülatörde test edildi: `npm run test:rules` 12/12 geçti. Yeni testte yabancının okuyamadığı, kodsuz ya da süresi dolmuş kodla katılınamadığı, başkası adına kayıt yazılamadığı ve üyenin ayarları değiştiremediği denendi.
- **Canlıya yayınlanmadı.** Yayınlanana kadar uygulamada kısa süreli bütçe kurmak "Bu işlem için izniniz yok" hatası verir.
- Yayın komutu: `firebase deploy --only database --project ev-butcesi-96167`

### Değerlendirilen seçenekler (2. ve 3. adım)

**Haftalık yüklemeyi motor içinde sanal hareket olarak hesaplamak**
- Bırakıldı. Gerçek aktarım kaydı yazılıyor. Böylece işlem listesinde görünüyor, düzeltilip silinebiliyor ve bakiye, rapor ve tahmin ayrıca değiştirilmeden doğru kalıyor.

**Kısa süreli bütçeye e-postayla davet (ev bütçesindeki gibi)**
- Bırakıldı. Kamp grubunda herkesin e-postasını tek tek girmek zahmetli.
- Yerine 7 gün geçerli, çok kullanımlık kod seçildi. Kodu yalnız kuran üretebiliyor.

**Kısa süreli bütçeyi ev bütçesinin içinde tutmak**
- Bırakıldı. Katılanlar ev bütçesinin üyesi değil.
- Ayrı `events` yolu ve kendi üyelik kuralları gerekti.
