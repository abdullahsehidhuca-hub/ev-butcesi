// Başlıktaki "Serbest" tutara dokununca açılan döküm (eski uygulamadaki Aylık bütçe /
// Bankadaki tutar / Bloke edilen tutar kutularının karşılığı). Bankadaki tutar uygulamanın kayıtlarına
// göre hesaplanır; bankadaki gerçek bakiyeyle karşılaştırma (reconcile) eksik ya da hatalı kaydı gösterir.
import { useState } from "react";
import { reconcile, recordReconciliation, adjustBalance, cardTransferSummary, markCardTransferred, carryoverOf } from "../../core/index.js";
import { Sheet, Field, Actions, ErrorText, Form } from "../ui.jsx";
import { parseBalance } from "../Sheets.jsx";
import { newId } from "../store.js";
import { balanceView, periodLabel, prevPeriod, fmt, dayNum, monthShort } from "../selectors.js";
import { choiceText } from "./DevredenSheet.jsx";

function Line({ label, value, note, strong, tone }) {
  return (
    <div className="stack gap2" style={{ padding: "6px 0" }}>
      <div className="row between" style={{ gap: 12 }}>
        <dt className={strong ? "t-body b" : "t-sub"} style={strong ? undefined : { color: "var(--label)" }}>{label}</dt>
        <dd className={`num t-body${strong ? " b" : ""}${tone ? ` ${tone}` : ""}`} style={{ margin: 0, whiteSpace: "nowrap" }}>{value}</dd>
      </div>
      {note && <span className="t-meta">{note}</span>}
    </div>
  );
}

// Karta aktarılmamış kredi kartı harcamaları (ilk hâldeki "karta aktarıldı" bayrağı). Banka bakiyesi
// tutmadığında ilk bakılacak yer burasıdır: aktarılmış ama işaretlenmemiş harcama farkı açıklar.
function CardTransfers({ state, commit, today, onToast }) {
  const [errors, setErrors] = useState(null);
  const sum = cardTransferSummary(state, today);
  const mark = ids => {
    const errs = commit(s => markCardTransferred(s, ids, today));
    if (errs) setErrors(errs); else { setErrors(null); onToast?.(ids.length > 1 ? `${ids.length} harcama karta aktarıldı olarak işaretlendi` : "Karta aktarıldı olarak işaretlendi"); }
  };
  return (
    <section aria-label="Karta aktarılmamış harcamalar">
      <span className="t-cap" style={{ padding: 0 }}>Karta aktarılmamış kart harcamaları</span>
      {!sum.list.length ? (
        <p className="t-sub" style={{ margin: "6px 0 0" }}>Tüm kredi kartı harcamaları karta aktarıldı olarak işaretli.</p>
      ) : (
        <>
          <p className="t-meta" style={{ margin: "6px 0" }}>
            {sum.list.length} harcama · toplam <span className="num">{fmt(sum.total)}</span>
            {sum.stale.length ? ` · ${sum.stale.length} tanesi 2 gündür ya da daha uzun süredir bekliyor` : ""}.
            {" "}Karşılığını bankadan karta aktardıysanız işaretleyin; bankadaki tutar farkı çoğu zaman buradan çıkar.
          </p>
          <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {sum.list.map(t => (
              <li key={t.id} className="row between" style={{ gap: 12, borderBottom: ".5px solid var(--sep)", padding: "4px 0" }}>
                <div className="stack gap2" style={{ minWidth: 0 }}>
                  <span className="t-sub ellipsis" style={{ color: "var(--label)" }}>{t.note || state.categories[t.categoryId]?.name || "Harcama"} · {state.accounts[t.accountId]?.name}</span>
                  <span className={`t-meta${t.days >= 2 ? " c-orange" : ""}`}>{dayNum(t.date)} {monthShort(t.date)} · <span className="num">{fmt(t.amount)}</span>{t.days >= 2 ? ` · ${t.days} gündür aktarılmadı` : ""}</span>
                </div>
                <button type="button" className="t-sub c-blue" style={{ minHeight: 44, minWidth: 44, fontWeight: 500, whiteSpace: "nowrap" }}
                  onClick={() => mark([t.id])} aria-label={`${t.note || "Harcama"} ${fmt(t.amount)}: karta aktarıldı`}>Aktarıldı</button>
              </li>
            ))}
          </ul>
          {sum.list.length > 1 && <button type="button" className="v3-link" style={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => mark(sum.list.map(t => t.id))}>Tümünü aktarıldı işaretle</button>}
          <ErrorText errors={errors} />
        </>
      )}
    </section>
  );
}

// Bir hesabı bankadaki gerçek bakiyeyle karşılaştırır. Tutuyorsa kaydedilir; tutmuyorsa fark ve son
// tutan karşılaştırmadan beri girilen işlem sayısı gösterilir, fark istenirse görünür düzeltmeyle kapatılır.
function Check({ state, commit, today, account, onDone }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState(null);
  const at = () => new Date().toISOString();

  const compare = () => {
    const actual = parseBalance(text);
    if (actual == null) return setErrors(["bakiyeyi girin, örneğin 26.845,44 ya da -150"]);
    setErrors(null);
    const r = reconcile(state, account.id, today, actual);
    setResult(r);
    if (r.matched) commit(s => recordReconciliation(s, r, at()));
  };
  const keep = () => { const errs = commit(s => recordReconciliation(s, result, at())); if (errs) setErrors(errs); else onDone("Fark not edildi; kayıtları kontrol edin"); };
  const fix = () => { const errs = commit(s => adjustBalance(s, result, { id: newId(), now: new Date() }).state); if (errs) setErrors(errs); else onDone(`${fmt(Math.abs(result.diff))} bakiye düzeltmesi kaydedildi`); };

  if (result?.matched) {
    return (
      <div className="stack gap8" role="status">
        <p className="t-body b c-green" style={{ margin: 0 }}>Tutuyor: {account.name} {fmt(result.app)}</p>
        <p className="t-sub" style={{ margin: 0 }}>Kayıtlarınız bankayla aynı. Karşılaştırma tarihi kaydedildi.</p>
        <button type="button" className="v3-link" onClick={() => onDone(null)}>Tamam</button>
      </div>
    );
  }
  if (result) {
    const more = result.diff > 0;
    const pending = cardTransferSummary(state, today);
    return (
      <div className="stack gap8" role="status">
        <dl style={{ margin: 0 }}>
          <Line label="Uygulamaya göre" value={fmt(result.app)} />
          <Line label="Bankada" value={fmt(result.actual)} />
          <Line label="Fark" value={`${more ? "+" : ""}${fmt(result.diff)}`} tone="c-red" strong
            note={more ? "Bankada daha fazla para var: girilmemiş bir gelir ya da fazla yazılmış bir harcama olabilir." : "Bankada daha az para var: girilmemiş bir harcama ya da ödeme olabilir."} />
        </dl>
        {pending.list.length > 0 && (
          <p className="t-meta c-orange" style={{ margin: 0 }}>
            Karta aktarıldı bayrağı eklenmemiş {pending.list.length} kart harcaması var (toplam {fmt(pending.total)}). Aşağıdaki listeden kontrol edin.
          </p>
        )}
        <p className="t-meta" style={{ margin: 0 }}>
          {result.since ? `Son tutan karşılaştırma ${dayNum(result.since)} ${monthShort(result.since)}; o günden beri` : "Hesap açılışından beri"} bu hesapta {result.movements.length} hareket var. Eksik kayıt bunların arasında değilse eklenmemiş bir işlem vardır.
        </p>
        <ErrorText errors={errors} />
        <div className="v3-actions" style={{ flexWrap: "wrap" }}>
          <button type="button" className="v3-cancel" style={{ flex: 1 }} onClick={keep}>Kayıtlara bakacağım</button>
          <button type="button" className="v3-submit" onClick={fix}>Farkı düzeltme olarak kaydet</button>
        </div>
        <p className="t-meta" style={{ margin: 0 }}>Düzeltme gizli değildir; Rapor'da "Bakiye düzeltme" olarak görünür.</p>
      </div>
    );
  }
  return (
    <Form onSubmit={compare}>
      <Field label={`${account.name} · bankadaki gerçek bakiye (₺)`} value={text} onChange={setText} inputMode="decimal" placeholder="0,00"
        hint="Banka uygulamanızdaki güncel bakiyeyi kuruşuyla yazın, örneğin 26.845,44." invalid={!!errors} />
      <ErrorText errors={errors} />
      <Actions submit="Karşılaştır" onCancel={() => onDone(null)} />
    </Form>
  );
}

export default function BakiyeSheet({ state, commit, today, onClose, onToast, onStatement, onToBudget, onCarryover }) {
  const [checking, setChecking] = useState(null);
  const v = balanceView(state, today);
  const b = v.bar;
  const account = v.banks.find(a => a.id === checking);
  const hasCard = Object.values(state.accounts).some(a => a.type === "credit");
  const carry = v.summary.carry || { in: 0, fromSavings: 0 };
  const cardLoad = v.summary.cardBudget?.load || 0;
  const estimate = carryoverOf(state, v.period).amount;
  // Son kapanan dönemin devredeni ve kararı (geri almak / değiştirmek için).
  const lastClosed = Object.keys(state.closedPeriods || {}).sort().at(-1);
  const last = lastClosed ? carryoverOf(state, lastClosed) : null;

  return (
    <Sheet title="Serbest tutar" onClose={onClose}>
      <div className="stack" style={{ gap: 18, margin: "0 4px" }}>
        <div className="stack gap2">
          <span className={`num t-big${v.available < 0 ? " c-red" : ""}`}>{fmt(v.available)}</span>
          <span className="t-sub">Bu dönem ödemeler, harcamalar ve bütçe ayrımı düşüldükten sonra serbest kalan.</span>
        </div>

        <section aria-label="Serbest tutarın hesabı">
          <span className="t-cap" style={{ padding: 0 }}>Nasıl hesaplandı</span>
          <dl style={{ margin: 0 }}>
            <Line label="Aylık bütçe (gelir)" value={`+${fmt(b.income)}`} note={b.received < b.income ? `${fmt(b.received)} alındı · ${fmt(b.income - b.received)} bekleniyor` : "Tamamı alındı"} />
            <Line label="Düzenli ödemeler" value={fmt(-b.obligations)} note={b.pending > 0 ? `${fmt(b.pending)} henüz ödenmedi` : "Hepsi ödendi ya da otomatik"} />
            <Line label="Harcandı" value={fmt(-b.spent)} />
            {cardLoad > 0 && <Line label="Kart ekstresi" value={fmt(-cardLoad)} note="Ödendiği ayın bütçesinden ödenen kartların bu dönemki ekstresi" />}
            {carry.in > 0 && <Line label={`${periodLabel(prevPeriod(v.period)).split(" ")[0]} açığı`} value={fmt(-carry.in)} note="Önceki dönemin açığı bu dönemden düşülsün dendi" />}
            {carry.fromSavings > 0 && <Line label="Birikimden aktarılan" value={`+${fmt(carry.fromSavings)}`} note="Gelir değil; birikimden serbest tutara aktarıldı" />}
            <Line label="Bütçelere ayrılan" value={fmt(-b.reserved)} note="Kategori limitlerinin henüz harcanmamış kısmı" />
            <div className="sum-line"><Line label="Serbest" value={fmt(b.safe)} strong /></div>
            <Line label="Tahmini devreden" value={`~${fmt(estimate)}`} tone={estimate < 0 ? "c-red" : undefined}
              note="Dönem kapanınca kesinleşir. Serbest tutara eklenmez; kapanışta birikime aktarma ya da açığı karşılama kararı sorulur." />
          </dl>
          {last && last.amount !== 0 && (
            <dl style={{ margin: 0 }}>
              <Line label={`${periodLabel(last.period)} devredeni`} value={fmt(last.amount)} tone={last.amount < 0 ? "c-red" : undefined} note={choiceText(last.decision)} />
            </dl>
          )}
          {last && last.amount !== 0 && onCarryover && <button type="button" className="v3-link" style={{ alignSelf: "flex-start", minHeight: 44, padding: 0 }} onClick={() => onCarryover(last.period)}>{last.pending ? "Devreden için karar ver" : "Devreden kararını gör ya da değiştir"}</button>}
          {onToBudget && <button type="button" className="v3-link" style={{ alignSelf: "flex-start", minHeight: 44, padding: 0 }} onClick={onToBudget}>Birikimden serbest tutara aktar</button>}
        </section>

        <section aria-label="Bankadaki tutar">
          <span className="t-cap" style={{ padding: 0 }}>Bankadaki tutar · kayıtlara göre</span>
          <dl style={{ margin: 0 }}>
            {v.banks.map(a => (
              <div key={a.id} className="stack" style={{ borderBottom: ".5px solid var(--sep)", paddingBottom: 4 }}>
                <Line label={a.name} value={fmt(a.balance)} tone={a.balance < 0 ? "c-red" : undefined}
                  note={a.lastCheck ? (a.lastCheck.diff === 0 ? `Bankayla tuttu · ${dayNum(a.lastCheck.date)} ${monthShort(a.lastCheck.date)}` : `Son karşılaştırmada ${fmt(a.lastCheck.diff)} fark · ${dayNum(a.lastCheck.date)} ${monthShort(a.lastCheck.date)}`) : "Henüz bankayla karşılaştırılmadı"} />
                {checking !== a.id && <button type="button" className="v3-link" style={{ alignSelf: "flex-start" }} onClick={() => setChecking(a.id)}>Bankayla karşılaştır</button>}
                {checking === a.id && account && <Check state={state} commit={commit} today={today} account={account} onDone={msg => { setChecking(null); if (msg) onToast(msg); }} />}
              </div>
            ))}
            <Line label="Toplam" value={fmt(v.bank)} strong />
            <Line label="Bloke edilen tutar" value={fmt(-v.blocked)} tone="c-orange"
              note={v.blockedItems.length ? `Bu dönem bu hesaplardan çıkacak: ${v.blockedItems.map(i => `${i.name} ${fmt(i.open)}`).join(" · ")}` : "Bu dönem çıkacak ödeme kalmadı"} />
            <div className="sum-line"><Line label="Bloke sonrası bankada kalan" value={fmt(v.afterBlocked)} strong tone={v.afterBlocked < 0 ? "c-red" : undefined} /></div>
          </dl>
          <p className="t-meta" style={{ margin: "6px 0 0" }}>
            Harcamalar bankadan yapıldığı için referans bankadır. Banka uygulamanızdaki bakiye buradakinden farklıysa eksik ya da yanlış girilmiş bir kayıt var demektir. Kredi kartı borcu bu toplamda yoktur; ekstresi bloke içinde düşülür.
          </p>
        </section>

        {hasCard && <CardTransfers state={state} commit={commit} today={today} onToast={onToast} />}
        {hasCard && onStatement && <button type="button" className="v3-link" style={{ alignSelf: "flex-start", minHeight: 44, padding: 0 }} onClick={onStatement}>Kart ekstresiyle eşitle</button>}

        <div className="v3-actions" style={{ marginTop: 0 }}>
          <button type="button" className="v3-submit" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </Sheet>
  );
}
