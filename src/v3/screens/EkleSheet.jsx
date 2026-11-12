// Hızlı harcama (taslak C2): tutar → kategori (ya da geçmişten öneri) → Ekle. Hesap kategoride son
// kullanılandan gelir; açıklama yazılırsa kategori önerilir, kullanıcının seçimi öğrenilir.
// Açıklamanın altındaki "Fiş yükle" satırı fiş fotoğrafını yapay zekâyla okur (functions/ai/receipt.js): tutar ve
// mağaza adı doldurulur, kayıt yine kullanıcının "Ekle"siyle yapılır. Fişin kalemleriyle ne yapılacağı ayrı iştir.
import { useMemo, useState } from "react";
import { Sheet, Icon } from "../components/ui.jsx";
import { quickAdd, defaultAccountFor, suggestCategory, learnCategory } from "../../core/index.js";
import { favoritesFor } from "../selectors.js";
import { parseAmount, amountText } from "../format.js";
import { receiptDraft } from "../aiData.js";
import { callAi, imagePayload } from "../ai.js";
import { newId } from "../store.js";

// Kayıt anı: ekranın "bugün" tarihi + şimdiki saat (örnek veri modunda tarih sabittir).
const nowOn = day => new Date(`${day}T${new Date().toTimeString().slice(0, 8)}`);
const AMOUNT_HINT = "Tutarı girin, örneğin 345 ya da 1.250,50.";

export default function EkleSheet({ state, today, members = {}, commit, onClose, onNeedAccount, onSaved, aiUser }) {
  const accounts = Object.values(state.accounts);
  const cats = useMemo(() => Object.values(state.categories).filter(c => !c.archived).sort((a, b) => a.name.localeCompare(b.name, "tr")), [state.categories]);
  const favs = useMemo(() => favoritesFor(state, today).filter(f => state.categories[f.categoryId] && state.accounts[f.accountId]).slice(0, 4), [state, today]);
  const memberList = Object.values(members);
  const self = memberList.find(m => m.self) || memberList[0];
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [picked, setPicked] = useState(false);
  const [who, setWho] = useState(self?.id);
  const [accountId, setAccountId] = useState(null);
  const [errors, setErrors] = useState(null);
  const [scan, setScan] = useState(false);
  const [info, setInfo] = useState(null);

  if (!accounts.length) {
    return (
      <Sheet onClose={onClose} label="Harcama ekle">
        <div className="sheet-head">
          <button type="button" onClick={onClose}>Vazgeç</button>
          <span className="b" style={{ fontSize: 17 }}>Harcama</span>
          <span style={{ width: 60 }} />
        </div>
        <p className="t-sub" style={{ margin: 0 }}>Harcamanın hangi hesaptan çıktığını bilmemiz gerekiyor. Önce bir banka hesabı ya da kart ekleyin.</p>
        <button type="button" className="pill blue" style={{ justifyContent: "center", minHeight: 50, borderRadius: 14, fontSize: 17 }} onClick={onNeedAccount}>Hesap ekle</button>
      </Sheet>
    );
  }

  const acc = accountId || defaultAccountFor(state, categoryId) || accounts[0].id;
  const amount = parseAmount(text);
  // Kategori yoksa kategorisiz kaydedilir; varsa seçim istenir (en fazla 2 adım).
  const canAdd = amount != null && (!!categoryId || !cats.length);

  const pickCategory = id => { setCategoryId(id); setPicked(true); };
  const pickFav = f => { pickCategory(f.categoryId); setAccountId(f.accountId); };
  const onNote = v => {
    setNote(v);
    if (!picked) setCategoryId(suggestCategory(state, v)?.categoryId ?? null);
  };
  const onReceipt = async file => {
    if (!file || scan) return;
    setErrors(null); setInfo(null); setScan(true);
    try {
      const d = receiptDraft(await callAi(aiUser, "analyzeReceipt", await imagePayload(file)));
      if (!d.amount) throw new Error("Fişte toplam tutar okunamadı. Tutarı elle girin.");
      setText(amountText(d.amount));
      if (d.store) onNote(d.store);
      setInfo(`Fişten okundu${d.fromItems ? " (toplam, kalemlerden hesaplandı)" : ""}. Tutarı kontrol edip kategoriyi seçin.`);
    } catch (e) {
      setErrors([e?.message || "Fiş okunamadı."]);
    }
    setScan(false);
  };
  const cycleAccount = () => {
    const i = accounts.findIndex(a => a.id === acc);
    setAccountId(accounts[(i + 1) % accounts.length].id);
  };
  const submit = () => {
    if (amount == null) return setErrors([AMOUNT_HINT]);
    if (!canAdd) return setErrors(["Bir kategori seçin."]);
    const typed = note.trim();
    const errs = commit(s => {
      let next = quickAdd(s, { amount, categoryId, accountId: acc, note: typed || state.categories[categoryId]?.name || "" },
        { id: newId(), now: nowOn(today), ...(who ? { userId: who } : {}) }).state;
      if (categoryId && typed) next = learnCategory(next, typed, categoryId);
      return next;
    });
    if (errs) setErrors(errs.map(e => e.charAt(0).toLocaleUpperCase("tr-TR") + e.slice(1)));
    else { onSaved?.(amount); onClose(); }
  };

  return (
    <Sheet onClose={onClose} label="Harcama ekle">
      <form className="stack" style={{ gap: 14 }} noValidate onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="sheet-head">
          <button type="button" onClick={onClose}>Vazgeç</button>
          <span className="b" style={{ fontSize: 17 }}>Harcama</span>
          <button type="submit" aria-disabled={!canAdd} style={{ fontWeight: 600, minWidth: 44, textAlign: "right", opacity: canAdd ? 1 : .4 }}>Ekle</button>
        </div>

        <label className="amount">
          <span className="visually-hidden">Tutar (₺)</span>
          <input autoFocus inputMode="decimal" placeholder="0" value={text} aria-invalid={errors && amount == null ? "true" : undefined}
            onChange={e => { setText(e.target.value); setErrors(null); }} />
          <span className="num c-2" style={{ fontSize: 28, fontWeight: 600 }} aria-hidden="true">₺</span>
        </label>

        <label className="note">
          <span className="visually-hidden">Açıklama</span>
          <input value={note} placeholder="Açıklama, örn: Migros" onChange={e => onNote(e.target.value)} />
        </label>

        {aiUser && (
          <label className="fis-row" aria-busy={scan ? "true" : undefined}>
            <Icon name="receipt" size={20} />
            <span className="grow" aria-live="polite">{scan ? "Fiş okunuyor…" : "Fiş yükle"}</span>
            {!scan && <span className="t-meta">tutar ve mağaza dolar</span>}
            <input type="file" accept="image/*" className="visually-hidden" disabled={scan}
              onChange={e => { onReceipt(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        )}
        {info && <p className="t-meta" role="status" style={{ margin: 0 }}>{info}</p>}

        {favs.length > 0 && (
          <div className="chips" role="group" aria-label="Geçmişten öneriler">
            {favs.map(f => (
              <button key={`${f.categoryId}:${f.accountId}`} type="button" className="chip" aria-pressed={categoryId === f.categoryId && acc === f.accountId} onClick={() => pickFav(f)}>
                {state.categories[f.categoryId].name} · {state.accounts[f.accountId].name}
              </button>
            ))}
          </div>
        )}

        {cats.length > 0 ? (
          <div className="grid4" role="group" aria-label="Kategori">
            {cats.map(c => (
              <button key={c.id} type="button" className="cat" aria-pressed={categoryId === c.id} style={{ "--tc": `var(--${c.color || "gray"})` }} onClick={() => pickCategory(categoryId === c.id ? null : c.id)}>
                <Icon name={c.icon || "tag"} size={26} /><span className="ellipsis" style={{ maxWidth: "100%", padding: "0 4px" }}>{c.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="t-meta" style={{ margin: 0 }}>Henüz kategori yok; Ayarlar’dan ekleyebilirsiniz. Kategorisiz de kaydedilir.</p>
        )}

        <div className="row between" style={{ flexWrap: "wrap" }}>
          {memberList.length > 1 ? (
            <div className="seg" role="group" aria-label="Kim harcadı" style={{ minWidth: 150 }}>
              {memberList.map(m => (
                <button key={m.id} type="button" aria-pressed={who === m.id} onClick={() => setWho(m.id)} style={{ padding: "0 14px" }}>{m.self ? "Ben" : m.name}</button>
              ))}
            </div>
          ) : <span className="t-meta">{accountId ? "Hesap" : "Kategoride son kullanılan hesap"}</span>}
          {accounts.length > 1
            ? <button type="button" className="row c-blue" style={{ gap: 4, minHeight: 44 }} onClick={cycleAccount} aria-label={`Hesap: ${state.accounts[acc]?.name}. Değiştir`}>
                <span className="t-sub c-blue">{state.accounts[acc]?.name}</span><Icon name="chev" size={16} />
              </button>
            : <span className="t-sub">{state.accounts[acc]?.name}</span>}
        </div>

        {errors && <p className="v3-error" role="alert" style={{ margin: 0 }}>{errors.join(" ")}</p>}
      </form>
    </Sheet>
  );
}
