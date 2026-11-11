// Devreden karar ekranı: dönem kapanınca artan ya da açık kalan para için çoktan seçmeli karar.
// Devreden serbest tutara eklenmez; seçenekler ve kuralları çekirdekte (src/core/carryover.js).
// Birikime aktar / birikimden karşıla / borç aldım seçilirse ikinci adımda tutar, cins ve hesap sorulur.
// Verilmiş karar burada görünür ve geri alınıp yeniden seçilebilir (oluşan kayıtlar da silinir).
import { useState } from "react";
import {
  addAccount, carryoverOf, carryoverCardWarning, decideCarryover, undoCarryover, balanceOf, ratesOf, toBase, formatUnits, CARRYOVER_GOAL_ID
} from "../../core/index.js";
import { Sheet, Field, SelectField, Chips, ErrorText, Actions, Form } from "../ui.jsx";
import { parseAmount, amountText } from "../format.js";
import { newId } from "../store.js";
import { mainAccountId, periodLabel, nextPeriod, fmt } from "../selectors.js";

const monthOf = p => periodLabel(p).split(" ")[0];
const KINDS = [{ value: "TRY", label: "TL" }, { value: "USD", label: "Dolar" }, { value: "EUR", label: "Euro" }, { value: "XAU", label: "Altın (gram)" }];
const UNIT = { TRY: "₺", USD: "$", EUR: "€", XAU: "gram" };
const NEW = "_new";

// Verilmiş kararın kısa açıklaması (özet ve bakiye dökümünde).
export const CHOICE_TEXT = {
  saving: amount => amount > 0 ? "Birikime aktarıldı" : "Birikimden karşılandı",
  later: () => "Karar bekliyor",
  ignore: () => "Kayıt hatası; yok sayıldı",
  nextBudget: () => "Sonraki ayın bütçesinden düşüldü",
  debt: () => "Borç alındı; borçlara eklendi",
  ignoreError: () => "Kayıt hatası; yok sayıldı",
  ignoreOk: () => "Sorun değil; yok sayıldı"
};
export const choiceText = d => d ? CHOICE_TEXT[d.choice]?.(d.amount) || d.choice : "Karar verilmedi";

function surplusOptions(c) {
  return [
    { value: "saving", title: "Birikime aktarılsın", sub: "TL, döviz ya da altın olarak birikiminize eklenir." },
    { value: "later", title: "Kararı sonra vereyim", sub: "Tutar karar bekliyor olarak görünür; serbest tutara eklenmez." },
    { value: "ignore", title: "Kayıtlarda hata var, yok say", sub: "Tutar hiçbir yere taşınmaz." }
  ];
}
function deficitOptions(c) {
  const next = monthOf(nextPeriod(c.period));
  return [
    { value: "nextBudget", title: `${next} bütçemden düşülsün`, sub: `${next} döneminin serbest tutarı ${fmt(-c.amount)} azalır.` },
    { value: "saving", title: "Birikimimden karşılansın", sub: "Seçtiğiniz birikim hesabından harcama hesabınıza aktarılır." },
    { value: "debt", title: "Borç aldım, borçlarıma eklensin", sub: "Borcun cinsi, tutarı ve vadesi sorulur; vadesinde ödemelerde görünür." },
    { value: "ignoreError", title: "Kayıtlarda hata var, bu açığı yok say", sub: "Açık taşınmaz. Eksik ya da yanlış kaydı işlemlerden düzeltebilirsiniz." },
    { value: "ignoreOk", title: "Sorun değil, bu açığı yok say", sub: "Örneğin uygulama dışındaki bir paradan karşılandı. Açık taşınmaz." }
  ];
}

function Choice({ name, options, value, onChange }) {
  return (
    <div className="stack gap8" role="radiogroup">
      {options.map(o => (
        <label key={o.value} className="card row" style={{ gap: 12, minHeight: 44, cursor: "pointer", alignItems: "flex-start", outline: value === o.value ? "2px solid var(--blue)" : undefined }}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} style={{ width: 22, height: 22, flex: "none", marginTop: 2 }} />
          <span className="stack gap2">
            <span className="t-body b">{o.title}</span>
            <span className="t-meta">{o.sub}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

const nonCredit = state => Object.values(state.accounts).filter(a => a.type !== "credit" && !a.archived).sort((a, b) => a.name.localeCompare(b.name, "tr"));
const balanceText = (state, a, today) => a.currency === "TRY" ? fmt(balanceOf(state, a.id, today)) : formatUnits(balanceOf(state, a.id, today), a.currency);

export default function DevredenSheet({ state, commit, onClose, today, period, onToast, onFixRecords }) {
  const c = carryoverOf(state, period);
  const surplus = c.amount > 0;
  const abs = Math.abs(c.amount);
  const main = mainAccountId(state);
  const rates = ratesOf(state);
  const [choice, setChoice] = useState(null);
  const [step, setStep] = useState("choose");
  const [kind, setKind] = useState("TRY");
  const [units, setUnits] = useState(amountText(abs));
  const [tlSpent, setTlSpent] = useState(amountText(abs)); // döviz/altın alımında harcanan TL
  const [toAccountId, setToAccountId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [goalId, setGoalId] = useState(CARRYOVER_GOAL_ID);
  const [dueDate, setDueDate] = useState("");
  const [lender, setLender] = useState("");
  const [errors, setErrors] = useState(null);
  const accounts = nonCredit(state);

  if (c.final && c.amount !== 0 && !c.pending && c.decision) {
    const d = c.decision;
    const undo = () => {
      const errs = commit(s => undoCarryover(s, period));
      if (errs) return setErrors(errs);
      setChoice(null); setStep("choose"); setErrors(null);
      onToast?.("Devreden kararı geri alındı; yeniden seçin");
    };
    return (
      <Sheet title={`${periodLabel(period)} devredeni`} onClose={onClose}>
        <p className="v3-sheet-text"><b>{c.amount > 0 ? `${monthOf(period)} ayından ${fmt(abs)} arttı.` : `${monthOf(period)} ayı ${fmt(abs)} açıkla kapandı.`}</b></p>
        <p className="v3-sheet-text">Karar: <b>{choiceText(d)}</b>{d.note ? ` · ${d.note}` : ""}{d.choice === "debt" ? ` · ${formatUnits(d.units, d.currency)}, vade ${d.dueDate}` : ""}</p>
        <p className="v3-hint">Kararı değiştirmek için geri alın: kararla oluşan aktarım, döviz/altın alımı ya da borç silinir ve seçenekler yeniden açılır.</p>
        <ErrorText errors={errors} />
        <div className="v3-actions">
          <button type="button" className="v3-cancel" onClick={onClose}>Kapat</button>
          <button type="button" className="v3-submit" onClick={undo}>Kararı geri al ve yeniden seç</button>
        </div>
      </Sheet>
    );
  }

  if (!c.final || c.amount === 0 || !c.pending) {
    return (
      <Sheet title="Devreden" onClose={onClose}>
        <p className="v3-sheet-text">{!c.final ? `${periodLabel(period)} dönemi kapanmadı; devreden tutar kapanışta kesinleşir.` : "Bu dönemden devreden tutar yok."}</p>
        <Form onSubmit={onClose}><Actions submit="Tamam" onCancel={onClose} /></Form>
      </Sheet>
    );
  }

  const title = surplus ? `${monthOf(period)} ayından ${fmt(abs)} arttı. Bu parayı ne yapalım?` : `${monthOf(period)} ayı ${fmt(abs)} açıkla kapandı. Bu açığı nasıl karşılayalım?`;
  const options = surplus ? surplusOptions(c) : deficitOptions(c);
  const needsDetails = choice === "saving" || choice === "debt";
  const decide = (input, before = s => s) => {
    const errs = commit(s => decideCarryover(before(s), period, input, { id: newId(), date: today, now: new Date() }));
    if (errs) return setErrors(errs);
    onToast?.(input.choice === "later" ? "Devreden karar bekliyor olarak kaldı" : "Devreden kararı kaydedildi");
    onClose();
  };

  if (step === "choose") {
    const next = () => {
      if (!choice) return setErrors(["bir seçenek işaretleyin"]);
      setErrors(null);
      if (needsDetails) {
        // İkinci adımın varsayılanları seçeneğe göre.
        if (surplus) { setKind("TRY"); setUnits(amountText(abs)); setFromAccountId(main); setToAccountId(accounts.find(a => a.currency === "TRY" && a.id !== main)?.id || NEW); }
        else if (choice === "saving") { setFromAccountId(accounts.find(a => a.id !== main)?.id || ""); setToAccountId(main); }
        else { setKind("TRY"); setUnits(amountText(abs)); setToAccountId(main); }
        return setStep("details");
      }
      decide({ choice });
    };
    return (
      <Sheet title={`${periodLabel(period)} devredeni`} onClose={onClose}>
        <p className="v3-sheet-text"><b>{title}</b></p>
        <Choice name={`carry-${period}`} options={options} value={choice} onChange={v => { setChoice(v); setErrors(null); }} />
        {choice === "ignoreError" && onFixRecords && (
          <button type="button" className="v3-link" style={{ minHeight: 44, padding: 0 }} onClick={() => onFixRecords(period)}>{periodLabel(period)} kayıtlarını kontrol et</button>
        )}
        <Form onSubmit={next}>
          <ErrorText errors={errors} />
          <Actions submit={needsDetails ? "Devam" : "Kaydet"} onCancel={onClose} />
        </Form>
      </Sheet>
    );
  }

  const back = <button type="button" className="v3-link" style={{ minHeight: 44, padding: 0 }} onClick={() => { setStep("choose"); setErrors(null); }}>‹ Seçeneklere dön</button>;

  // Artı devreden → birikime aktar.
  if (surplus) {
    const targets = accounts.filter(a => a.currency === kind);
    const unitsMinor = parseAmount(units);
    const tlMinor = kind === "TRY" ? unitsMinor : parseAmount(tlSpent);
    const kindLabel = KINDS.find(k => k.value === kind).label;
    const note = unitsMinor && tlMinor ? (kind === "TRY"
      ? `${monthOf(period)} ayından devreden ${fmt(tlMinor)} birikime aktarıldı`
      : `${monthOf(period)} ayından devreden ${fmt(tlMinor)} ile ${formatUnits(unitsMinor, kind)} alındı`) : null;
    const warning = carryoverCardWarning(state, period, { rates });
    const goals = Object.values(state.goals || {}).filter(g => !g.archived && g.id !== CARRYOVER_GOAL_ID);
    const onKind = k => { const v = k || "TRY"; setKind(v); setUnits(v === "TRY" ? amountText(abs) : ""); setTlSpent(amountText(abs)); setToAccountId(accounts.find(a => a.currency === v && a.id !== main)?.id || NEW); };
    const save = () => {
      if (!unitsMinor) return setErrors([`alınan miktarı girin (${UNIT[kind]})`]);
      if (!tlMinor) return setErrors(["harcanan TL tutarını girin"]);
      if (tlMinor > abs) return setErrors([`aktarılan tutar devredeni (${fmt(abs)}) aşamaz`]);
      const newAccId = toAccountId === NEW ? newId() : null;
      const before = s => newAccId ? addAccount(s, { id: newAccId, name: `${kindLabel.replace(" (gram)", "")} birikim`, type: kind === "XAU" ? "cash" : "bank", currency: kind }) : s;
      decide({ choice: "saving", fromAccountId, toAccountId: newAccId || toAccountId, units: unitsMinor, ...(kind !== "TRY" ? { tlAmount: tlMinor } : {}), goalId: goalId === CARRYOVER_GOAL_ID ? undefined : goalId }, before);
    };
    return (
      <Sheet title="Birikime aktar" onClose={onClose}>
        {back}
        <p className="v3-sheet-text">{monthOf(period)} ayından devreden <b className="num">{fmt(abs)}</b> birikime aktarılıyor.</p>
        <Form onSubmit={save}>
          <Chips label="Birikim cinsi" options={KINDS} value={kind} onChange={onKind} wrap />
          {kind !== "TRY" && (
            <Field label="Harcanan TL" value={tlSpent} onChange={setTlSpent} inputMode="decimal" placeholder="0,00"
              hint="Devredenin tamamı ya da bir kısmı. Kalanı TL hesabında kalır; serbest tutara eklenmez." />
          )}
          <Field label={`Alınan miktar (${UNIT[kind]})`} value={units} onChange={setUnits} inputMode="decimal" placeholder="0"
            hint={kind === "TRY" ? "Devredenin tamamı ya da bir kısmı." : "Aldığınız miktarı kendi cinsinden yazın; devredenle birebir eşleşmesi gerekmez."} invalid={!!errors} />
          <SelectField label="Birikim hesabı" value={toAccountId} onChange={setToAccountId}
            options={[...targets.map(a => ({ value: a.id, label: `${a.name} · ${balanceText(state, a, today)}` })), { value: NEW, label: `Yeni ${kindLabel} birikim hesabı açılsın` }]} />
          <SelectField label="Paranın çıktığı hesap" value={fromAccountId} onChange={setFromAccountId}
            options={accounts.filter(a => a.currency === "TRY").map(a => ({ value: a.id, label: a.name }))}
            hint={fromAccountId === toAccountId ? "Aynı hesap seçildi: para hesapta kalır, yalnız hedefe bağlanır." : null} />
          <SelectField label="Hangi hedefe yazılsın" value={goalId} onChange={setGoalId}
            options={[{ value: CARRYOVER_GOAL_ID, label: "Devreden birikim (varsayılan)" }, ...goals.map(g => ({ value: g.id, label: g.name }))]} />
          {note && <p className="v3-hint">Kayda not düşülecek: {note}.</p>}
          {warning && (
            <p className="v3-alert" role="status" style={{ margin: "8px 0" }}>
              <strong>{periodLabel(warning.period)} kart ekstresi {fmt(warning.load)}</strong>
              O dönemin beklenen geliri ödemeleri ve ekstreyi {fmt(warning.short)} eksik karşılıyor. Gerekirse sonra birikimden serbest tutara aktarabilirsiniz.
            </p>
          )}
          <ErrorText errors={errors} />
          <Actions submit="Birikime aktar" onCancel={onClose} />
        </Form>
      </Sheet>
    );
  }

  // Eksi devreden → birikimden karşıla.
  if (choice === "saving") {
    const sources = accounts.filter(a => a.id !== main);
    const from = state.accounts[fromAccountId];
    const foreign = from && from.currency !== "TRY";
    const suggested = foreign && rates[from.currency] > 0 ? Math.ceil(abs / rates[from.currency]) : null;
    const balance = from ? balanceOf(state, from.id, today) : 0;
    const needed = foreign ? (parseAmount(units) || suggested || 0) : abs;
    const short = from && needed > balance;
    const onFrom = id => { setFromAccountId(id); const a = state.accounts[id]; setUnits(a && a.currency !== "TRY" && rates[a.currency] > 0 ? amountText(Math.ceil(abs / rates[a.currency])) : ""); };
    const save = () => {
      if (!from) return setErrors(["birikim hesabını seçin"]);
      const u = foreign ? parseAmount(units) : undefined;
      if (foreign && !u) return setErrors([`bozdurulan miktarı girin (${UNIT[from.currency]})`]);
      decide({ choice: "saving", fromAccountId, toAccountId, units: u });
    };
    return (
      <Sheet title="Birikimden karşıla" onClose={onClose}>
        {back}
        <p className="v3-sheet-text"><b className="num">{fmt(abs)}</b> açık birikimden {state.accounts[toAccountId]?.name || "harcama hesabına"} aktarılarak karşılanır.</p>
        <Form onSubmit={save}>
          {sources.length ? (
            <SelectField label="Hangi birikimden" value={fromAccountId} onChange={onFrom}
              options={sources.map(a => ({ value: a.id, label: `${a.name} · ${balanceText(state, a, today)}` }))} />
          ) : <p className="v3-sheet-text">Birikim hesabı yok. Ayarlar'dan bir birikim hesabı ekleyin ya da başka bir seçenek seçin.</p>}
          {foreign && (
            <Field label={`Bozdurulan miktar (${UNIT[from.currency]})`} value={units} onChange={setUnits} inputMode="decimal"
              hint={suggested ? `Girilen kura göre ${fmt(abs)} için yaklaşık ${formatUnits(suggested, from.currency)}.` : `${from.currency} kuru girilmemiş; bozdurduğunuz miktarı yazın.`} invalid={!!errors} />
          )}
          {short && <p className="v3-alert" role="status" style={{ margin: "8px 0" }}><strong>Birikim yetmiyor</strong>{from.name} bakiyesi {balanceText(state, from, today)}; aktarımdan sonra eksiye düşer.</p>}
          <ErrorText errors={errors} />
          <Actions submit="Birikimden karşıla" onCancel={onClose} disabled={!sources.length} />
        </Form>
      </Sheet>
    );
  }

  // Eksi devreden → borç aldım.
  const payAccounts = accounts;
  const onDebtKind = k => { const v = k || "TRY"; setKind(v); setUnits(v === "TRY" ? amountText(abs) : ""); setToAccountId(accounts.find(a => a.currency === v)?.id || main); };
  const save = () => {
    const amount = parseAmount(units);
    if (!amount) return setErrors([`borç tutarını girin (${UNIT[kind]})`]);
    if (!dueDate) return setErrors(["vade tarihini seçin"]);
    decide({ choice: "debt", currency: kind, amount, dueDate, lender: lender.trim(), accountId: toAccountId });
  };
  const tl = kind === "TRY" ? null : toBase(parseAmount(units) || 0, kind, rates);
  return (
    <Sheet title="Borç ekle" onClose={onClose}>
      {back}
      <p className="v3-sheet-text"><b className="num">{fmt(abs)}</b> açık borçla karşılandı. Borç vadesinde ödemelerde görünür.</p>
      <Form onSubmit={save}>
        <Chips label="Borcun cinsi" options={KINDS} value={kind} onChange={onDebtKind} wrap />
        <Field label={`Tutar (${UNIT[kind]})`} value={units} onChange={setUnits} inputMode="decimal" placeholder="0"
          hint={tl ? `Girilen kura göre yaklaşık ${fmt(tl)}.` : kind === "TRY" ? null : "Borcu kendi cinsinden yazın."} invalid={!!errors} />
        <Field label="Vade tarihi" type="date" value={dueDate} onChange={setDueDate} />
        <Field label="Kimden alındı (isteğe bağlı)" value={lender} onChange={setLender} placeholder="Örneğin Annem" />
        <SelectField label="Geri ödenecek hesap" value={toAccountId} onChange={setToAccountId}
          options={payAccounts.map(a => ({ value: a.id, label: `${a.name}${a.currency !== "TRY" ? ` · ${a.currency}` : ""}` }))} />
        <ErrorText errors={errors} />
        <Actions submit="Borcu ekle" onCancel={onClose} />
      </Form>
    </Sheet>
  );
}
