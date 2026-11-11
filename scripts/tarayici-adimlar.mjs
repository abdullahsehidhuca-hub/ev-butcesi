// Bu turda eklenen akışların tarayıcı adımları (scripts/tarayici-deneme.mjs ile çalışır). Örnek veri kipi (/v3?ornek) gerekir.
export default async function ({ click, type, check, has, sleep, esc, evalJs }) {
  await check("Özet");
  await has("Serbest", "Ana rakam etiketi 'Serbest'");
  await has("Birikim ›", "Hesap şeridinde Birikim bağlantısı");
  const tabs = await evalJs("[...document.querySelectorAll('.tabs button')].map(b => b.textContent.trim()).join(',')");
  console.log("  sekmeler:", tabs);
  if (tabs !== "Özet,Ödemeler,Rapor,Ayarlar") throw new Error("sekme sırası onaylı tasarıma uymuyor: " + tabs);

  // Birikim çekmecesi: varlıklar, kur, al/sat.
  console.log(await click("Birikim ›")); await sleep(400); await check("Birikim çekmecesi");
  await has("VARLIKLAR", "Varlıklar bölümü"); await has("HEDEFLER", "Hedefler bölümü"); await has("Acil durum fonu önerisi");
  console.log(await click("Para ayır / al")); await sleep(400); await check("Para ayır çekmecesi");
  console.log(await type("Çıkan tutar", "1.500"));
  console.log(await evalJs("(() => { const sel = [...document.querySelectorAll('select')][1]; const opt = [...sel.options].find(o => o.textContent.startsWith('Birikim')); if (!opt) return 'no option'; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(sel, opt.value); sel.dispatchEvent(new Event('change',{bubbles:true})); return 'hedef hesap: ' + opt.textContent; })()"));
  console.log(await click("Kaydet")); await sleep(500);
  await has("Birikime aktarıldı", "Aktarım bildirimi");
  await check("Birikim çekmecesine dönüş");
  // Döviz hesabı ekle (Birikim çekmecesinden değil, Ayarlar'dan; burada kur alanının çıkışını kontrol ederiz).
  await esc(); await sleep(300);
  console.log(await click("Ayarlar", ".tabs button")); await sleep(500); await check("Ayarlar");
  await has("BİRİKİM VE HEDEFLER", "Ayarlar'da Birikim ve hedefler grubu");
  console.log(await click("Hesap ekle")); await sleep(400);
  console.log(await type("Hesap adı", "Dolar hesabı"));
  console.log(await type("Para birimi", "USD"));
  console.log(await type("Bugünkü bakiye", "100"));
  console.log(await click("Kaydet")); await sleep(500);
  await has("Dolar hesabı", "Dolar hesabı eklendi");
  await has("USD kuru eksik", "Ayarlar birikim satırı kur eksik uyarısı");
  console.log(await click("Birikim, döviz ve altın")); await sleep(400); await check("Birikim (kur alanı)");
  await has("Kurlar", "Kur bölümü göründü");
  console.log(await type("Dolar (1 $ kaç ₺)", "35"));
  console.log(await click("Kurları kaydet")); await sleep(500);
  await has("Kurlar kaydedildi", "Kur bildirimi");
  await has("3.500 ₺", "100 $ = 3.500 ₺ TL karşılığı");
  // Bozdur: 10 $ → TL, kurdan hesaplanır.
  console.log(await click("Bozdur")); await sleep(400); await check("Bozdur çekmecesi");
  console.log(await evalJs("(() => { const sel = [...document.querySelectorAll('select')][0]; const opt = [...sel.options].find(o => o.textContent.startsWith('Dolar')); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(sel, opt.value); sel.dispatchEvent(new Event('change',{bubbles:true})); return 'kaynak: ' + opt.textContent; })()"));
  console.log(await type("Çıkan tutar", "10"));
  await has("350 ₺", "Kur ipucu: 10 $ ≈ 350 ₺");
  console.log(await click("Kaydet")); await sleep(500);
  await has("Bozduruldu", "Bozdurma bildirimi");
  // Acil durum fonu önerisinden hedef ekle.
  console.log(await click("Hedef olarak ekle")); await sleep(400); await check("Hedef ekle çekmecesi");
  await has("Acil durum fonu", "Ad ön dolu");
  console.log(await type("Hedef tarihi", "2027-06-15"));
  console.log(await click("Kaydet")); await sleep(500);
  await has("Hedef eklendi", "Hedef bildirimi");
  await has("Ayda", "Aylık gereken tutar gösterildi");
  // Hedefi düzenle ve sil akışı.
  console.log(await click("Acil durum fonu:", "button")); await sleep(400); await check("Hedefi düzenle");
  await has("Hedefi sil", "Sil düğmesi var");
  await esc(); await sleep(300); await esc(); await sleep(300);

  // Ödemeler: taksit dene.
  console.log(await click("Ödemeler", ".tabs button")); await sleep(500); await check("Ödemeler");
  console.log(await click("Taksit dene")); await sleep(400); await check("Taksit dene çekmecesi");
  console.log(await type("Toplam tutar", "24.000"));
  await sleep(300);
  await has("4.000 ₺", "Aylık taksit 4.000 ₺");
  await has("Plana sığıyor", "Sığıyor kararı");
  console.log(await type("Toplam tutar", "600.000")); await sleep(300);
  await has("eksiye düşer", "Eksiye düşer kararı");
  console.log(await type("Toplam tutar", "24.000")); await sleep(300);
  console.log(await click("Taksit olarak kaydet")); await sleep(400); await check("Taksit kaydı (ön dolu)");
  await has("Taksitli alışveriş ekle", "Kayıt çekmecesi açıldı");
  const totalVal = await evalJs("(() => { const l = [...document.querySelectorAll('label')].find(x => x.textContent.startsWith('Toplam tutar')); return document.getElementById(l.htmlFor).value; })()");
  console.log("  ön dolu tutar:", totalVal); if (totalVal !== "24000") throw new Error("ön değer taşınmadı");
  await esc(); await sleep(300);

  // Rapor: dönem seçici, trend, hedefler.
  console.log(await click("Rapor", ".tabs button")); await sleep(500); await check("Rapor");
  await has("Son 6 ay harcama", "Trend kartı");
  await has("HEDEFLER", "Rapor'da hedefler");
  await has("Bu dönem", "İleri gidilemez etiketi");
  console.log(await click("Önceki dönem")); await sleep(400); await check("Rapor · Ekim");
  await has("Ekim 2026", "Ekim dönemi başlığı");
  await has("Kasım ›", "Sonraki dönem düğmesi");
  console.log(await click("Sonraki dönem")); await sleep(300);
  await has("Kasım 2026", "Kasım'a dönüş");
  // Kategori satırı işlem listesini açar.
  console.log(await click("Market harcamaları")); await sleep(400); await check("Kategori işlemleri");
  await esc(); await sleep(300);
}
