# App.jsx Satır Azaltma (Ölü Kod Temizliği)

## Ne yapıldı
App.jsx **9.566 → 9.099 satır** (−467 satır, ~%4,9) indirildi. Salt ölü
kod / kullanılmayan tanım temizliği; davranış değişmedi, `npx vite build`
her turda doğrulandı.

**Pass 1 — kullanılmayan üst-seviye tanımlar (−294):**
`DebtSettings` (242, borç yönetimi Planlama ekranında yaşıyor, bu kopya
öksüzdü), `CCSingleModal` (32), `RiskBar` (11), `getCategorizedTotal`,
`CatButton`, `RECEIPT_CATEGORIES`, `MIN_TL_SAVINGS_PCT` + kullanılmayan
import'lar (`useRef`, `updatePassword`).

**Pass 2 — ölü atamalar + küçük düzeltmeler (−55):**
28 hesaplanıp hiç okunmayan `const` (fixedCC, uncategorizedAcc,
billUnpaidCC, catDetails, accEntries, historyLines, savingsProgress,
nextMonthInst, savingsPool, showMonthDetail, editCardLoad vb.) +
`editDate` state. Google ikonu 3 kopya → tek `GOOGLE_ICON` sabiti.
Ayarlar ekranındaki duplicate-key (`flex:1, overflow:auto` iki kez, 3
yerde) düzeltildi → esbuild uyarısı da giderildi.

**guidance (−118):** Sonucu hiçbir yere render edilmeyen 118 satırlık
kural-tabanlı finansal öneri (`tips`) useMemo'su. Abdullah AI Finans
Danışmanı bunu kapsadığı için silmeyi seçti.

## Neden böyle yapıldı
Hedef: bakım/performans için satır azaltmak (bkz [[project_app_refactor]]).
Yalnızca kanıtla "hiç kullanılmıyor" (global tek-geçiş) olan kod silindi;
%38 benzer olan CCInstallModal/CCCombinedModal simülasyon bloğu
birleştirilmedi (regresyon riski, satır kazancı düşük).

## İç düşünme / karşılaşılan zorluk
Pass 2'de ilk `stmtspan` parantezleri string/template-literal içinde de
saydığı için bir kez `guidance` 118 satırı yanlışlıkla ~1 satır sanıldı;
sonra tam tersi çalışıp 116 fazla satır sildi. Fark edilince `git checkout`
ile geri alınıp string/yorum-duyarlı bir tarayıcıyla yeniden yapıldı ve
her span 12 satır sınırıyla doğrulandı. Ders: kaba karakter sayımıyla JS
statement span'i güvenilmez.

## Sonraki adım
- Bekleyen 2. tur adayları (yapılmadı): CCInstallModal ↔ CCCombinedModal
  simülasyon ortaklaştırması, tekrar eden UI (BackBtn 7×, liste-başlık
  div'leri) için paylaşımlı bileşen.
- Bundle ~948 kB (tek chunk) — kod bölme (dynamic import) ayrı bir konu.
