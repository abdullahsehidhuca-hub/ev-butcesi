// Kart ekstresi / dönem içi hareketlerle eşitleme. Ekstre metni yapıştırılır, CSV/metin dosyası ya da ekran
// görüntüsü seçilir (ekran görüntüsü cihazda, dış servise gönderilmeden okunur); tutarlar kuruşuyla okunur,
// kayıtlarla tam tutar + yakın tarih üzerinden eşleştirilir. Sonuç: kartta olup uygulamada olmayan, uygulamada
// olup kartta olmayan hareketler ve ekstredeki taksitlerden gelecek ay yükü. "Gelecek ay taksitleri" kipinde
// banka uygulamasındaki aylık taksit tutarları uygulamadaki kart taksit yüküyle kıyaslanır.
// PDF ekstre yapay zekâyla okunur (functions/ai/statement.js); oturum gerekir. Sonuç aynı satır biçimine çevrilir
// (parseAiStatement) ve aynı eşitlemeden geçer. Arayüzde neyin nereye gönderildiği anlatılmaz (Abdullah, 2026-11-12).
import { useMemo, useState } from "react";
import {
  parseStatementText, parseStatementCells, reconcileStatement, statementInstallmentPlan, importStatementRows,
  parseFutureInstallments, compareFutureInstallments, parseAiStatement
} from "../../core/index.js";
import { Sheet, SelectField, ErrorText } from "../ui.jsx";
import { newId } from "../store.js";
import { callAi, pdfPayload } from "../ai.js";
import { fmt, periodLabel, dayNum, monthShort } from "../selectors.js";

const when = d => `${dayNum(d)} ${monthShort(d)}`;
const noDot = m => String(m || "").replace(/\.$/, "");

function RowLine({ date, text, amount, extra }) {
  return (
    <li className="row between" style={{ gap: 12, borderBottom: ".5px solid var(--sep)", padding: "6px 0" }}>
      <span className="stack gap2" style={{ minWidth: 0 }}>
        <span className="t-sub ellipsis" style={{ color: "var(--label)" }}>{text || "Açıklamasız"}</span>
        <span className="t-meta">{when(date)}{extra ? ` · ${extra}` : ""}</span>
      </span>
      <span className="num t-sub" style={{ whiteSpace: "nowrap" }}>{fmt(amount)}</span>
    </li>
  );
}

function Block({ title, note, children, count }) {
  return (
    <section aria-label={title} style={{ marginTop: 14 }}>
      <span className="t-cap" style={{ padding: 0 }}>{title}{count != null ? ` · ${count}` : ""}</span>
      {note && <p className="t-meta" style={{ margin: "4px 0" }}>{note}</p>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{children}</ul>
    </section>
  );
}

const MODES = [
  { value: "statement", label: "Ekstre ve hareketler" },
  { value: "future", label: "Gelecek ay taksitleri" }
];

export default function EkstreSheet({ state, commit, today, onClose, onToast, aiUser, onLogin }) {
  const cards = Object.values(state.accounts).filter(a => a.type === "credit").sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const [accountId, setAccountId] = useState(cards[0]?.id || "");
  const [mode, setMode] = useState("statement");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [future, setFuture] = useState(null);
  const [errors, setErrors] = useState(null);
  const [ocr, setOcr] = useState(null); // { stage, progress } okuma sürerken

  const result = useMemo(() => {
    if (!parsed?.rows.length || !accountId) return null;
    try { return reconcileStatement(state, accountId, parsed.rows); } catch (e) { return { error: e.errors || [e.message] }; }
  }, [parsed, accountId, state]);
  const plan = useMemo(() => {
    if (!result || result.error) return [];
    const linked = Object.fromEntries(result.installments.filter(i => i.obligationId).map(i => [i.row.line, true]));
    return statementInstallmentPlan(state, parsed.rows, { linked });
  }, [result, parsed, state]);
  const futureCmp = useMemo(() => (future?.months.length && accountId ? compareFutureInstallments(state, accountId, future.months) : null), [future, accountId, state]);

  if (!cards.length) {
    return (
      <Sheet title="Kart ekstresiyle eşitle" onClose={onClose}>
        <p className="v3-sheet-text">Eşitleme için önce Ayarlar’dan bir kredi kartı ekleyin.</p>
        <div className="v3-actions"><button type="button" className="v3-submit" onClick={onClose}>Tamam</button></div>
      </Sheet>
    );
  }

  const changeMode = m => { setMode(m); setParsed(null); setFuture(null); setErrors(null); };
  const compare = (raw = text) => {
    if (mode === "future") {
      const f = parseFutureInstallments(raw, { today });
      setFuture(f); setParsed(null);
      setErrors(f.months.length ? null : ["metinde ay ve tutar içeren satır bulunamadı"]);
    } else {
      const p = parseStatementText(raw);
      setParsed(p); setFuture(null);
      setErrors(p.rows.length ? null : ["metinde tarih ve tutar içeren satır bulunamadı"]);
    }
  };
  const onImage = async file => {
    setErrors(null); setParsed(null); setFuture(null);
    setOcr({ stage: "Okuma motoru yükleniyor", progress: 0 });
    try {
      const { recognizeImage } = await import("../ocr.js");
      const raw = await recognizeImage(file, setOcr);
      setText(raw.trim());
      if (!raw.trim()) setErrors(["görüntüde okunabilir yazı bulunamadı. Daha net ya da yakınlaştırılmış bir ekran görüntüsü deneyin"]);
      else compare(raw);
    } catch (e) {
      setErrors([`görüntü okunamadı (${e?.message || e}). Satırları elle de yapıştırabilirsiniz`]);
    } finally {
      setOcr(null);
    }
  };
  // PDF ekstre: yapay zekâ yalnız harcama satırlarını döndürür (ödeme ve iadeler gelmez).
  const onPdf = async file => {
    setErrors(null); setParsed(null); setFuture(null);
    if (!aiUser) return setErrors([onLogin
      ? "PDF ekstreyi okumak için Ayarlar’dan aile hesabına giriş yapın. Satırları kopyalayıp yapıştırabilirsiniz de"
      : "örnek veri modunda PDF ekstre okunmaz. Satırları kopyalayıp yapıştırabilirsiniz"]);
    setOcr({ stage: "Ekstre okunuyor, 1–2 dakika sürebilir", progress: null });
    try {
      const data = await callAi(aiUser, "analyzeStatement", await pdfPayload(file));
      const p = parseAiStatement(data.transactions);
      setText("");
      setParsed(p);
      setErrors(p.rows.length ? null : ["ekstrede harcama satırı bulunamadı"]);
    } catch (e) {
      setErrors([noDot(e?.message || e)]);
    } finally {
      setOcr(null);
    }
  };
  const onFile = async file => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (mode !== "future" && (file.type === "application/pdf" || /\.pdf$/.test(name))) return onPdf(file);
    if (file.type.startsWith("image/") || /\.(png|jpe?g|heic|webp)$/.test(name)) return onImage(file);
    if (/\.(csv|txt|tsv)$/.test(name)) {
      const raw = await file.text();
      if (mode === "future") { setText(raw); return compare(raw); }
      let p;
      if (/\.csv$/.test(name)) {
        const Papa = (await import("papaparse")).default;
        p = parseStatementCells(Papa.parse(raw, { skipEmptyLines: true }).data);
      } else p = parseStatementText(raw);
      setText("");
      setParsed(p);
      setErrors(p.rows.length ? null : ["dosyada tarih ve tutar içeren satır bulunamadı"]);
    } else {
      setErrors(["bu dosya türü henüz doğrudan okunamıyor. PDF ya da Excel ekstresinin ekran görüntüsünü seçin, satırları kopyalayıp aşağıya yapıştırın ya da Excel’i CSV olarak kaydedin"]);
    }
  };
  const importMissing = () => {
    const rows = result.onlyStatement;
    let out;
    const errs = commit(s => { out = importStatementRows(s, accountId, rows, { newId, now: new Date(`${today}T12:00:00`) }); return out.state; });
    if (errs) return setErrors(errs);
    onToast?.(`${out.added.length} hareket eklendi${out.skipped.length ? `, ${out.skipped.length} atlandı` : ""}`);
    if (out.skipped.length) setErrors(out.skipped.map(x => `${when(x.row.date)} ${fmt(x.row.amount)}: ${x.reason}`));
  };
  const importInstallments = () => {
    const rows = result.installments.filter(i => !i.obligationId).map(i => i.row);
    let out;
    const errs = commit(s => { out = importStatementRows(s, accountId, rows, { newId, now: new Date(`${today}T12:00:00`) }); return out.state; });
    if (errs) return setErrors(errs);
    onToast?.(`${out.added.length} taksit kalemi eklendi`);
    if (out.skipped.length) setErrors(out.skipped.map(x => `${when(x.row.date)} ${fmt(x.row.amount)}: ${x.reason}`));
  };

  const r = result && !result.error ? result : null;
  const newInstallments = r ? r.installments.filter(i => !i.obligationId) : [];
  const busy = !!ocr;
  const futureMode = mode === "future";

  return (
    <Sheet title="Kart ekstresiyle eşitle" onClose={onClose}>
      <SelectField label="Kart" value={accountId} onChange={setAccountId} options={cards.map(c => ({ value: c.id, label: c.name }))} />
      <fieldset className="v3-field">
        <legend className="v3-label">Ne yükleyeceksiniz?</legend>
        <div className="v3-pills is-wrap">
          {MODES.map(m => (
            <button key={m.value} type="button" className="v3-chip" aria-pressed={mode === m.value} onClick={() => changeMode(m.value)}>{m.label}</button>
          ))}
        </div>
      </fieldset>
      <div className="v3-field">
        <label className="v3-label" htmlFor="ekstre-metin">{futureMode ? "Aylara göre taksit tutarları" : "Ekstre ya da hesap hareketleri"}</label>
        <textarea id="ekstre-metin" className="v3-input" rows={6} value={text} onChange={e => setText(e.target.value)} disabled={busy}
          placeholder={futureMode
            ? "Her satırda ay ve tutar olsun. Örnek:\nAralık 2026 3.450,25\nOcak 2027 1.200,00"
            : "Her satırda tarih, açıklama ve tutar olsun. Örnek:\n05.11.2026 MIGROS 1.234,56\n01.11.2026 TEKNOSA 3/6 1.500,00"}
          style={{ minHeight: 120, resize: "vertical", fontFamily: "inherit" }} aria-describedby="ekstre-ipucu" />
        <p className="v3-hint" id="ekstre-ipucu">
          {futureMode
            ? "Banka uygulamasındaki gelecek dönem taksitleri ekranının görüntüsünü seçin ya da satırları yapıştırın. Okunan metni karşılaştırmadan önce düzeltebilirsiniz."
            : "PDF ekstre ya da ekran görüntüsü seçin, veya banka uygulamasındaki hareket satırlarını yapıştırın. Tutarlar kuruşuyla okunur, yuvarlanmaz. “3/6” gibi yazılan satırlar taksit sayılır."}
        </p>
      </div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", margin: "0 4px" }}>
        <button type="button" className="pill blue" style={{ minHeight: 44, justifyContent: "center" }} onClick={() => compare()} disabled={!text.trim() || busy}>Karşılaştır</button>
        <label className="v3-link" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", cursor: busy ? "default" : "pointer" }}>
          PDF, ekran görüntüsü ya da dosya seç
          <input type="file" accept="image/*,.csv,.txt,.tsv,.pdf,.xlsx,.xls" className="visually-hidden" disabled={busy}
            onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      {ocr && (
        <div style={{ margin: "10px 4px 0" }} role="status" aria-live="polite">
          <p className="t-meta" style={{ margin: "0 0 6px" }}>{ocr.stage}…{ocr.progress != null ? ` %${Math.round(ocr.progress * 100)}` : ""}</p>
          {ocr.progress != null && <div className="v3-track" aria-hidden="true"><div className="v3-fill" style={{ width: `${Math.round(ocr.progress * 100)}%` }} /></div>}
        </div>
      )}
      <ErrorText errors={errors || result?.error} />

      {futureCmp && (
        <div style={{ margin: "0 4px" }} role="region" aria-label="Taksit karşılaştırması">
          <p className="t-sub" role="status" style={{ margin: "14px 0 0" }}>
            {futureCmp.length} ay okundu. {futureCmp.every(m => !m.diff) ? "Her ayın taksit tutarı uygulamadakiyle eşit." : "Farklı olan aylar turuncu gösterilir."}
          </p>
          <Block title="Banka ile uygulama" note="Fark artıysa uygulamada girilmemiş taksit var; eksiyse uygulamada bitmiş ya da fazla taksit kayıtlı.">
            {futureCmp.map(m => (
              <li key={m.period} className="row between" style={{ gap: 12, borderBottom: ".5px solid var(--sep)", padding: "6px 0" }}>
                <span className="stack gap2">
                  <span className="t-sub" style={{ color: "var(--label)" }}>{periodLabel(m.period)}</span>
                  <span className="t-meta">Uygulamada <span className="num">{fmt(m.app)}</span></span>
                </span>
                <span className="stack gap2" style={{ alignItems: "flex-end" }}>
                  <span className="num t-sub" style={{ whiteSpace: "nowrap" }}>{fmt(m.bank)}</span>
                  <span className={`t-meta num${m.diff ? " c-orange" : ""}`} style={{ whiteSpace: "nowrap" }}>{m.diff ? `fark ${m.diff > 0 ? "+" : "-"}${fmt(Math.abs(m.diff))}` : "eşit"}</span>
                </span>
              </li>
            ))}
          </Block>
        </div>
      )}

      {r && (
        <div style={{ margin: "0 4px" }} role="region" aria-label="Eşitleme sonucu">
          <p className="t-sub" role="status" style={{ margin: "14px 0 0" }}>
            {parsed.rows.length} satır okundu{parsed.skipped ? ` (${parsed.skipped} satır başlık ya da toplam diye atlandı)` : ""} · {when(r.range.from)} – {when(r.range.to)}.
            {" "}Ekstrede harcama <span className="num">{fmt(r.totals.statement)}</span>, uygulamada aynı aralıkta <span className="num">{fmt(r.totals.app)}</span>
            {r.totals.diff ? <> · fark <b className="num c-orange">{fmt(r.totals.diff)}</b></> : " · tutarlar eşit"}.
          </p>

          <Block title="Kartta var, uygulamada yok" count={r.onlyStatement.length}
            note={r.onlyStatement.length ? "Bu hareketler hiç girilmemiş ya da farklı tutarla girilmiş." : "Ekstredeki her harcama uygulamada var."}>
            {r.onlyStatement.map(x => <RowLine key={x.line} date={x.date} text={x.description} amount={x.amount} />)}
          </Block>
          {r.onlyStatement.length > 0 && <button type="button" className="v3-link" style={{ minHeight: 44 }} onClick={importMissing}>Bunları uygulamaya ekle</button>}

          <Block title="Uygulamada var, kartta yok" count={r.onlyApp.length}
            note={r.onlyApp.length ? "Yanlış karta, yanlış tutarla girilmiş ya da henüz ekstreye düşmemiş olabilir." : "Uygulamadaki her kart harcaması ekstrede var."}>
            {r.onlyApp.map(t => <RowLine key={t.id} date={t.date} text={t.note} amount={t.amount} />)}
          </Block>

          <Block title="Eşleşen" count={r.matched.length}>
            {r.matched.map(m => <RowLine key={m.row.line} date={m.row.date} text={m.tx.note || m.row.description} amount={m.row.amount}
              extra={[m.dayShift ? `${m.dayShift} gün kaymalı` : null, m.tx.cardTransferredAt ? "karta aktarıldı" : "aktarım işaretsiz"].filter(Boolean).join(" · ")} />)}
          </Block>

          {r.installments.length > 0 && (
            <Block title="Taksitler" count={r.installments.length}
              note={newInstallments.length ? `${newInstallments.length} taksit uygulamada kayıtlı değil; eklerseniz gelecek ay planına girer.` : "Ekstredeki taksitlerin hepsi uygulamada kayıtlı."}>
              {r.installments.map(i => <RowLine key={i.row.line} date={i.row.date} text={i.row.description} amount={i.row.amount}
                extra={`${i.row.installment.index}/${i.row.installment.total}${i.obligationId ? " · kayıtlı" : " · kayıtlı değil"}`} />)}
            </Block>
          )}
          {newInstallments.length > 0 && <button type="button" className="v3-link" style={{ minHeight: 44 }} onClick={importInstallments}>Kayıtlı olmayan taksitleri ekle</button>}

          {r.credits.length > 0 && (
            <Block title="Ödeme ve iadeler" count={r.credits.length}>
              {r.credits.map(c => <RowLine key={c.row.line} date={c.row.date} text={c.row.description} amount={c.row.amount} extra={c.tx ? "uygulamada var" : "uygulamada yok"} />)}
            </Block>
          )}

          {plan.length > 0 && (
            <Block title="Ekstreye göre gelecek ay taksit yükü">
              {plan.map(m => (
                <li key={m.period} className="row between" style={{ gap: 12, borderBottom: ".5px solid var(--sep)", padding: "6px 0" }}>
                  <span className="stack gap2">
                    <span className="t-sub" style={{ color: "var(--label)" }}>{periodLabel(m.period)}</span>
                    <span className="t-meta">{m.items.length} taksit{m.unrecorded ? ` · ${fmt(m.unrecorded)} uygulamada kayıtlı değil` : ""}</span>
                  </span>
                  <span className="num t-sub" style={{ whiteSpace: "nowrap" }}>{fmt(m.total)}</span>
                </li>
              ))}
            </Block>
          )}
        </div>
      )}

      <div className="v3-actions" style={{ marginTop: 14 }}>
        <button type="button" className="v3-submit" onClick={onClose}>Kapat</button>
      </div>
    </Sheet>
  );
}
