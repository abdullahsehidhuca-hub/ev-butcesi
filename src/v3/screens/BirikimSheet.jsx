// Birikim: varlıklar (TL, döviz, gram altın) ve TL karşılıkları, kur girişi, para ayırma / döviz-altın alma /
// bozdurma (moveFunds) ve hedefler (birikim hedefi, acil durum fonu). Motor: src/core/savings.js + carryover.js.
// Kurlar kullanıcı tarafından elle girilir (dış servis yok); kapanmış dönemler kendi kurlarını dondurur.
import { useState } from "react";
import { moveFunds, setRates, addGoal, updateGoal, deleteGoal, formatUnits, balanceOf, toBase } from "../../core/index.js";
import { Sheet, Field, SelectField, Chips, ErrorText, Actions, Form } from "../ui.jsx";
import { Tile, Icon } from "../components/ui.jsx";
import { parseAmount, amountText } from "../format.js";
import { newId } from "../store.js";
import { savingsView, fmt } from "../selectors.js";

const UNIT = { TRY: "₺", USD: "$", EUR: "€", XAU: "gram" };
const RATE_CURRENCIES = [["USD", "Dolar", "1 $ kaç ₺"], ["EUR", "Euro", "1 € kaç ₺"], ["XAU", "Gram altın", "1 gram kaç ₺"]];
const GOAL_KIND_OPTIONS = [{ value: "saving", label: "Birikim hedefi" }, { value: "emergency", label: "Acil durum fonu" }];
const balanceText = (state, a, today) => (a.currency === "TRY" ? fmt(balanceOf(state, a.id, today)) : formatUnits(balanceOf(state, a.id, today), a.currency));
const rateText = r => (r ? amountText(Math.round(r * 100)) : "");
const iconOf = a => (a.currency === "XAU" ? "spark" : a.currency !== "TRY" ? "cash" : a.type === "cash" ? "cash" : "wallet");
const colorOf = a => (a.currency === "XAU" ? "orange" : a.currency !== "TRY" ? "green" : a.type === "cash" ? "teal" : "blue");

// Hedef ilerleme satırı (Birikim çekmecesi ve Rapor'da aynı).
export function GoalRow({ g, onClick }) {
  const color = g.kind === "emergency" ? "red" : "green";
  const sub = g.missingRates.length ? `${g.missingRates.join(", ")} kuru eksik` : g.reached ? "Hedefe ulaşıldı"
    : g.monthlyNeeded != null ? (g.overdue ? `Hedef tarihi geçti · ${fmt(g.left)} kaldı` : `Ayda ${fmt(g.monthlyNeeded)} · ${g.periodsLeft} ay`) : `${fmt(g.left)} kaldı`;
  const body = (
    <>
      <Tile icon={g.kind === "emergency" ? "alert" : "spark"} color={color} />
      <span className="stack grow" style={{ gap: 6, minWidth: 0 }}>
        <span className="row between"><span className="t-body ellipsis">{g.name}</span><span className="num c-2" style={{ fontSize: 14, whiteSpace: "nowrap" }}>{fmt(g.saved)} / {fmt(g.target)}</span></span>
        <span className="track"><i style={{ width: `${g.percent}%`, background: `var(--${color})` }} /></span>
        <span className={`t-meta${g.overdue ? " c-red" : ""}`}>%{g.percent} · {sub}</span>
      </span>
      {onClick && <Icon name="chev" size={14} style={{ color: "var(--label3)", flex: "none" }} />}
    </>
  );
  if (!onClick) return <div className="li">{body}</div>;
  return <button type="button" className="li" onClick={onClick} aria-label={`${g.name}: yüzde ${g.percent}, ${fmt(g.saved)} birikti, hedef ${fmt(g.target)}. Düzenle`}>{body}</button>;
}

// ── Birikim çekmecesi ──────────────────────────────────────────────────────────
// open({ name }): alt çekmeceler (al/sat, hedef, hesap ekle); onToBudget: birikimden serbest tutara aktar.
export default function BirikimSheet({ state, commit, onClose, today, open, onToBudget, onToast }) {
  const v = savingsView(state, today);
  const [rates, setRatesText] = useState(() => Object.fromEntries(RATE_CURRENCIES.map(([c]) => [c, rateText(v.rates[c])])));
  const [errors, setErrors] = useState(null);
  const usedCurrencies = new Set(v.assets.list.map(a => a.currency));
  const rateRows = RATE_CURRENCIES.filter(([c]) => usedCurrencies.has(c) || v.rates[c]);
  const dirty = rateRows.some(([c]) => rates[c] !== rateText(v.rates[c]));

  const saveRates = () => {
    const next = {};
    for (const [c, name] of rateRows) {
      const t = rates[c].trim();
      if (!t) { next[c] = null; continue; }
      const minor = parseAmount(t);
      if (!minor) return setErrors([`${name} kurunu rakamla yazın, örneğin 34,25`]);
      next[c] = minor / 100;
    }
    const errs = commit(s => setRates(s, next));
    if (errs) return setErrors(errs);
    setErrors(null);
    onToast?.("Kurlar kaydedildi");
  };

  return (
    <Sheet title="Birikim" onClose={onClose}>
      <div className="stack" style={{ gap: 18, margin: "0 4px" }}>
        <div className="stack gap2">
          <span className="num t-big">{fmt(v.savingsTotal)}</span>
          <span className="t-sub">{v.savingsAccounts.length ? `Harcama hesabı dışındaki ${v.savingsAccounts.length} hesabın bugünkü TL karşılığı.` : "Henüz birikim hesabı yok."}{v.assets.missingRates.length ? ` ${v.assets.missingRates.join(", ")} kuru girilmediği için o varlıklar toplama katılmadı.` : ""}</span>
        </div>

        {v.savingsAccounts.length > 0 && (
          <section aria-label="Varlıklar">
            <span className="t-cap" style={{ padding: 0 }}>Varlıklar</span>
            <div className="list" style={{ "--inset": "64px", marginTop: 6 }}>
              {v.savingsAccounts.map(a => {
                const acc = state.accounts[a.accountId];
                return (
                  <div className="li" key={a.accountId}>
                    <Tile icon={iconOf(acc)} color={colorOf(acc)} />
                    <span className="stack grow gap2">
                      <span className="t-body ellipsis">{a.name}</span>
                      <span className="t-meta">{a.currency === "TRY" ? "Türk lirası" : a.tl != null ? `${formatUnits(a.balance, a.currency)} · kurla` : `${formatUnits(a.balance, a.currency)} · kur eksik`}</span>
                    </span>
                    <span className={`num t-body b${a.balance < 0 ? " c-red" : ""}`}>{a.tl != null ? fmt(a.tl) : "—"}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {v.savingsAccounts.length > 0 ? (
            <>
              <button type="button" className="pill blue" onClick={() => open({ name: "move", mode: "buy" })}>Para ayır / al</button>
              <button type="button" className="pill ghost" onClick={() => open({ name: "move", mode: "sell" })}>Bozdur</button>
              {onToBudget && <button type="button" className="v3-link" style={{ padding: 0 }} onClick={onToBudget}>Serbest tutara aktar</button>}
            </>
          ) : (
            <button type="button" className="pill blue" onClick={() => open({ name: "account", back: { name: "savings" } })}>Birikim hesabı ekle</button>
          )}
        </div>

        {rateRows.length > 0 && (
          <section aria-label="Kurlar">
            <span className="t-cap" style={{ padding: 0 }}>Kurlar</span>
            <p className="t-meta" style={{ margin: "4px 0 10px" }}>Bankanızın gösterdiği alış kurunu yazın; TL karşılıkları buna göre hesaplanır. Kapanmış dönemler kendi kurunu korur.</p>
            <Form onSubmit={saveRates}>
              {rateRows.map(([c, name, hint]) => (
                <Field key={c} label={`${name} (${hint})`} value={rates[c]} onChange={t => setRatesText(r => ({ ...r, [c]: t }))} inputMode="decimal" placeholder="0,00" />
              ))}
              <ErrorText errors={errors} />
              <button type="submit" className="v3-submit" style={{ width: "100%" }} disabled={!dirty}>Kurları kaydet</button>
            </Form>
          </section>
        )}

        <section aria-label="Hedefler">
          <div className="row between"><span className="t-cap" style={{ padding: 0 }}>Hedefler</span>
            <button type="button" className="t-sub c-blue" style={{ minHeight: 44, fontWeight: 500 }} onClick={() => open({ name: "goal" })}>Hedef ekle</button></div>
          {v.goals.length > 0 && (
            <div className="list" style={{ "--inset": "64px", marginTop: 6 }}>
              {v.goals.map(g => <GoalRow key={g.goalId} g={g} onClick={() => open({ name: "goal", id: g.goalId })} />)}
            </div>
          )}
          {!v.hasEmergency && v.emergency.monthly > 0 && (
            <button type="button" className="v3-alert" style={{ textAlign: "left", width: "100%", marginTop: 10 }} onClick={() => open({ name: "goal", preset: { kind: "emergency", name: "Acil durum fonu", target: v.emergency.target } })}>
              <strong>Acil durum fonu önerisi · {fmt(v.emergency.target)}</strong>
              {v.emergency.months} aylık zorunlu gider (düzenli ödemeler + kategori limitleri = ayda {fmt(v.emergency.monthly)}).
              <span className="t-sub c-blue" style={{ fontWeight: 600 }}>Hedef olarak ekle</span>
            </button>
          )}
          {!v.goals.length && (v.hasEmergency || v.emergency.monthly <= 0) && <p className="t-sub" style={{ margin: "6px 0 0" }}>Hedef yok. Bir hedef ekleyip birikim hesaplarını bağlayın; ilerleme hesap bakiyelerinden hesaplanır.</p>}
        </section>
      </div>
    </Sheet>
  );
}

// ── Para ayır / döviz-altın al / bozdur ───────────────────────────────────────
// mode "buy": TL hesabından birikim hesabına; "sell": birikim hesabından TL hesabına. Yön değiştirilebilir.
export function AlSatSheet({ state, commit, onClose, today, mode = "buy", onToast }) {
  const v = savingsView(state, today);
  const accounts = Object.values(state.accounts).filter(a => a.type !== "credit" && !a.archived).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const savings = accounts.filter(a => a.id !== v.main);
  const [fromAccountId, setFrom] = useState(mode === "buy" ? v.main : savings[0]?.id || "");
  const [toAccountId, setTo] = useState(mode === "buy" ? savings[0]?.id || "" : v.main);
  const [amount, setAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState(null);
  const from = state.accounts[fromAccountId];
  const to = state.accounts[toAccountId];
  const foreign = from && to && from.currency !== to.currency;
  const minor = parseAmount(amount);
  const tl = from && minor ? toBase(minor, from.currency, v.rates) : null;
  const rateOf = to && to.currency !== "TRY" ? v.rates[to.currency] : null;
  const estimate = foreign && minor && tl != null ? (to.currency === "TRY" ? tl : rateOf ? Math.round(tl / rateOf) : null) : null;
  const balance = from ? balanceOf(state, from.id, today) : 0;

  const save = () => {
    if (!from || !to) return setErrors(["hesapları seçin"]);
    if (!minor) return setErrors([`tutarı girin (${UNIT[from.currency]})`]);
    const into = foreign && toAmount.trim() ? parseAmount(toAmount) : undefined;
    if (foreign && toAmount.trim() && !into) return setErrors([`alınan miktarı rakamla yazın (${UNIT[to.currency]})`]);
    if (foreign && !into && estimate == null) return setErrors([`${to.currency === "TRY" ? from.currency : to.currency} kuru girilmemiş; alınan miktarı yazın`]);
    const errs = commit(s => moveFunds(s, { fromAccountId, toAccountId, amount: minor, toAmount: into, note, id: newId(), date: today, now: new Date() }).state);
    if (errs) return setErrors(errs);
    onToast?.(foreign ? (to.currency === "TRY" ? "Bozduruldu" : `${formatUnits(into || estimate, to.currency)} alındı`) : "Birikime aktarıldı");
    onClose();
  };

  return (
    <Sheet title={mode === "buy" ? "Para ayır / döviz-altın al" : "Bozdur"} onClose={onClose}>
      <p className="v3-sheet-text">Gelir ya da gider sayılmaz, serbest tutara dokunmaz; yalnız hesaplar arasında yer değiştirir. Aynı para biriminde aktarım, farklı birimde alım-satım kaydı oluşur.</p>
      <Form onSubmit={save}>
        <SelectField label="Hangi hesaptan" value={fromAccountId} onChange={setFrom}
          options={accounts.map(a => ({ value: a.id, label: `${a.name} · ${balanceText(state, a, today)}` }))} />
        <Field label={`Çıkan tutar (${UNIT[from?.currency] || "₺"})`} value={amount} onChange={setAmount} inputMode="decimal" placeholder="0"
          hint={from && from.currency !== "TRY" ? (tl != null ? `Girilen kura göre yaklaşık ${fmt(tl)}.` : `${from.currency} kuru girilmemiş.`) : null} invalid={!!errors} />
        <SelectField label="Hangi hesaba" value={toAccountId} onChange={setTo}
          options={accounts.filter(a => a.id !== fromAccountId).map(a => ({ value: a.id, label: `${a.name} · ${balanceText(state, a, today)}` }))} />
        {foreign && <Field label={`Giren miktar (${UNIT[to.currency]})`} value={toAmount} onChange={setToAmount} inputMode="decimal" placeholder={estimate != null ? amountText(estimate) : "0"}
          hint={estimate != null ? `Boş bırakılırsa kurdan hesaplanır: ${formatUnits(estimate, to.currency)}. Bankanın verdiği gerçek miktarı yazmanız daha doğru olur.` : "Kur girilmediği için zorunlu."} />}
        <Field label="Açıklama (isteğe bağlı)" value={note} onChange={setNote} placeholder={foreign ? "Örn: Garanti'den dolar alımı" : "Örn: Kasım birikimi"} />
        {minor > balance && from && <p className="v3-alert" role="status" style={{ margin: "8px 0" }}><strong>Bakiye yetmiyor</strong>{from.name} hesabında {balanceText(state, from, today)} var; işlemden sonra eksiye düşer.</p>}
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
      </Form>
    </Sheet>
  );
}

// ── Hedef ekle / düzenle ───────────────────────────────────────────────────────
// id: düzenlenen hedef; preset: öneriden gelen ön değerler (acil durum fonu).
export function HedefSheet({ state, commit, onClose, today, id, preset, onToast }) {
  const existing = id ? state.goals?.[id] : null;
  const v = savingsView(state, today);
  const accounts = Object.values(state.accounts).filter(a => a.type !== "credit" && !a.archived).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const defaults = existing || preset || {};
  const [name, setName] = useState(defaults.name || "");
  const [kind, setKind] = useState(defaults.kind || "saving");
  const [target, setTarget] = useState(defaults.target ? amountText(defaults.target) : "");
  const [targetDate, setTargetDate] = useState(defaults.targetDate || "");
  const [accountIds, setAccountIds] = useState(() => defaults.accountIds || v.savingsAccounts.map(a => a.accountId));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState(null);
  const toggle = accId => setAccountIds(ids => (ids.includes(accId) ? ids.filter(x => x !== accId) : [...ids, accId]));
  const saved = accountIds.reduce((s, accId) => { const a = state.accounts[accId]; const tl = a ? toBase(balanceOf(state, accId, today), a.currency, v.rates) : null; return s + (tl || 0); }, 0);

  const save = () => {
    if (!name.trim()) return setErrors(["hedefin adını yazın"]);
    const minor = parseAmount(target);
    if (!minor) return setErrors(["hedef tutarı rakamla yazın, örneğin 150.000"]);
    if (!accountIds.length) return setErrors(["en az bir birikim hesabı seçin; ilerleme o hesapların bakiyesinden hesaplanır"]);
    // Temizlenen tarih null yazılır (undefined buluta yazılamaz; null kaydı siler).
    const rec = { name: name.trim(), kind, target: minor, accountIds, targetDate: targetDate || null };
    const errs = commit(s => (existing ? updateGoal(s, id, rec) : addGoal(s, { id: newId(), ...rec })));
    if (errs) return setErrors(errs);
    onToast?.(existing ? "Hedef güncellendi" : "Hedef eklendi");
    onClose();
  };
  const remove = () => {
    const errs = commit(s => deleteGoal(s, id));
    if (errs) return setErrors(errs);
    onToast?.("Hedef silindi");
    onClose();
  };

  if (confirmDelete) {
    return (
      <Sheet title="Hedefi sil" onClose={() => setConfirmDelete(false)}>
        <p className="v3-sheet-text">"{existing?.name}" hedefi silinir; bağlı hesaplar ve paraları olduğu gibi kalır.</p>
        <Form onSubmit={remove}><ErrorText errors={errors} /><Actions submit="Sil" onCancel={() => setConfirmDelete(false)} danger /></Form>
      </Sheet>
    );
  }

  return (
    <Sheet title={existing ? "Hedefi düzenle" : "Hedef ekle"} onClose={onClose}>
      <Form onSubmit={save}>
        <Field label="Hedef adı" value={name} onChange={setName} placeholder="Örn: Tatil, Araba, Acil durum fonu" />
        <Chips label="Tür" value={kind} options={GOAL_KIND_OPTIONS} onChange={k => k && setKind(k)} wrap />
        <Field label="Hedef tutar (₺)" value={target} onChange={setTarget} inputMode="decimal" placeholder="0"
          hint={kind === "emergency" && v.emergency.monthly > 0 ? `Öneri: ${v.emergency.months} aylık zorunlu gider = ${fmt(v.emergency.target)}.` : null} />
        <Field label="Hedef tarihi (isteğe bağlı)" value={targetDate} onChange={setTargetDate} type="date" hint="Girilirse ayda ne kadar ayırmanız gerektiği gösterilir." />
        <fieldset className="v3-field">
          <legend className="v3-label">Bağlı birikim hesapları</legend>
          {accounts.length ? accounts.map(a => (
            <label key={a.id} className="v3-check">
              <input type="checkbox" checked={accountIds.includes(a.id)} onChange={() => toggle(a.id)} />
              <span className="grow ellipsis">{a.name}{a.id === v.main ? " · harcama hesabı" : ""}</span>
              <span className="num t-meta">{balanceText(state, a, today)}</span>
            </label>
          )) : <p className="v3-hint">Önce Ayarlar'dan bir hesap ekleyin.</p>}
          <p className="v3-hint">Seçili hesapların bugünkü toplamı: {fmt(saved)}. Hedefe biriken tutar bu bakiyelerden hesaplanır.</p>
        </fieldset>
        <ErrorText errors={errors} />
        <Actions submit="Kaydet" onCancel={onClose} />
        {existing && <button type="button" className="v3-cancel c-red" style={{ width: "100%", marginTop: 10 }} onClick={() => setConfirmDelete(true)}>Hedefi sil</button>}
      </Form>
    </Sheet>
  );
}

