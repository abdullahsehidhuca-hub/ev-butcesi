// Eski uygulama yedeğiyle (/?ornek=yedek, depo dışı yedek/ klasörü) tüm sekmeleri ve ana çekmeceleri gezer.
// scripts/tarayici-deneme.mjs ile çalışır; yatay taşma ve konsol hatası ölçer. Kişisel veri içermez; yalnız
// ekranların veriyle dolu açıldığını denetler.
export default async function ({ click, check, has, sleep, esc, evalJs, text }) {
  const body = async () => String(await text());
  await check("Özet (yedek verisi)");
  await has("Yedek verisi", "Yedek verisi bandı");
  await has("Serbest", "Ana rakam");
  const hesapSayisi = await evalJs("document.querySelectorAll('.acct').length");
  console.log("  hesap kartı sayısı:", hesapSayisi); if (!(hesapSayisi >= 3)) throw new Error("hesap şeridi boş");
  await has("Son işlemler", "Son işlemler listesi");
  console.log(await evalJs("(() => { const b = document.querySelector('.why-btn'); if (!b) return 'NOT FOUND: why-btn'; b.click(); return 'clicked Döküm'; })()")); await sleep(400); await check("Döküm çekmecesi");
  await esc(); await sleep(300);
  console.log(await click("Son işlemler")); await sleep(300);
  const son = await evalJs("document.querySelectorAll('main .li').length"); console.log("  son işlem satırı:", son);
  console.log(await click("Tüm işlemler")); await sleep(400); await check("Tüm işlemler");
  const satir = await evalJs("document.querySelectorAll('.v3-sheet .li').length");
  console.log("  işlem satırı:", satir); if (!(satir >= 5)) throw new Error("işlem listesi boş");
  await esc(); await sleep(300);
  if ((await body()).includes("Kart blokesi")) { console.log(await click("Kart blokesi")); await sleep(400); await check("Kart blokesi"); await esc(); await sleep(300); }
  if ((await body()).includes("dönemini kapatın")) { console.log(await click("dönemini kapatın")); await sleep(400); await check("Ay kapatma"); await esc(); await sleep(300); }

  console.log(await click("Ödemeler", ".tabs button")); await sleep(500); await check("Ödemeler");
  await has("Kalan ödeme", "Kalan ödeme özeti");
  const odeme = await evalJs("document.querySelectorAll('main .li').length");
  console.log("  ödeme satırı:", odeme); if (!(odeme >= 5)) throw new Error("ödeme listesi boş");
  await has("AKTİF TAKSİTLER", "Aktif taksitler bölümü (başlık büyük harfle görünür)");
  console.log(await click("Önceki dönem")); await sleep(400); await check("Ödemeler · önceki dönem");
  console.log(await click("Sonraki dönem")); await sleep(300);

  console.log(await click("Rapor", ".tabs button")); await sleep(500); await check("Rapor");
  await has("Harcandı", "Harcandı kartı");
  await has("Son 6 ay harcama", "Trend kartı");
  const kategori = await evalJs("[...document.querySelectorAll('main .li')].length");
  console.log("  kategori / satır:", kategori); if (!(kategori >= 3)) throw new Error("rapor satırları boş");
  console.log(await click("Önceki dönem")); await sleep(400); await check("Rapor · önceki dönem");
  console.log(await click("Önceki dönem")); await sleep(400); await check("Rapor · iki dönem önce");
  console.log(await click("Gıda&Market")); await sleep(400); await check("Kategori işlemleri");
  await esc(); await sleep(300);

  console.log(await click("Ayarlar", ".tabs button")); await sleep(500); await check("Ayarlar");
  await has("KADRİYE", "Kartlar listelendi");
  await has("Ev Kirası", "Düzenli ödemeler listelendi");
  await has("Gıda&Market", "Kategoriler listelendi");
  console.log(await click("Ev Kirası")); await sleep(400); await check("Düzenli ödeme düzenle");
  await esc(); await sleep(300);
  console.log(await click("Birikim, döviz ve altın")); await sleep(400); await check("Birikim çekmecesi");
  await esc(); await sleep(300);
}
