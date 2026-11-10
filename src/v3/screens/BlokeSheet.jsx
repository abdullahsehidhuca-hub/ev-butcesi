// Kart blokesi dökümü. Ana ekranda tek satır ("Kart blokesi: X ₺"); dokununca kart kart toplam bloke,
// kesim ve son ödeme tarihi; karta dokununca o kartın harcamaları (tarih, açıklama, tutar, taksit).
// Bloke: kart ödeme ayarı "harcandığı ayın bütçesinden" olan kalemler (src/core/cardBudget.js).
// "Ödendiği ayın bütçesinden" olan kartlarda bu dönem ödenecek ekstre ve gelecek dönem yükü gösterilir.
import { useState } from "react";
import { computePeriod } from "../../core/index.js";
import { Sheet } from "../ui.jsx";
import { categoryName, periodLabel, fmt, dayNum, monthShort } from "../selectors.js";

const day = d => `${dayNum(d)} ${monthShort(d)}`;

function Items({ state, items, empty }) {
  if (!items.length) return <p className="t-sub" style={{ margin: 0, padding: 16 }}>{empty}</p>;
  return (
    <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map(i => (
        <li key={i.key} className="li" style={{ minHeight: 52 }}>
          <span className="stack grow gap2" style={{ minWidth: 0 }}>
            <span className="t-body ellipsis">{i.name || categoryName(state, i.categoryId)}</span>
            <span className="t-meta">{day(i.date)}{i.total ? ` · Taksit ${i.index}/${i.total}` : i.kind === "auto" ? " · otomatik çekim" : i.kind === "refund" ? " · iade" : ""}{i.dueDate ? ` · son ödeme ${day(i.dueDate)}` : ""}</span>
          </span>
          <span className={`num t-body b${i.amount < 0 ? " c-green" : ""}`}>{i.amount < 0 ? `+${fmt(-i.amount)}` : fmt(i.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function BlokeSheet({ state, onClose, period }) {
  const [cardId, setCardId] = useState(null);
  const cb = computePeriod(state, period).cardBudget || { cards: [], blocked: 0, load: 0, pending: 0 };
  const card = cb.cards.find(c => c.accountId === cardId);

  if (card) {
    return (
      <Sheet title={`${card.name} · bloke`} onClose={onClose}>
        <button type="button" className="v3-link" style={{ minHeight: 44, padding: 0 }} onClick={() => setCardId(null)}>‹ Tüm kartlar</button>
        <span className="t-cap" style={{ padding: 0 }}>Bu dönem bloke · {fmt(card.blocked)}</span>
        <Items state={state} items={card.blockedItems} empty="Bu dönem bu kartla bloke edilen harcama yok." />
        {card.loadItems.length > 0 && <>
          <span className="t-cap" style={{ padding: 0 }}>Bu dönem ödenecek ekstre · {fmt(card.load)}</span>
          <Items state={state} items={card.loadItems} />
        </>}
        {card.pendingItems.length > 0 && <>
          <span className="t-cap" style={{ padding: 0 }}>Gelecek dönem yükü · {fmt(card.pending)}</span>
          <Items state={state} items={card.pendingItems} />
        </>}
        <div className="v3-actions"><button type="button" className="v3-submit" onClick={onClose}>Kapat</button></div>
      </Sheet>
    );
  }

  return (
    <Sheet title={`Kart blokesi · ${fmt(cb.blocked)}`} onClose={onClose}>
      <p className="v3-sheet-text">{periodLabel(period)} döneminde kartla yapılan ve bu dönemin bütçesinden ayrılan harcamalar. Ekstre ödenene kadar bu para kart için ayrılmış sayılır.</p>
      <section className="list" aria-label="Kartlar">
        {cb.cards.map(c => {
          const st = c.statements.at(-1);
          const sub = c.mode === "pay"
            ? `Ödendiği ayın bütçesinden · bu dönem ekstre ${fmt(c.load)}${c.pending ? ` · gelecek dönem ${fmt(c.pending)}` : ""}`
            : st ? `Kesim ${day(st.cutoff)} · son ödeme ${day(st.dueDate)}` : "Kesim günü girilmedi";
          return (
            <button key={c.accountId} type="button" className="li" style={{ minHeight: 52 }} onClick={() => setCardId(c.accountId)} aria-label={`${c.name}, bloke ${fmt(c.blocked)}. Harcamaları göster`}>
              <span className="stack grow gap2" style={{ minWidth: 0 }}>
                <span className="t-body">{c.name}</span>
                <span className="t-meta">{sub}</span>
              </span>
              <span className="num t-body b">{fmt(c.blocked)}</span>
            </button>
          );
        })}
        {!cb.cards.length && <p className="t-sub" style={{ margin: 0, padding: 16 }}>Kredi kartı eklenmedi.</p>}
      </section>
      <div className="v3-actions"><button type="button" className="v3-submit" onClick={onClose}>Kapat</button></div>
    </Sheet>
  );
}
