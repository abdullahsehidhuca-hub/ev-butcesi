// Etiketleme: banka/ekstre açıklamasından kategori önerisi.
//
// Eski eşleştirmedeki hatalar ve buradaki karşılıkları:
//  - "MİGROS".toLowerCase() → "mi̇gros" (noktalı i ayrı karakter) olduğu için eşleşmiyordu.
//    → Türkçe küçük harfe çevirme + ç/ğ/ı/ö/ş/ü sadeleştirme ("İGDAŞ" = "igdas").
//  - Metin içinde her yerde arama yapıldığı için "axa" / "aski" gibi kısa anahtarlar
//    alakasız kelimelerin ortasında eşleşiyordu. → Yalnızca kelime BAŞINDA eşleşme.
//  - İlk bulunan kazanıyordu. → En uzun (en belirgin) anahtar kelime kazanır.
//  - Kullanıcının düzeltmesi unutuluyordu. → Satıcı adı öğrenilir ve önce o kullanılır.

const FOLD = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

export function normalizeText(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[çğıöşüâîû]/g, ch => FOLD[ch])
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Anahtar kelime metindeki bir kelimenin başından başlıyorsa eşleşir.
// "migros" → "migros sanal market" ✓ ; "aski" → "maskina" ✗
export function matchesKeyword(normText, keyword) {
  const kw = normalizeText(keyword);
  if (kw.length < 2) return false;
  return ` ${normText}`.includes(` ${kw}`);
}

// Satıcı anahtarı: rakam içermeyen ilk iki kelime ("MIGROS 4471 KONYA" → "migros konya").
// Şube/terminal numarası farklı olsa da aynı satıcı aynı anahtara düşer.
export function merchantKey(text) {
  const words = normalizeText(text).split(" ").filter(w => w.length > 1 && !/\d/.test(w));
  return words.slice(0, 2).join(" ") || null;
}

// Öneri: önce öğrenilmiş satıcı, sonra kategorilerin anahtar kelimeleri (en uzun kazanır).
// Dönüş: { categoryId, source: "learned" | "keyword", keyword? } ya da null.
export function suggestCategory(state, text) {
  const norm = normalizeText(text);
  if (!norm) return null;
  const key = merchantKey(text);
  const learned = key && state.merchantLabels?.[key];
  if (learned && state.categories[learned] && !state.categories[learned].archived) {
    return { categoryId: learned, source: "learned" };
  }
  let best = null;
  for (const c of Object.values(state.categories)) {
    if (c.archived) continue;
    for (const kw of c.keywords || []) {
      if (!matchesKeyword(norm, kw)) continue;
      const len = normalizeText(kw).length;
      if (!best || len > best.len) best = { categoryId: c.id, source: "keyword", keyword: kw, len };
    }
  }
  if (!best) return null;
  const { len, ...result } = best;
  return result;
}

// Kullanıcı bir işlemin kategorisini seçtiğinde/düzelttiğinde satıcıyı öğren.
export function learnCategory(state, text, categoryId) {
  const key = merchantKey(text);
  if (!key || !state.categories[categoryId]) return state;
  return { ...state, merchantLabels: { ...(state.merchantLabels || {}), [key]: categoryId } };
}
