// C2 · Harcama ekle: tutar → kategori (ya da geçmişten öneri) → Ekle. Hesap kendiliğinden gelir.
import { useMemo, useState } from "react";
import { Sheet, Icon } from "../components/ui.jsx";
import { defaultAccountFor } from "../../core/index.js";
import { favoritesFor } from "../selectors.js";

// "1.234,50" ya da "1234.5" → kuruş. Geçersizse null.
export function parseAmount(text) {
  const t = String(text).trim().replace(/\s/g, "").replace(/₺/g, "");
  if (!t) return null;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const v = Number(norm);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
}

export default function EkleSheet({ state, today, members, onClose, onAdd }) {
  const favs = useMemo(() => favoritesFor(state, today).slice(0, 4), [state, today]);
  const cats = Object.values(state.categories).filter(c => !c.archived).slice(0, 8);
  const self = Object.values(members).find(m => m.self) || Object.values(members)[0];
  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [who, setWho] = useState(self?.id);
  const [accountId, setAccountId] = useState(null);
  const accounts = Object.values(state.accounts);
  const acc = accountId || defaultAccountFor(state, categoryId);
  const amount = parseAmount(text);
  const canAdd = amount != null && !!categoryId;

  const pickFav = f => { setCategoryId(f.categoryId); setAccountId(f.accountId); };
  const cycleAccount = () => {
    const i = accounts.findIndex(a => a.id === acc);
    setAccountId(accounts[(i + 1) % accounts.length].id);
  };
  const submit = () => canAdd && onAdd({ amount, categoryId, accountId: acc, createdBy: who, note: state.categories[categoryId]?.name || "" });

  return (
    <Sheet onClose={onClose} label="Harcama ekle">
      <div className="sheet-head">
        <button onClick={onClose}>Vazgeç</button>
        <span className="b" style={{ fontSize: 17 }}>Harcama</span>
        <button onClick={submit} disabled={!canAdd} style={{ fontWeight: 600, opacity: canAdd ? 1 : .4 }}>Ekle</button>
      </div>

      <label className="amount">
        <span className="visually-hidden">Tutar</span>
        <input autoFocus inputMode="decimal" placeholder="0" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
        <span className="num c-2" style={{ fontSize: 28, fontWeight: 600 }}>₺</span>
      </label>

      {favs.length > 0 && (
        <div className="chips" role="group" aria-label="Geçmişten öneriler">
          {favs.map(f => (
            <button key={f.categoryId} className="chip" aria-pressed={categoryId === f.categoryId && acc === f.accountId} onClick={() => pickFav(f)}>
              {f.name} · {state.accounts[f.accountId]?.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid4" role="group" aria-label="Kategori">
        {cats.map(c => (
          <button key={c.id} className="cat" aria-pressed={categoryId === c.id} style={{ "--tc": `var(--${c.color || "gray"})` }} onClick={() => setCategoryId(c.id)}>
            <Icon name={c.icon || "more"} size={26} />{c.name}
          </button>
        ))}
      </div>

      <div className="row between">
        <div className="seg" role="group" aria-label="Kim harcadı" style={{ minWidth: 150 }}>
          {Object.values(members).map(m => (
            <button key={m.id} aria-pressed={who === m.id} onClick={() => setWho(m.id)} style={{ padding: "0 14px" }}>{m.self ? "Ben" : m.name}</button>
          ))}
        </div>
        <button className="row c-blue" style={{ gap: 4, minHeight: 44 }} onClick={cycleAccount} aria-label="Hesabı değiştir">
          <span className="t-sub c-blue">{state.accounts[acc]?.name}</span><Icon name="chev" size={16} />
        </button>
      </div>
    </Sheet>
  );
}
