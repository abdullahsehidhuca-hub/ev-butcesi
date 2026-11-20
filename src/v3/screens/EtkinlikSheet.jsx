// Kısa süreli bütçe (kamp, tatil, gezi): ev bütçesinden ayrı, kendi üyeleri olan harcama listesi.
// Ortak harcama (split): herkes ödediğini girer; toplam eşit paylaşılır, kimin kime ne göndereceği gösterilir.
// Tatil bütçesi (trip): toplam bütçeden her harcama düşer; kalan ve günlük harcanabilir tutar görünür.
// Firebase'i doğrudan kullanır (src/v3/events.js); V3App tembel yükler. Hesap kuralları src/core/events.js'tedir.
import { useEffect, useState } from "react";
import { EVENT_CATEGORIES, eventCategoryName, eventExpenses, eventSummary, settleUp, eventEnded } from "../../core/events.js";
import { Sheet, Field, SelectField, Chips, Actions, ErrorText, Form } from "../ui.jsx";
import { parseAmount } from "../format.js";
import { fmt, dayNum, monthShort } from "../selectors.js";
import { authMessage, normalizeCode } from "../family.js";
import { listMyEvents, createEvent, createEventInvite, joinEvent, watchEvent, addEventExpense, deleteEventExpense, leaveEvent, hideEvent } from "../events.js";

const KINDS = [
  { value: "split", label: "Ortak harcama", sub: "Kamp, ev arkadaşları: herkes ödediğini girer, sonunda kimin kime ne göndereceği çıkar" },
  { value: "trip", label: "Tatil bütçesi", sub: "Toplam bütçeden her harcama düşer; kalanı ve günlük tutarı görürsünüz" }
];
const METHODS = [{ value: "cash", label: "Nakit" }, { value: "card", label: "Kart" }];
const errText = e => e?.errors || [authMessage(e)];
const dateText = d => `${dayNum(d)} ${monthShort(d)}`;
const addDays = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);

function Line({ label, value, strong, tone }) {
  return (
    <div className="row between" style={{ gap: 12, padding: "4px 0" }}>
      <span className={strong ? "t-body b" : "t-sub"} style={strong ? undefined : { color: "var(--label)" }}>{label}</span>
      <span className={`num t-body${strong ? " b" : ""}${tone ? ` ${tone}` : ""}`} style={{ whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

// ── Liste ──────────────────────────────────────────────────────────────────────
function List({ user, today, onOpen, onNew, onJoin }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { listMyEvents(user).then(setEvents, e => setError(errText(e))); }, [user]);
  if (error) return <ErrorText errors={error} />;
  if (!events) return <p className="t-sub" role="status" style={{ margin: 0, minHeight: 120 }}>Yükleniyor…</p>;
  const list = Object.entries(events).map(([id, e]) => ({ id, ...e })).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  const active = list.filter(e => !(e.end < today));
  const past = list.filter(e => e.end < today);
  const row = e => (
    <button key={e.id} type="button" className="li" onClick={() => onOpen(e.id, e.name)}>
      <span className="stack grow gap2">
        <span className="t-body b">{e.name}</span>
        <span className="t-meta">{e.kind === "trip" ? "Tatil bütçesi" : "Ortak harcama"} · {dateText(e.start)} – {dateText(e.end)}{e.role === "owner" ? " · siz kurdunuz" : ""}</span>
      </span>
    </button>
  );
  return (
    <div className="stack gap8">
      <p className="v3-sheet-text">Kamp, tatil ya da gezi için ev bütçenizden ayrı bir bütçe. Katılanlar kendi telefonundan harcama girer.</p>
      {active.length > 0 && <section className="list" aria-label="Süren bütçeler">{active.map(row)}</section>}
      {!list.length && <p className="t-sub" style={{ margin: 0 }}>Henüz kısa süreli bütçeniz yok.</p>}
      <div className="v3-actions" style={{ marginTop: 0, flexWrap: "wrap" }}>
        <button type="button" className="v3-cancel" style={{ flex: 1 }} onClick={onJoin}>Katılım kodum var</button>
        <button type="button" className="v3-submit" style={{ flex: 1 }} onClick={onNew}>Yeni bütçe kur</button>
      </div>
      {past.length > 0 && (
        <details className="why">
          <summary className="t-sub">Biten bütçeler · {past.length}</summary>
          <section className="list" aria-label="Biten bütçeler">{past.map(row)}</section>
        </details>
      )}
    </div>
  );
}

// ── Kurma ──────────────────────────────────────────────────────────────────────
function NewEvent({ user, today, onDone, onBack }) {
  const [kind, setKind] = useState("split");
  const [name, setName] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 2));
  const [budget, setBudget] = useState("");
  const [errors, setErrors] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErrors(null);
    try { onDone(await createEvent(user, { kind, name, start, end, budget: kind === "trip" ? parseAmount(budget) : undefined })); }
    catch (e) { setErrors(errText(e)); setBusy(false); }
  };
  return (
    <Form onSubmit={save}>
      <fieldset className="v3-field">
        <legend className="v3-label">Bütçe türü</legend>
        <div className="list">
          {KINDS.map(k => (
            <label key={k.value} className="li" style={{ cursor: "pointer" }}>
              <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} />
              <span className="stack grow gap2"><span className="t-body b">{k.label}</span><span className="t-meta">{k.sub}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Adı" value={name} onChange={setName} placeholder={kind === "trip" ? "Örn: Bodrum tatili" : "Örn: Kaş kampı"} />
      <Field label="Başlangıç" type="date" value={start} onChange={setStart} />
      <Field label="Bitiş" type="date" value={end} onChange={setEnd} />
      {kind === "trip" && <Field label="Toplam bütçe (₺)" value={budget} onChange={setBudget} inputMode="decimal" placeholder="Örn: 30.000"
        hint="Nakit ve kartla harcayacağınız toplam tutar. Her harcama bundan düşer." />}
      <ErrorText errors={errors} />
      <Actions submit={busy ? "Kuruluyor…" : "Kur"} onCancel={onBack} disabled={busy} />
    </Form>
  );
}

// ── Kodla katılma ──────────────────────────────────────────────────────────────
function JoinEvent({ user, onDone, onBack }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState(user.displayName || "");
  const [errors, setErrors] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const c = normalizeCode(code);
    if (c.length !== 6) return setErrors(["size gönderilen 6 karakterli kodu yazın"]);
    setBusy(true); setErrors(null);
    try {
      const id = await joinEvent(user, c, name);
      if (id) onDone(id); else { setErrors(["bu kod geçersiz ya da süresi dolmuş; bütçeyi kurandan yeni kod isteyin"]); setBusy(false); }
    } catch (e) { setErrors(errText(e)); setBusy(false); }
  };
  return (
    <Form onSubmit={save}>
      <Field label="Katılım kodu" value={code} onChange={setCode} placeholder="Örn: K7M2QX" autoComplete="off" />
      <Field label="Diğerleri sizi hangi adla görsün?" value={name} onChange={setName} placeholder="Örn: Ayşe" />
      <ErrorText errors={errors} />
      <Actions submit={busy ? "Katılınıyor…" : "Katıl"} onCancel={onBack} disabled={busy} />
    </Form>
  );
}

// ── Harcama ekleme ─────────────────────────────────────────────────────────────
function AddExpense({ user, id, event, today }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("food");
  const [method, setMethod] = useState("card");
  const [paidBy, setPaidBy] = useState(user.uid);
  const [errors, setErrors] = useState(null);
  const [busy, setBusy] = useState(false);
  const members = Object.entries(event.members || {}).map(([uid, m]) => ({ value: uid, label: uid === user.uid ? `${m.name} (siz)` : m.name }));
  const save = async () => {
    setBusy(true); setErrors(null);
    try {
      await addEventExpense(user, id, event, { amount: parseAmount(amount) || 0, note, category, method, paidBy, date: today });
      setAmount(""); setNote("");
    } catch (e) { setErrors(errText(e)); }
    setBusy(false);
  };
  return (
    <section aria-label="Harcama ekle" className="stack">
      <span className="t-cap" style={{ padding: 0 }}>Harcama ekle</span>
      <Form onSubmit={save}>
        <Field label="Tutar (₺)" value={amount} onChange={setAmount} inputMode="decimal" placeholder="0,00" />
        <Field label="Açıklama (isteğe bağlı)" value={note} onChange={setNote} placeholder="Örn: Akşam yemeği" />
        <Chips label="Kategori" value={category} options={EVENT_CATEGORIES.map(c => ({ value: c.id, label: c.name }))} onChange={v => v && setCategory(v)} wrap />
        <Chips label="Nasıl ödendi?" value={method} options={METHODS} onChange={v => v && setMethod(v)} />
        {members.length > 1 && <SelectField label="Kim ödedi?" value={paidBy} onChange={setPaidBy} options={members} />}
        <ErrorText errors={errors} />
        <div className="v3-actions" style={{ marginTop: 0 }}>
          <button type="submit" className="v3-submit" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
        </div>
      </Form>
    </section>
  );
}

// ── Ayrıntı ────────────────────────────────────────────────────────────────────
function Detail({ user, id, today, onBack, onToast, onExport, exported }) {
  const [event, setEvent] = useState(undefined);
  const [error, setError] = useState(null);
  const [invite, setInvite] = useState(null);
  useEffect(() => watchEvent(id, setEvent, e => setError(errText(e))), [id]);
  if (error) return <><ErrorText errors={error} /><button type="button" className="v3-link" onClick={onBack}>Listeye dön</button></>;
  if (event === undefined) return <p className="t-sub" role="status" style={{ margin: 0, minHeight: 160 }}>Yükleniyor…</p>;
  if (!event?.meta) return <><p className="t-sub">Bu bütçe bulunamadı ya da artık üyesi değilsiniz.</p><button type="button" className="v3-link" onClick={() => hideEvent(user, id).then(onBack)}>Listemden kaldır</button></>;

  const m = event.meta;
  const owner = m.ownerUid === user.uid;
  const members = event.members || {};
  const name = uid => members[uid]?.name || "Ayrılan üye";
  const s = eventSummary(event, today);
  const list = eventExpenses(event);
  const settle = m.kind === "split" ? settleUp(event) : null;
  const memberCount = Object.keys(members).length;
  const ended = eventEnded(event, today);
  const mine = list.filter(e => e.paidBy === user.uid && !exported?.has(e.id));

  const makeCode = async () => {
    try { setInvite(await createEventInvite(user, id)); } catch (e) { setError(errText(e)); }
  };
  const remove = async e => {
    if (!confirm(`${fmt(e.amount)} tutarındaki harcama silinsin mi?`)) return;
    try { await deleteEventExpense(id, e.id); onToast?.("Harcama silindi"); } catch (err) { setError(errText(err)); }
  };
  const leave = async () => {
    if (!confirm(owner ? "Bu bütçe listenizden kaldırılsın mı? Diğer üyeler kullanmaya devam eder." : "Bu bütçeden ayrılınsın mı? Girdiğiniz harcamalar bütçede kalır.")) return;
    try { await (owner ? hideEvent(user, id) : leaveEvent(user, id)); onBack(); } catch (e) { setError(errText(e)); }
  };

  return (
    <div className="stack gap8">
      <p className="t-meta" style={{ margin: 0 }}>{m.kind === "trip" ? "Tatil bütçesi" : "Ortak harcama"} · {dateText(m.start)} – {dateText(m.end)}{ended ? " · bitti" : ""} · {memberCount} kişi</p>

      <section className="card" aria-label="Özet">
        {m.kind === "trip" ? <>
          <div className="row between baseline"><span className="t-sub b">Kalan</span>{s.perDay != null && <span className="t-sub">günde {fmt(s.perDay)} · {s.daysLeft} gün</span>}</div>
          <span className={`num t-big${s.left < 0 ? " c-red" : ""}`}>{fmt(s.left)}</span>
          <Line label="Bütçe" value={fmt(s.budget)} />
          <Line label="Harcanan" value={fmt(s.total)} />
          <Line label="Bugün harcanan" value={fmt(s.spentToday)} />
          <Line label="Nakit · kart" value={`${fmt(s.byMethod.cash)} · ${fmt(s.byMethod.card)}`} />
        </> : <>
          <span className="t-sub b">Toplam harcama</span>
          <span className="num t-big">{fmt(s.total)}</span>
          {memberCount > 1 && <Line label="Kişi başı" value={fmt(Math.floor(s.total / memberCount))} />}
          <Line label="Nakit · kart" value={`${fmt(s.byMethod.cash)} · ${fmt(s.byMethod.card)}`} />
        </>}
      </section>

      {!ended && <AddExpense user={user} id={id} event={event} today={today} />}

      {s.count > 0 && (
        <section aria-label="Neye ne kadar harcandı">
          <span className="t-cap" style={{ padding: 0 }}>Neye ne kadar harcandı</span>
          {Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]).map(([c, v]) => <Line key={c} label={eventCategoryName(c)} value={fmt(v)} />)}
        </section>
      )}

      {settle && memberCount > 1 && s.count > 0 && (
        <section aria-label="Hesaplaşma">
          <span className="t-cap" style={{ padding: 0 }}>Hesaplaşma · kim kime ne gönderecek</span>
          {settle.transfers.length
            ? settle.transfers.map(t => <Line key={`${t.from}-${t.to}`} label={`${name(t.from)} → ${name(t.to)}`} value={fmt(t.amount)} strong={t.from === user.uid || t.to === user.uid} />)
            : <p className="t-sub" style={{ margin: "4px 0" }}>Herkes payını ödemiş; kimsenin kimseye borcu yok.</p>}
          <p className="t-meta" style={{ margin: "4px 0 0" }}>Toplam {memberCount} kişiye eşit bölünür. Ödediğiniz {fmt(settle.paid[user.uid] || 0)}, payınız {fmt(settle.share[user.uid] || 0)}.</p>
        </section>
      )}

      <section aria-label="Harcamalar">
        <span className="t-cap" style={{ padding: 0 }}>Harcamalar · {s.count}</span>
        {!list.length && <p className="t-sub" style={{ margin: "4px 0" }}>Henüz harcama yok. İlk harcamayı yukarıdan ekleyin.</p>}
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {list.map(e => (
            <li key={e.id} className="row between" style={{ gap: 12, borderBottom: ".5px solid var(--sep)", padding: "4px 0" }}>
              <span className="stack gap2" style={{ minWidth: 0 }}>
                <span className="t-sub ellipsis" style={{ color: "var(--label)" }}>{e.note || eventCategoryName(e.category)} · <span className="num">{fmt(e.amount)}</span></span>
                <span className="t-meta">{dateText(e.date)} · {name(e.paidBy)} · {e.method === "card" ? "Kart" : "Nakit"}</span>
              </span>
              {(owner || e.createdBy === user.uid) && (
                <button type="button" className="t-sub c-red" style={{ minHeight: 44, minWidth: 44, fontWeight: 500 }} onClick={() => remove(e)} aria-label={`${e.note || eventCategoryName(e.category)} ${fmt(e.amount)}: sil`}>Sil</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {onExport && mine.length > 0 && (
        <section aria-label="Ev bütçesine ekle" className="stack gap2">
          <p className="t-meta" style={{ margin: 0 }}>Kendi ödediğiniz {mine.length} harcama ({fmt(mine.reduce((a, e) => a + e.amount, 0))}) ev bütçenizde yok. Eklerseniz kart harcamaları kartınıza, nakit harcamalar nakit ya da varsayılan hesabınıza yazılır.</p>
          <button type="button" className="v3-link" style={{ alignSelf: "flex-start", minHeight: 44, padding: 0 }} onClick={() => onExport(id, m.name, mine)}>Harcamalarımı ev bütçesine ekle</button>
        </section>
      )}

      <section aria-label="Katılanlar">
        <span className="t-cap" style={{ padding: 0 }}>Katılanlar</span>
        {Object.entries(members).map(([uid, mm]) => <Line key={uid} label={`${mm.name}${uid === m.ownerUid ? " · kurdu" : ""}${uid === user.uid ? " (siz)" : ""}`} value={fmt(s.byPayer[uid] || 0)} />)}
        {owner && !ended && (invite
          ? <p className="t-body" role="status" style={{ margin: "8px 0 0" }}>Katılım kodu: <b className="num" style={{ letterSpacing: 2 }}>{invite.code}</b><br /><span className="t-meta">7 gün geçerli. Kodu bilen herkes katılabilir; yalnız katılmasını istediklerinize gönderin.</span></p>
          : <button type="button" className="v3-link" style={{ minHeight: 44, padding: 0 }} onClick={makeCode}>Katılım kodu oluştur</button>)}
      </section>

      <div className="v3-actions" style={{ marginTop: 0, flexWrap: "wrap" }}>
        <button type="button" className="v3-cancel" style={{ flex: 1 }} onClick={leave}>{owner ? "Listemden kaldır" : "Bütçeden ayrıl"}</button>
        <button type="button" className="v3-submit" style={{ flex: 1 }} onClick={onBack}>Listeye dön</button>
      </div>
    </div>
  );
}

// start: "new" ile açılırsa doğrudan kurma formu gelir (karşılamadaki "Kısa süreli bütçe kur").
// onExport(id, name, expenses): ev bütçesi varsa kendi harcamalarını ev bütçesine ekler; exported: eklenmiş harcama kimlikleri.
export default function EtkinlikSheet({ user, today, onClose, onToast, start, onExport, exportedOf }) {
  const [view, setView] = useState(start === "new" ? { name: "new" } : { name: "list" });
  const [title, setTitle] = useState(null);
  const back = () => { setView({ name: "list" }); setTitle(null); };
  const titles = { list: "Kısa süreli bütçeler", new: "Kısa süreli bütçe kur", join: "Kısa süreli bütçeye katıl", detail: title || "Kısa süreli bütçe" };
  if (!user) {
    return <Sheet title="Kısa süreli bütçeler" onClose={onClose}><p className="v3-sheet-text">Kısa süreli bütçeyi diğer katılanlarla paylaşmak için üye hesabınızla giriş yapın.</p></Sheet>;
  }
  const openDetail = (id, name) => { setTitle(name || null); setView({ name: "detail", id }); };
  return (
    <Sheet title={titles[view.name]} onClose={onClose}>
      {view.name === "list" && <List user={user} today={today} onOpen={openDetail} onNew={() => setView({ name: "new" })} onJoin={() => setView({ name: "join" })} />}
      {view.name === "new" && <NewEvent user={user} today={today} onBack={back} onDone={id => { onToast?.("Bütçe kuruldu; katılım kodunu aşağıdan oluşturun"); openDetail(id); }} />}
      {view.name === "join" && <JoinEvent user={user} onBack={back} onDone={id => { onToast?.("Bütçeye katıldınız"); openDetail(id); }} />}
      {view.name === "detail" && <Detail key={view.id} user={user} id={view.id} today={today} onBack={back} onToast={onToast} onExport={onExport} exported={exportedOf?.(view.id)} />}
    </Sheet>
  );
}
