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
  const onTop = sel => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (el === t || el.contains(t)); })()`);
  const toEnd = () => evalJs("(() => { const m = document.querySelector('.v3-scroll'); m.scrollTop = m.scrollHeight; return m.scrollTop; })()");

  await open("duzen"); await check("Hesap düzeni"); await snap("1-duzen");
  must(await evalJs("document.querySelectorAll('.setup-mode').length === 2"), "İki ayrı düzen kartı");
  await has("Önerilen", "Önerilen rozeti");
  must(!(await evalJs("document.body.innerText.includes('Önerilen ·')")), "Açıklamada 'Önerilen ·' yok");
  must(!(await evalJs("!!document.querySelector('.setup-back')")), "İlk kurulumda Vazgeç yok");

  await open("kategori"); await check("Karşılama boş"); await snap("2-kategori-ust");
  must(await evalJs("document.querySelectorAll('.setup-cta').length === 1"), "Tek etkin adım düğmesi");
  await has("İsteğe bağlı", "3. adım rozeti");
  must(await evalJs("document.querySelector('.setup-start').disabled"), "Başla pasif");
  must(!(await evalJs("!!document.getElementById('setup-start-note')")), "Başla kapalıyken tamamlama notu yok");
  await toEnd(); await sleep(300); await snap("3-kategori-son");
  must(await onTop(".setup-link"), "Kaydırma sonunda Hesap düzenini değiştir açıkta");
  must(await evalJs("(() => { const l = document.querySelector('.setup-list, section[aria-label=\"Başlangıç adımları\"]').getBoundingClientRect(); const f = document.querySelector('.setup-foot').getBoundingClientRect(); return l.bottom <= f.top; })()"), "Liste sonu Başla alanının üstünde");
  console.log(await click("Hesap düzenini değiştir")); await sleep(400); await snap("4-duzen-degistir");
  await has("Bütçenizi nasıl takip edersiniz?", "Düzen seçimi açıldı");
  must(await evalJs("!!document.querySelector('.setup-back') && !!document.querySelector('.setup-mode.is-on .radio.on')"), "Vazgeç üstte, seçili kart işaretli");
  console.log(await click("Vazgeç")); await sleep(400);
  await has("Hoş geldiniz", "Vazgeç karşılamaya döndü");
  console.log(await click("1. Bütçe hesabı")); await sleep(500);
  await has("İlk eklediğiniz hesap bütçe hesabınız olur", "1. adım bilgi penceresi");

  await open("kart"); await check("Karşılama bütçe hesabı var"); await snap("5-kart");
  must(await onTop(".setup-info"), "ⓘ başka öğenin altında değil");
  must(await evalJs("(() => { const r = [...document.querySelectorAll('.setup-step > svg:last-child')].map(s => Math.round(s.getBoundingClientRect().right)); return r.length > 3 && new Set(r).size === 1; })()"), "Oklar aynı hizada");
  must(await evalJs("(() => { const i = document.querySelector('.setup-info').getBoundingClientRect(); const t = document.querySelector('.setup-row .setup-step').getBoundingClientRect(); return t.right - 74 <= i.left + 1; })()"), "Satır düğmesi ⓘ altına uzanmıyor");
  await has("Gelir ekle", "Etkin adım gelir");
  await has("Fikrinizi değiştirirseniz Ayarlar'dan hesap ekleyebilirsiniz.", "Kutunun altındaki not");
  console.log(await click("", ".setup-row .setup-step")); await sleep(300);
  must(await evalJs("!!document.querySelector('.setup-panel')"), "Akordiyon açıldı"); await snap("6-kart-akordiyon");
  console.log(await click("", ".setup-row .setup-step")); await sleep(300);
  console.log(await click("Ayrı hesap açmayacağım", "label")); await sleep(300);
  must(await evalJs("[...document.querySelectorAll('.setup-step')].find(b => b.textContent.includes('Gider takibi'))?.disabled === true"), "Kutu işaretlenince 3. adım devre dışı");
  console.log(await click("Ayrı hesap açmayacağım", "label")); await sleep(300);
  must(await evalJs("[...document.querySelectorAll('.setup-step')].find(b => b.textContent.includes('Gider takibi'))?.disabled === false"), "Kutu kaldırılınca 3. adım açık");

  await open("basla"); await check("Başla hazır"); await snap("7-basla");
  must(!(await evalJs("!!document.getElementById('setup-start-why')")), "İpucu yok");
  await has("Boş bıraktığınız adımları istediğiniz zaman Ayarlar'dan tamamlayabilirsiniz.", "Başla açıkken tamamlama notu");
  console.log(await click("Başla", ".setup-start")); await sleep(600);
  must(!(await evalJs("document.body.innerText.includes('Hoş geldiniz')")), "Başla ile Özet açıldı");
  must(await evalJs("getComputedStyle(document.querySelector('.v3-scroll')).paddingBottom === '110px'"), "Özet alt boşluğu eski hâlinde");

  await open("dolu"); await check("Dolu özet"); await snap("8-dolu");
  must(await evalJs("getComputedStyle(document.querySelector('.v3-scroll')).paddingBottom === '110px'"), "Dolu özet alt boşluğu eski hâlinde");
}
