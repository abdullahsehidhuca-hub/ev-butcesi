// Test ekranları › Hoş geldiniz senaryolarının tarayıcı adımları (scripts/tarayici-deneme.mjs ile çalışır).
// Geliştirme sunucusu 5199'da açık olmalı. SHOTS ortam değişkeni verilirse ekran görüntüleri o klasöre yazılır.
const BASE = "http://localhost:5199";
export default async function ({ click, check, has, sleep, evalJs, shot, failures }) {
  const dir = process.env.SHOTS;
  const snap = async name => { if (dir) await shot(`${dir}/${name}.png`); };
  const open = async id => {
    await evalJs(`localStorage.removeItem('evButcesi.v3.test.${id}.state'); location.assign('${BASE}/?ornek=${id}')`);
    await sleep(2200);
  };
  const must = (ok, name) => { console.log(`  ${ok ? "✔" : "✘"} ${name}`); if (!ok) failures.push(name); };
  // Öğenin ortasındaki nokta gerçekten o öğeye mi düşüyor (üstünde başka öğe yok mu)?
  const onTop = sel => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (el === t || el.contains(t)); })()`);
  const text = sel => evalJs(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim() || ""`);
  const count = () => text(".setup-count");

  await open("duzen"); await check("Hesap düzeni"); await snap("1-duzen");
  must(await evalJs("document.querySelectorAll('.setup-mode').length === 2"), "İki ayrı düzen kartı");
  await has("Önerilen", "Önerilen rozeti");
  must(!(await evalJs("!!document.querySelector('.setup-back')")), "İlk kurulumda Vazgeç yok");
  must(await evalJs("getComputedStyle(document.querySelector('.setup-mode')).boxShadow !== 'none'"), "Düzen kartında gölge var");

  await open("kategori"); await check("Sihirbaz adım 1"); await snap("2-adim1");
  must(await count() === "Adım 1 / 7", "Adım 1 / 7 yazısı");
  must(await evalJs("document.querySelectorAll('.setup-progress li').length === 7 && !!document.querySelector('.setup-progress .is-now')"), "Yedi parçalı ilerleme çubuğu");
  await has("Hoş geldiniz", "İlk adımda karşılama başlığı");
  must(!(await evalJs("!!document.querySelector('.setup-later')")), "Zorunlu adımda Şimdilik atla yok");
  must(await text(".setup-card .setup-primary") === "Hesap ekle", "Ana düğme Hesap ekle");
  must(await onTop(".setup-card .setup-primary"), "Ana düğme açıkta");
  console.log(await click("Hesap ekle", ".setup-primary")); await sleep(500);
  must(!(await evalJs("document.body.innerText.includes('İlk eklediğiniz hesap bütçe hesabınız olur')")), "Bilgi penceresi araya girmiyor");
  must(await evalJs("!!document.querySelector('.sheet-wrap, .v3-overlay')"), "Ekleme çekmecesi doğrudan açıldı"); await snap("3-hesap-ekle");

  await open("kategori");
  console.log(await click("Bilgi: Bütçe hesabı")); await sleep(500);
  await has("İlk eklediğiniz hesap bütçe hesabınız olur", "ⓘ bilgi penceresini açar");
  await open("kategori");
  console.log(await click("Geri", ".setup-prev")); await sleep(400);
  await has("Bütçenizi nasıl takip edersiniz?", "İlk adımda Geri hesap düzenine döner");
  must(await evalJs("!!document.querySelector('.setup-back') && !!document.querySelector('.setup-mode.is-on')"), "Vazgeç üstte, seçili kart işaretli");
  console.log(await click("Vazgeç")); await sleep(400);
  must(await count() === "Adım 1 / 7", "Vazgeç sihirbaza döndü");

  await open("kart"); await check("Gelir adımı"); await snap("4-adim2");
  must(await count() === "Adım 2 / 7", "Bütçe hesabı varken gelir adımı açılır");
  must(!(await evalJs("document.body.innerText.includes('Hoş geldiniz')")), "Sonraki adımlarda karşılama başlığı yok");
  must(await text(".setup-card .setup-primary") === "Gelir ekle", "Boş zorunlu adımda Devam yok");
  console.log(await click("Geri", ".setup-prev")); await sleep(500);
  must(await count() === "Adım 1 / 7", "Geri önceki adıma döndü"); await snap("5-dolu-adim");
  must(await evalJs("document.querySelectorAll('.setup-items .li').length === 2"), "Dolu adımda kayıt ve ekleme satırı");
  must(await text(".setup-card .setup-primary") === "Devam", "Dolu adımda Devam");
  must(await onTop(".setup-items .setup-act"), "Kalem düğmesi açıkta");
  console.log(await click("Devam", ".setup-primary")); await sleep(500);
  must(await count() === "Adım 2 / 7", "Devam sonraki adıma geçti");
  must(await evalJs("document.activeElement?.id === 'setup-q'"), "Odak yeni adım başlığında");

  await open("ayri"); await check("Gider takibi adımı"); await snap("6-atla");
  must(await count() === "Adım 4 / 7", "Gider takibi adım 4");
  await has("İsteğe bağlı", "İsteğe bağlı rozeti");
  await has("Gider takibi hesaplarını daha sonra Ayarlar'dan ekleyebilirsiniz.", "Atla altında sonradan ekleme cümlesi");
  must(!(await evalJs("document.body.innerText.includes('Ayrı hesap açmayacağım')")), "Eski onay kutusu kalktı");
  must(await onTop(".setup-later"), "Şimdilik atla açıkta");
  console.log(await click("Şimdilik atla", ".setup-later")); await sleep(500);
  must(await count() === "Adım 5 / 7", "Atla sonraki adıma geçti");
  must(await evalJs("document.querySelectorAll('.setup-progress .is-skipped').length === 1"), "Atlanan parça gri");
  console.log(await click("Şimdilik atla", ".setup-later")); await sleep(500);
  console.log(await click("Şimdilik atla", ".setup-later")); await sleep(500);
  must(await count() === "Adım 7 / 7", "Sabit ödeme adımına gelindi");
  await has("Sabit ödeme eklemek için önce bir kategori gerekir.", "Sabit ödeme kilitli"); await snap("7-kilitli");
  must(await text(".setup-card .setup-primary") === "Sabit gider kategorisi ekle", "Kilitli kartta kategori ekle düğmesi");
  console.log(await click("Şimdilik atla", ".setup-later")); await sleep(500);
  await has("Kurulum özeti", "Son adımdan sonra özet"); await snap("8-ozet");
  must(await evalJs("[...document.querySelectorAll('.setup-sum-row')].filter(b => b.textContent.includes('Atlandı. Şimdi ekleyebilirsiniz.')).length === 4"), "Dört atlanan adım");
  console.log(await click("Kredi kartları", ".setup-sum-row")); await sleep(500);
  must(await count() === "Adım 3 / 7", "Özet satırı adıma götürür");
  // Atlamalar kayıtlıdır: yeniden açılışta ilk açık adım kalmadığı için özet açılır.
  await evalJs("location.reload()"); await sleep(2200);
  must(await count() === "3 / 7 adım tamamlandı", "Yeniden açılışta atlanan adımlar geçilir, özet açılır");

  await open("kilitli"); await check("Kilitli senaryo");
  must(await count() === "Adım 7 / 7", "Kilitli senaryo sabit ödemede açılır");

  await open("basla"); await check("Kurulum özeti"); await snap("9-basla");
  must(await evalJs("!document.querySelector('.setup-start').disabled"), "Başla açık");
  must(!(await evalJs("!!document.getElementById('setup-start-why')")), "İpucu yok");
  await has("Atladığınız adımları istediğiniz zaman Ayarlar'dan tamamlayabilirsiniz.", "Başla üstünde tamamlama notu");
  must(await onTop(".setup-link"), "Hesap düzenini değiştir açıkta");
  must(await onTop(".setup-start"), "Başla açıkta");
  console.log(await click("Başla", ".setup-start")); await sleep(600);
  must(!(await evalJs("!!document.querySelector('.setup-top, .setup-card')")), "Başla ile Özet açıldı");
  must(await evalJs("getComputedStyle(document.querySelector('.v3-scroll')).paddingBottom === '110px'"), "Özet alt boşluğu eski hâlinde");

  await open("dolu"); await check("Dolu özet"); await snap("10-dolu");
  must(!(await evalJs("!!document.querySelector('.setup-card, .setup-top')")), "Dolu veride karşılama yok");
}
