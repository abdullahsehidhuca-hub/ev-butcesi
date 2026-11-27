// Test ekranları › Giriş ve bütçeler senaryolarının tarayıcı adımları (scripts/tarayici-deneme.mjs ile çalışır).
// Geliştirme sunucusu 5199'da açık olmalı; ilk adres olarak http://localhost:5199/?test verilir.
const BASE = "http://localhost:5199";
export default async function ({ click, type, check, has, sleep, evalJs, failures }) {
  const open = async (id, hash = "") => {
    await evalJs(`localStorage.removeItem('evButcesi.v3.test.${id}.state'); location.assign('${BASE}/?ornek=${id}${hash}')`);
    await sleep(2200);
    await evalJs("window.confirm = () => true; true");
  };
  const submit = async () => { console.log(await click("", "form button[type=submit]")); await sleep(500); };
  // İlk açılış kartları: seçenekler .list içinde değil, her kart kendi gölgesini taşır, en az 72 px, en çok bir parlak kart.
  const cards = async (name, primary) => {
    const r = await evalJs(`(() => { const cs = [...document.querySelectorAll('.v3-gate-cards .v3-gate-card')]; const st = cs.map(c => getComputedStyle(c)); return JSON.stringify({ n: cs.length, list: !!document.querySelector('.v3-scroll.is-gate .list'), shadow: st.every(s => s.boxShadow && s.boxShadow !== 'none'), minH: Math.min(...cs.map(c => c.getBoundingClientRect().height)), h: cs.map(c => Math.round(c.getBoundingClientRect().height)), area: Math.round(document.querySelector('.v3-gate-cards')?.getBoundingClientRect().height || 0), primary: document.querySelectorAll('.v3-gate-card.is-primary').length }); })()`);
    const o = JSON.parse(r); console.log(`  kartlar (${name}): ${r}`);
    if (!o.n || o.list) failures.push(`kartlar ayrı değil: ${name}`);
    if (!o.shadow) failures.push(`kart gölgesi yok: ${name}`);
    if (o.minH < 72) failures.push(`kart 72 px'ten kısa: ${name}`);
    if (o.primary !== primary) failures.push(`parlak kart sayısı ${o.primary}: ${name}`);
  };
  const net = async name => {
    const n = await evalJs("performance.getEntriesByType('resource').map(e => e.name).filter(u => /firebase|googleapis|firebaseio/.test(u)).length");
    console.log(`  ağ (${name}): firebase isteği ${n}`); if (n) failures.push(`firebase isteği: ${name}`);
  };

  await check("Test ekranları");
  await has("GİRİŞ VE BÜTÇELER", "Yeni grup"); await has("Bütçesi olmayan üye hesabı");

  // Giriş yap → bütçe seçimi → bütçe
  await open("giris"); await check("Giriş ekranı"); await cards("giriş", 1);
  await has("Deneme kodları: K7M2QX", "Bantta deneme kodları"); await has("Baştan yükle");
  console.log(await click("Giriş yapÜye")); await sleep(500);
  if (!(await evalJs("!!document.querySelector('form .v3-submit.is-glossy')"))) failures.push("giriş formunda parlak düğme yok");
  console.log(await type("E-posta", "deneme@ornek.com")); console.log(await type("Şifre", "123456")); await submit();
  await has("Hangi bütçeyi açmak istersiniz?", "Girişten sonra bütçe seçimi"); await has("İş yeri bütçesi");
  console.log(await click("Ana bütçe")); await sleep(600); await check("Ana bütçe açıldı");
  await has("Serbest", "Uygulama açıldı");

  // Davet: yanlış kod, K7M2QX, doğrulama
  console.log(await click("Baştan yükle")); await sleep(600);
  await has("Bütçenizi takip edin", "Baştan yükle giriş ekranına döndü");
  console.log(await click("Davet kodum varPaylaşılan")); await sleep(500);
  console.log(await type("Davet kodu", "AAAAAA")); await submit();
  await has("Bu kod geçersiz", "Yanlış kod hatası");
  console.log(await type("Davet kodu", "K7M2QX")); await submit();
  await has("İş yeri bütçesi", "2. adımda bütçe adı"); await has("yeni@ornek.com adresiyle açılır", "2. adımda e-posta");
  console.log(await type("Şifre", "123456")); await submit();
  await has("E-postanızı kontrol edin", "Doğrulama adımı");
  await submit(); await sleep(300);
  await has("Bütçeye katıldınız", "Katılım bildirimi"); await check("K7M2QX sonrası");

  // H3P8WD: üye hesabı olan davetli
  console.log(await click("Baştan yükle")); await sleep(600);
  console.log(await click("Davet kodum varPaylaşılan")); await sleep(500);
  console.log(await type("Davet kodu", "H3P8WD")); await submit();
  console.log(await type("Şifre", "123456")); await submit();
  await has("katılmak istiyor musunuz", "Hesabı olan davetliye soru");
  await submit();
  await has("Davet kodunuz kaydedildi", "Davetle giriş adımı");
  console.log(await type("Şifre", "123456")); await submit(); await sleep(300);
  await has("Bütçeye katıldınız", "H3P8WD katılım");

  // Üye hesabı aç
  console.log(await click("Baştan yükle")); await sleep(600);
  console.log(await click("Üye hesabı açİlk")); await sleep(500);
  console.log(await type("Adınız", "Deneme")); console.log(await type("E-posta", "kayit@ornek.com")); console.log(await type("Şifre", "123456")); await submit();
  await has("ile giriş yaptınız", "Kayıttan sonra bütçesi olmayan ekran");
  await net("giris");

  // Bütçesi olmayan üye hesabı
  // Yükleniyor: seçeneklerin yerinde üç iskelet kart, tıklanabilir kart yok; alan yüksekliği giriş ekranınınkiyle yakın.
  await open("yukleniyor"); await check("Giriş ekranı · yükleniyor");
  const sk = JSON.parse(await evalJs("JSON.stringify({ skel: document.querySelectorAll('.v3-gate-skel').length, card: document.querySelectorAll('.v3-gate-card').length, status: document.querySelector('.v3-gate-cards [role=status]')?.textContent, area: Math.round(document.querySelector('.v3-gate-cards')?.getBoundingClientRect().height || 0) })"));
  console.log("  iskelet:", JSON.stringify(sk));
  if (sk.skel !== 3 || sk.card !== 0) failures.push("yükleniyor: iskelet kartlar");
  if (sk.status !== "Ev Bütçesi açılıyor…") failures.push("yükleniyor: durum metni");
  if (Math.abs(sk.area - 258) > 8) failures.push(`yükleniyor: iskelet alanı ${sk.area} px, kartlar 258 px`);
  await sleep(5200); if ((await evalJs("document.querySelectorAll('.v3-gate-card').length")) !== 0) failures.push("yükleniyor: 5 sn sonra giriş ekranına geçti");

  await open("butcesiz"); await check("Bütçesi olmayan"); await cards("bütçesiz", 1);
  console.log(await click("Kısa süreli bütçe kur")); await sleep(300);
  await has("test ekranlarında açılmıyor", "Kısa süreli bütçe bildirimi");
  console.log(await click("Bütçe kurBirkaç")); await sleep(500);
  await submit(); await has("Bütçenin adını ve kendi adınızı yazın", "Boş form hatası");
  console.log(await type("Bütçenin adı", "Deneme bütçesi")); console.log(await type("Adınız", "Deneme")); await submit(); await sleep(300);
  await has("Bütçeniz kuruldu", "Bütçe kuruldu"); await check("Bütçe kurulduktan sonra");
  await net("butcesiz");

  // Bütçe seçimi
  await open("secim"); await check("Bütçe seçimi"); await cards("seçim", 0);
  console.log(await click("Yeni bütçe kur")); await sleep(500); await has("Bütçenin adı", "Yeni bütçe kur çekmecesi");
  console.log(await click("Vazgeç")); await sleep(400);
  console.log(await click("İş yeri bütçesi")); await sleep(600); await has("Serbest", "Seçimden sonra uygulama");

  // Ayarlar · bütçe ve üyeler
  await open("butceler", "#settings"); await check("Ayarlar bütçe ve üyeler");
  await has("Başka bütçeye geç"); await has("Bütçenin adı");
  console.log(await click("Bütçenin adı")); await sleep(500);
  console.log(await type("Bütçenin adı", "Ev")); await submit(); await sleep(300);
  await has("Yeni ad kaydedildi", "Ad değişti bildirimi");
  const v = await evalJs("[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Bütçenin adı'))?.textContent"); console.log("  satır:", v);
  if (!String(v).includes("Ev")) failures.push("yeni ad satırda yok");
  console.log(await evalJs("(() => { const b = [...document.querySelectorAll('button')].find(b => /Üye davet edin/.test(b.textContent)); if (!b) return 'üyeler satırı yok'; b.click(); return 'üyeler açıldı'; })()")); await sleep(500);
  console.log(await type("Üyenin adı", "Ayşe")); console.log(await type("Üyenin e-postası", "ayse@ornek.com")); await submit();
  await has("T4N9RB", "Davet kodu oluştu");
  console.log(await click("Vazgeç")); await sleep(300);
  console.log(await click("Başka bütçeye geç")); await sleep(500); await has("Hangi bütçeyi açmak istersiniz?", "Başka bütçeye geç seçim ekranı");
  console.log(await click("Ev", "button.v3-gate-row")); await sleep(600);
  await evalJs("location.hash = 'settings'"); await sleep(400);
  console.log(await click("Hesaptan çık")); await sleep(500);
  await has("Bütçenizi takip edin", "Çıkıştan sonra giriş ekranı");
  await net("butceler");

  // Eski senaryo bozulmadı
  await open("dolu"); await check("Dolu özet"); await has("Serbest", "Dolu özet açıldı");
}
