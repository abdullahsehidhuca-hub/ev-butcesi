// Özet (taslak C1): özet kart + hesaplar şeridi + tek liste. İleriye dönük uyarı listenin ilk satırıdır.
// Ana rakam "kullanılabilir" tutardır: gelir − düzenli ödemeler − harcama − bütçelere ayrılan.
// Dokununca bankadaki tutar, bloke ve bankayla karşılaştırma çekmecesi açılır (BakiyeSheet).
// Kurulum bitene kadar karşılama gösterilir: önce hesap düzeni sorulur, adımlar düzene göre değişir (setupSteps).
// Kredi kartı varsa altında tek satır "Kart blokesi" durur; dokununca kart kart döküm açılır (BlokeSheet).
import { Fragment, useEffect, useRef, useState } from "react";
import { pendingCarryover, formatUnits, balanceOf, nextAllowanceDate } from "../../core/index.js";
import { Icon, Tile, SetupIcon, DateBadge, Avatar, Check } from "../components/ui.jsx";
import { purposeOf, isExpenseAccount, groupOf } from "../setupGuide.js";
import { overview, upcoming, recent, forecast, paymentsView, accountsView, balanceView, closeCandidate, categoryName, periodLabel, fmt, fmtNum, dayNum, monthShort, monthLong, setupSteps } from "../selectors.js";

// Hesap düzeni: karşılamada ilk hesaptan önce sorulur; yalnız kurulum adımlarını belirler.
// Eski "Her hesabı ayrı izlerim" (separate) seçimi kategorili düzenin içinde açılır (setupSteps).
const MODES = [
  { id: "single", title: "Tek bir hesaptan takip ederim", sub: "Tüm harcama ve birikim hareketleri aynı banka hesabımdan yapılır", icon: "wallet", color: "blue" },
  { id: "cards", title: "Hesaplarımı kategorilendiririm", sub: "Kredi kartı harcamalarını, otomatik ödeme talimatlı vb. hareketleri farklı hesaplardan takip edersiniz; her ay başında uygulamada görünen tutarları ilgili hesaplara aktarırsınız", icon: "card", color: "pink", primary: true, badge: "Önerilen" }
];

// current: kurulum sırasında düzen yeniden seçilirken şu anki düzen (işaretli); onCancel: seçimden vazgeç (üstte, yalnız yeniden seçimde).
// Her seçenek kendi kartıdır; karta dokunmak seçimi yapar. badge kartın en üstünde rozet olarak durur.
function ModeChoice({ onMode, current, onCancel }) {
  return (
    <>
      {onCancel && <button type="button" className="t-sub c-blue setup-back" onClick={onCancel}>Vazgeç</button>}
      <header className="setup-head">
        <h1 className="t-title" style={{ margin: 0 }}>Bütçenizi nasıl takip edersiniz?</h1>
        <span className="t-sub">Sonradan istediğiniz hesabı ekleyebilirsiniz.</span>
      </header>
      <section className="setup-modes" aria-label="Hesap düzeni">
        {MODES.map(m => {
          const on = current === m.id;
          return (
            <button key={m.id} type="button" className={`setup-mode${on ? " is-on" : ""}`} onClick={() => onMode(m.id)} aria-current={on ? "true" : undefined}>
              {m.badge && <span className="badge" style={{ "--bc": "var(--blue)" }}>{m.badge}</span>}
              <span className="row">
                <SetupIcon icon={m.icon} color={m.color} />
                <span className="setup-mode-t grow">{m.title}</span>
                {on
                  ? <span className="radio on" aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span>
                  : <Icon name="chev" size={14} style={{ color: "var(--label3)", flex: "none" }} />}
              </span>
              <span className="setup-mode-d">{m.sub}</span>
            </button>
          );
        })}
      </section>
    </>
  );
}

// Kurulum sihirbazı: hesap düzeni seçildikten sonra her adım ekranda tek bir soru kartıdır; zorunlu iki adım (bütçe hesabı,
// gelir) öndedir. Boş adımda ana düğme doğrudan ekleme çekmecesini açar; kayıt eklenince Devam çıkar. İsteğe bağlı adım
// "Şimdilik atla" ile geçilir; atlanan adımlar settings.setupSkipped'e yazılır (setupSteps().skipped). Son ekran kurulum
// özetidir: adımlar, atlananlar ve Başla. Açılışta ilk "tamamlanmamış ve atlanmamış" adım açılır; hepsi öyleyse özet.
// Kayıt satırında kalem düzenleme çekmecesini açar, × onay çekmecesiyle siler (onRemove). ⓘ bilgi penceresini açar.
// Şimdilik atla altındaki cümle: atlanan adımın kayıtları adıyla anılır.
const LATER = {
  cards: "Kartları daha sonra Ayarlar'dan ekleyebilirsiniz.",
  expense: "Gider takibi hesaplarını daha sonra Ayarlar'dan ekleyebilirsiniz.",
  catFixed: "Sabit gider kategorilerini daha sonra Ayarlar'dan ekleyebilirsiniz.",
  catVariable: "Değişken gider kategorilerini daha sonra Ayarlar'dan ekleyebilirsiniz.",
  fixed: "Sabit ödemeleri daha sonra Ayarlar'dan ekleyebilirsiniz."
};

function Welcome({ state, today, open, onDone, onMode, onRemove, onSetting }) {
  const [choosing, setChoosing] = useState(false);
  const [cur, setCur] = useState(null);
  const headRef = useRef(null);
  const moved = useRef(false);
  const st = setupSteps(state);
  // Düzen seçilmeden hesap eklenmişse (eski kurulum) tek hesap adımları gösterilir.
  const mode = st.mode || (st.account || !onMode ? "single" : null);
  const single = mode !== "cards";
  const accounts = Object.values(state.accounts);
  const categories = Object.values(state.categories).filter(c => !c.archived).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const obligations = Object.values(state.obligations);
  const money = (v, cur) => cur && cur !== "TRY" ? `${fmtNum(v)} ${cur}` : fmt(v);
  const acc = a => ({ id: a.id, kind: "account", name: a.name, tag: a.id === state.settings.defaultAccountId ? "Bütçe hesabı" : purposeOf(a.purpose)?.label, value: money(balanceOf(state, a.id, today), a.currency) });
  const ob = o => ({ id: o.id, kind: "obligation", name: o.name, tag: o.categoryId ? categoryName(state, o.categoryId) : null, value: money(o.amount, o.currency) });
  const cat = c => ({ id: c.id, kind: "category", name: c.name, value: c.budget ? `${fmt(c.budget)} / ay` : "" });
  const expenseAccounts = accounts.filter(isExpenseAccount);
  const steps = [
    { id: "budget", title: "Bütçe hesabı ve bugünkü bakiye", sub: "Maaşınızın ve diğer gelirlerinizin yattığı hesapları, bugünkü tutarlarıyla ekleyin.", icon: "wallet", color: "blue",
      add: "Hesap ekle", sheet: { name: "account", side: "income" }, done: st.bank, required: true,
      items: accounts.filter(a => a.type !== "credit" && !isExpenseAccount(a)).map(acc) },
    { id: "income", title: "Maaş ve diğer gelirler", sub: "İlk maaşın yattığı gün, bütçe döneminizin başlangıcı olur.", icon: "cash", color: "green",
      add: "Gelir ekle", sheet: { name: "obligation", kind: "income", setup: true }, done: st.income, required: true,
      items: obligations.filter(o => o.kind === "income").map(ob) },
    !single && { id: "cards", title: "Kredi kartları", sub: "Her kartı ayrı ekleyin. Harcamalar o kartın borcuna yazılır.", icon: "card", color: "pink",
      add: "Kart ekle", sheet: { name: "account", side: "card" }, done: st.credit,
      items: accounts.filter(a => a.type === "credit").map(acc) },
    !single && { id: "expense", title: "Gider takibi hesapları", sub: "Otomatik ödemeler, kredi kartı aktarımları ya da günlük harcama için ayrı bir hesabınız varsa ekleyin.", icon: "repeat", color: "teal",
      add: "Hesap ekle", sheet: { name: "account", side: "expense" }, done: expenseAccounts.length > 0,
      items: expenseAccounts.map(acc) },
    { id: "catFixed", title: "Sabit gider kategorileri", sub: "Her dönem tekrarlanan ödemeler için kategori ekleyin.", icon: "tag", color: "orange",
      add: "Sabit gider kategorisi ekle", sheet: { name: "category", group: "fixed" }, done: st.catFixed,
      items: categories.filter(c => groupOf(c) === "fixed").map(cat) },
    { id: "catVariable", title: "Değişken gider kategorileri", sub: "Dönemden döneme değişen harcamalar için kategori ekleyin.", icon: "tag", color: "indigo",
      add: "Değişken gider kategorisi ekle", sheet: { name: "category", group: "variable" }, done: st.catVariable,
      items: categories.filter(c => groupOf(c) === "variable").map(cat) },
    // Sabit ödeme bir sabit gider kategorisine bağlanır; kategori yoksa kart kilitlidir ve ana düğme kategori ekletir.
    { id: "fixed", title: "Kira, fatura gibi sabit ödemeler", sub: st.catFixed ? "Otomatik olarak işaretlediğiniz ödemeler, günü gelince kendiliğinden düşer." : "Sabit ödeme eklemek için önce bir kategori gerekir.", icon: "repeat", color: "orange",
      add: "Ödeme ekle", sheet: { name: "obligation", kind: "fixed", setup: true }, done: st.fixed, locked: !st.catFixed,
      items: obligations.filter(o => o.kind !== "income").map(ob) }
  ].filter(Boolean).map(s => ({ ...s, status: s.done ? "done" : st.skipped.includes(s.id) ? "skipped" : "open" }));
  const first = steps.find(s => s.status === "open")?.id || "summary";
  // Bütçe hesabı yoksa başka adım açılmaz (ekleme çekmeceleri bütçe hesabı ister). Özet yalnız açık adım kalmadıysa
  // açık kalır; bir kayıt silinir ya da veri baştan yüklenirse ilk açık adıma dönülür.
  const valid = id => id === "budget" || (st.bank && (id === "summary" ? first === "summary" : steps.some(s => s.id === id)));
  const shown = cur && valid(cur) ? cur : first;
  // Açılan adım sabitlenir: kayıt eklenince sihirbaz kendiliğinden ilerlemez, Devam beklenir.
  useEffect(() => { if (mode && !choosing && cur !== shown) setCur(shown); });
  // Adım değişince odak yeni başlığa taşınır.
  useEffect(() => { if (moved.current) headRef.current?.focus(); }, [shown]);
  if (!mode || choosing) return <ModeChoice current={choosing ? mode : null} onCancel={choosing ? () => setChoosing(false) : null} onMode={m => { setChoosing(false); setCur(null); onMode(m); }} />;

  const go = id => { moved.current = true; setCur(id); };
  const i = steps.findIndex(s => s.id === shown);
  const s = steps[i];
  const next = () => go(steps[i + 1]?.id || "summary");
  const back = () => !s ? go(steps[steps.length - 1].id) : i > 0 ? go(steps[i - 1].id) : setChoosing(true);
  const skip = () => { onSetting?.("setupSkipped", [...new Set([...st.skipped, s.id])]); next(); };
  const canStart = st.bank && st.income;
  const info = topic => open({ name: "setupInfo", topic, next: null });
  // Kayıt satırları Ayarlar'daki liste düzenini izler: küçük renkli kare, ad ve alt satır, sağda tutar.
  const itemRows = (items, icon, color) => items.map(it => (
    <div key={it.id} className="li">
      <SetupIcon icon={icon} color={color} small />
      <span className="stack grow gap2" style={{ minWidth: 0 }}>
        <span className="t-body ellipsis">{it.name}</span>
        {it.tag && <span className="t-meta ellipsis">{it.tag}</span>}
      </span>
      {it.value && <span className={`t-body c-2 num${/^[-−]/.test(it.value) ? " c-red" : ""}`} style={{ whiteSpace: "nowrap" }}>{it.value}</span>}
      <button type="button" className="setup-act" aria-label={`Düzelt: ${it.name}`}
        onClick={() => open({ name: `${it.kind}Edit`, id: it.id })}><Icon name="pencil" size={18} /></button>
      {onRemove && <button type="button" className="setup-act c-red" aria-label={`Sil: ${it.name}`} onClick={() => onRemove(it.kind, it.id)}><Icon name="close" size={18} /></button>}
    </div>
  ));
  const top = (
    <>
      <div className="setup-top">
        <button type="button" className="setup-prev" onClick={back}><Icon name="back" size={20} />Geri</button>
        <span className="setup-count" aria-hidden="true">{s ? `Adım ${i + 1} / ${steps.length}` : `${steps.filter(x => x.status === "done").length} / ${steps.length} adım tamamlandı`}</span>
      </div>
      <ol className="setup-progress" aria-hidden="true">
        {steps.map((x, k) => <li key={x.id} className={`is-${k === i ? "now" : x.status}`} />)}
      </ol>
      <p className="visually-hidden" aria-live="polite">{s ? `Adım ${i + 1} / ${steps.length}: ${s.title}` : "Kurulum özeti"}</p>
    </>
  );

  if (!s) {
    const skippedAny = canStart && steps.some(x => x.status !== "done");
    const subOf = x => x.status === "done" ? x.items.map(it => it.name).join(" · ")
      : x.required ? (x.id === "budget" ? "Başlamak için bütçe hesabınızı ekleyin." : "Başlamak için gelirinizi ekleyin.")
      : "Atlandı. Şimdi ekleyebilirsiniz.";
    return (
      <>
        {top}
        <header className="setup-head">
          <h1 className="t-title setup-h1" ref={headRef} tabIndex={-1}>Kurulum özeti</h1>
        </header>
        <ul className="setup-card setup-summary" aria-label="Kurulum adımları">
          {steps.map((x, k) => {
            const done = x.status === "done";
            const missing = !done && x.required;
            return (
              <li key={x.id}>
                <button type="button" className="setup-sum-row" onClick={() => go(x.id)}
                  aria-label={`${k + 1}. ${x.title}${done ? ", tamamlandı" : ""}. ${subOf(x)} Adıma git.`}>
                  <span className={`setup-mark is-${done ? "done" : missing ? "missing" : "skipped"}`} aria-hidden="true">
                    <Icon name={done ? "check" : missing ? "alert" : "minus"} size={16} stroke={2.5} />
                  </span>
                  <span className="stack grow gap2" style={{ minWidth: 0 }}>
                    <span className="t-body b">{x.title}</span>
                    <span className="t-note">{subOf(x)}</span>
                  </span>
                  <Icon name="chev" size={14} style={{ color: "var(--label3)", flex: "none" }} />
                </button>
              </li>
            );
          })}
        </ul>
        {onDone && (
          <div className="setup-foot">
            {skippedAny && <p id="setup-start-note" className="t-note">Atladığınız adımları istediğiniz zaman Ayarlar'dan tamamlayabilirsiniz.</p>}
            {!canStart && <p id="setup-start-why" className="t-note">{st.bank ? "Başlamak için gelirinizi ekleyin." : "Başlamak için bütçe hesabınızı ve gelirinizi ekleyin."}</p>}
            <button type="button" className="setup-primary setup-start" disabled={!canStart} aria-describedby={canStart ? (skippedAny ? "setup-start-note" : undefined) : "setup-start-why"} onClick={onDone}>Başla</button>
          </div>
        )}
        {onMode && <button type="button" className="t-sub c-blue setup-link" onClick={() => setChoosing(true)}>Hesap düzenini değiştir</button>}
      </>
    );
  }

  const primary = s.done
    ? <button type="button" className="setup-primary" onClick={next}>Devam</button>
    : s.locked
      ? <button type="button" className="setup-primary" onClick={() => open({ name: "category", group: "fixed" })}><Icon name="plus" size={18} stroke={2.5} />Sabit gider kategorisi ekle</button>
      : <button type="button" className="setup-primary" onClick={() => open(s.sheet)}><Icon name="plus" size={18} stroke={2.5} />{s.add}</button>;
  return (
    <>
      {top}
      {i === 0 && (
        <header className="setup-head">
          <h1 className="t-title" style={{ margin: 0 }}>Hoş geldiniz</h1>
          <span className="t-sub">Bütçe ve harcama hesap bilgilerinizi girerek uygulamayı kullanmaya başlayabilirsiniz. Bilgilerinizi daha sonra Ayarlar'dan da düzenleyebilirsiniz.</span>
        </header>
      )}
      <section key={s.id} className="setup-card" aria-labelledby="setup-q">
        <div className="setup-card-top">
          <SetupIcon icon={s.icon} color={s.color} />
          <button type="button" className="setup-info-btn" aria-label={`Bilgi: ${s.title}`} onClick={() => info(s.id)}><Icon name="info" size={22} /></button>
        </div>
        {!s.required && <span className="badge" style={{ "--bc": "var(--gray)" }}>İsteğe bağlı</span>}
        <h2 id="setup-q" className="setup-q" ref={headRef} tabIndex={-1}>{s.title}</h2>
        <p className="setup-d">{s.sub}</p>
        {s.items.length > 0 && (
          <div className="setup-items">
            {itemRows(s.items, s.icon, s.color)}
            <button type="button" className="li" onClick={() => open(s.sheet)}>
              <Tile icon="plus" color="blue" solid small />
              <span className="t-body c-blue grow">{s.add}</span>
            </button>
          </div>
        )}
        {primary}
      </section>
      {!s.required && !s.done && (
        <div className="setup-later-box">
          <button type="button" className="setup-later" aria-describedby="setup-later-note" onClick={skip}>Şimdilik atla</button>
          <p id="setup-later-note" className="t-note">{LATER[s.id]}</p>
        </div>
      )}
    </>
  );
}

function Accounts({ state, today, onManage }) {
  const { list, total } = accountsView(state, today);
  return (
    <section className="stack gap8" aria-label="Hesaplar">
      <div className="row between" style={{ padding: "0 4px" }}>
        <span className="t-cap" style={{ padding: 0 }}>Hesaplar · net <span className="num" style={{ letterSpacing: 0 }}>{fmt(total)}</span></span>
        <button type="button" className="t-sub c-blue" style={{ minHeight: 44, minWidth: 44, fontWeight: 500 }} onClick={onManage}>Birikim ›</button>
      </div>
      <ul className="accts">
        {list.map(a => (
          <li key={a.id} className="acct">
            <span className="row" style={{ gap: 8 }}>
              <Tile icon={a.type === "credit" ? "card" : a.type === "cash" ? "cash" : "wallet"} color={a.type === "credit" ? "pink" : a.type === "cash" ? "teal" : "blue"} small />
              <span className="t-meta ellipsis">{a.name}</span>
            </span>
            <span className={`num t-body b${a.balance < 0 ? " c-red" : ""}`}>{a.currency === "TRY" ? fmt(a.balance) : `${fmtNum(a.balance)} ${a.currency}`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Haftalık harçlık tanımlı hesaplar (konfor kartı gibi): bu hafta kalan tutar ve sonraki yükleme.
function Allowances({ state, today }) {
  const list = Object.values(state.accounts).filter(a => a.allowance && !a.archived);
  if (!list.length) return null;
  return (
    <section className="stack gap2" aria-label="Haftalık harçlık" style={{ padding: "0 4px" }}>
      {list.map(a => {
        const left = balanceOf(state, a.id, today);
        const next = nextAllowanceDate(a, today);
        return (
          <p key={a.id} className="t-meta" style={{ margin: 0 }}>
            <b>{a.name}:</b> bu hafta <span className={`num${left < 0 ? " c-red" : ""}`}>{fmt(left)}</span> kaldı · {dayNum(next)} {monthShort(next)} günü {fmt(a.allowance.amount)} yüklenir
          </p>
        );
      })}
    </section>
  );
}

export default function Ozet({ state, today, members = {}, overrides, open, onResolve, onPay, onOpenPayments, onOpenSettings, backupDue, onSetupDone, onSetupMode, onSetupRemove, onSetupSetting, reconcileReminder, funding = [] }) {
  const [list, setList] = useState("upcoming");
  // Karşılama açıldıysa Başla'ya basılana kadar kalır: son adımda sabit ödeme eklenince (show false olur) özet ekranı atlanmaz.
  const show = setupSteps(state).show;
  const [inSetup, setInSetup] = useState(show);
  if (show && !inSetup) setInSetup(true);
  if (show || inSetup) return <Welcome state={state} today={today} open={open} onDone={onSetupDone && (() => { setInSetup(false); onSetupDone(); })} onMode={onSetupMode} onRemove={onSetupRemove} onSetting={onSetupSetting} />;

  const o = overview(state, today);
  const fc = forecast(state, today, { overrides });
  const up = upcoming(state, today);
  const rec = recent(state, 8);
  const nextMonth = paymentsView(state, o.period);
  const bv = balanceView(state, today);
  const bar = o.salaryBar;
  const barTotal = Math.max(1, bar.income, bar.obligations + bar.spent + bar.reserved);
  const pct = v => `${Math.max(0, v) / barTotal * 100}%`;
  const ahead = o.pace.diff > 0;
  const memberList = Object.values(members);
  const missing = o.summary.missingRates;
  const closing = closeCandidate(state, today);
  const carry = closing ? null : pendingCarryover(state);
  const cb = o.summary.cardBudget;
  const hasCard = Object.values(state.accounts).some(a => a.type === "credit");

  return (
    <>
      <header className="row between" style={{ alignItems: "flex-end", padding: "0 4px" }}>
        <div className="stack">
          <span className="t-meta b">{dayNum(o.start)} {monthShort(o.start)} – {dayNum(o.end)} {monthShort(o.end)} · {o.day}. gün</span>
          <h1 className="t-title" style={{ margin: 0 }}>{monthLong(o.start)}</h1>
        </div>
        {memberList.length > 1 && (
          <div className="row" style={{ gap: 0, paddingBottom: 6 }}>
            {memberList.map((m, i) => <span key={m.id} style={{ marginLeft: i ? -6 : 0 }}><Avatar member={m} /></span>)}
          </div>
        )}
      </header>

      {closing && (
        <button type="button" className="v3-alert" style={{ textAlign: "left", width: "100%" }} onClick={() => open({ name: "close" })}>
          <strong>{periodLabel(closing.period)} dönemini kapatın{closing.waiting > 0 ? ` (+${closing.waiting} dönem daha bekliyor)` : ""}</strong>
          {closing.open.length ? `${closing.open.length} ödeme açık kaldı: taşı, ertele ya da yok say.` : "Açık ödeme yok; dönemi tek dokunuşla dondurun."}
          <span className="t-sub c-blue" style={{ fontWeight: 600 }}>Ay kapatmaya başla</span>
        </button>
      )}

      {carry && (
        <button type="button" className="v3-alert" style={{ textAlign: "left", width: "100%" }} onClick={() => open({ name: "carryover", period: carry.period })}>
          <strong>{periodLabel(carry.period)} devredeni karar bekliyor · {fmt(carry.amount)}</strong>
          {carry.amount > 0 ? "Artan para serbest tutara eklenmedi: birikime aktarın ya da yok sayın." : "Açık kalan tutarın nasıl karşılanacağını seçin."}
          <span className="t-sub c-blue" style={{ fontWeight: 600 }}>Karar ver</span>
        </button>
      )}

      {backupDue && (
        <div className="v3-alert" role="status">
          <strong>{backupDue.days == null ? "Henüz yedek almadınız" : `Son yedek ${backupDue.days} gün önce`}</strong>
          Veriler yalnız bu cihazda. Haftada bir yedek dosyası indirin; telefon kaybolursa ya da tarayıcı temizlenirse geri yüklersiniz.
          <span className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <button type="button" className="v3-link" style={{ padding: 0 }} onClick={backupDue.onBackup}>Şimdi yedek indir</button>
            <button type="button" className="v3-link" style={{ padding: 0 }} onClick={backupDue.onSnooze}>Yarın hatırlat</button>
          </span>
        </div>
      )}

      {funding.map(n => (
        <div key={n.key} className="v3-alert" role="status">
          <strong>{n.name} için bu dönem {fmt(n.amount)} gerekiyor</strong>
          Talimatlı ödemeler bu hesaptan çekilir. Ana hesaptan aktarılsın mı?
          <span className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <button type="button" className="v3-link" style={{ padding: 0 }} onClick={n.onFund}>{fmt(n.amount)} aktar</button>
            <button type="button" className="v3-link" style={{ padding: 0 }} onClick={n.onSkip}>Bu dönem aktarmayacağım</button>
          </span>
        </div>
      ))}

      {reconcileReminder && (
        <div className="v3-alert" role="status">
          <strong>Bankayla karşılaştırma zamanı</strong>
          {reconcileReminder.names} için bankadaki rakamı yazın. Fark varsa hangi kayıtlara bakacağınızı gösteririz.
          <span className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <button type="button" className="v3-link" style={{ padding: 0 }} onClick={() => open({ name: "balance" })}>Şimdi karşılaştır</button>
            <button type="button" className="v3-link" style={{ padding: 0 }} onClick={reconcileReminder.onSnooze}>3 gün sonra hatırlat</button>
          </span>
        </div>
      )}

      {missing?.length > 0 && (
        <div className="v3-alert" role="status">
          <strong>{missing.join(", ")} kuru eksik</strong>
          Dövizli kalemler bu rakamlara katılmadı.
        </div>
      )}

      <section className="card" aria-label="Bu dönem özeti">
        <div className="row between baseline"><span className="t-sub b">Serbest</span><span className="t-sub">günde {fmt(o.perDay)}</span></div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <span className={`num t-big${o.safe < 0 ? " c-red" : ""}`}>{fmt(o.safe)}</span>
          {o.pace.plan > 0 && (
            <span className="badge" style={{ "--bc": ahead ? "var(--orange)" : "var(--green)" }}>
              {ahead ? `plandan ${fmt(o.pace.diff)} hızlı` : `plana göre ${fmt(-o.pace.diff)} geride`}
            </span>
          )}
        </div>
        {bar.income > 0 ? (
          <>
            <div className="bar" style={{ marginTop: 4 }} aria-hidden="true">
              <i style={{ width: pct(bar.paid), background: "var(--gray)" }} />
              <i style={{ width: pct(bar.pending), background: "var(--gray)", opacity: .4 }} />
              <i style={{ width: pct(bar.spent), background: "var(--blue)" }} />
              <i style={{ width: pct(bar.reserved), background: "var(--blue)", opacity: .35 }} />
              <i style={{ flex: 1, background: "var(--green)" }} />
            </div>
            <div className="row t-meta" style={{ gap: 12, flexWrap: "wrap" }}>
              <span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: "var(--gray)" }} />Ödemeler {fmtNum(bar.obligations)}</span>
              <span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: "var(--blue)" }} />Harcandı {fmtNum(bar.spent)}</span>
              <span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: "var(--blue)", opacity: .35 }} />Bütçelere ayrılan {fmtNum(bar.reserved)}</span>
            </div>
          </>
        ) : (
          <div className="row between" style={{ flexWrap: "wrap" }}>
            <span className="t-sub">Bu dönem için gelir girilmedi.</span>
            <button type="button" className="t-sub c-blue" style={{ minHeight: 44, fontWeight: 600 }} onClick={() => open({ name: "obligation", kind: "income" })}>Maaş ekle</button>
          </div>
        )}
        <button type="button" className="why-btn" onClick={() => open({ name: "balance" })} aria-label={`Serbest tutarın dökümü: bankada ${fmt(bv.bank)}, bloke ${fmt(bv.blocked)}`}>
          <span className="stack gap2"><span className="t-meta">Bankada</span><span className="num t-body b">{fmt(bv.bank)}</span></span>
          <span className="stack gap2"><span className="t-meta">Bloke</span><span className="num t-body b c-orange">{fmt(bv.blocked)}</span></span>
          <span className="t-sub c-blue" style={{ marginLeft: "auto", fontWeight: 500 }}>Döküm</span>
          <Icon name="chev" size={14} style={{ color: "var(--label3)" }} />
        </button>
        {hasCard && cb && (
          <button type="button" className="why-btn" onClick={() => open({ name: "blocked" })} aria-label={`Kart blokesi ${fmt(cb.blocked)}. Kart kart dökümü göster`}>
            <span className="stack gap2">
              <span className="t-meta">Kart blokesi</span>
              <span className="num t-body b c-orange">{fmt(cb.blocked)}</span>
            </span>
            {(cb.load > 0 || cb.pending > 0) && (
              <span className="stack gap2">
                <span className="t-meta">{cb.load > 0 ? "Bu dönem ekstre" : "Gelecek dönem"}</span>
                <span className="num t-body b">{fmt(cb.load > 0 ? cb.load : cb.pending)}</span>
              </span>
            )}
            <span className="t-sub c-blue" style={{ marginLeft: "auto", fontWeight: 500 }}>Kartlar</span>
            <Icon name="chev" size={14} style={{ color: "var(--label3)" }} />
          </button>
        )}
      </section>

      <Accounts state={state} today={today} onManage={() => open({ name: "savings" })} />
      <Allowances state={state} today={today} />

      <div className="seg" role="group" aria-label="Liste">
        <button type="button" aria-pressed={list === "upcoming"} onClick={() => setList("upcoming")}>Yaklaşan · {up.length}</button>
        <button type="button" aria-pressed={list === "recent"} onClick={() => setList("recent")}>Son işlemler</button>
      </div>

      {list === "upcoming" ? (
        <section className="list" aria-label="Yaklaşan ödemeler ve gelirler">
          {fc.firstNegative && (
            <button type="button" className="li" onClick={onResolve} style={{ "--inset": "64px" }}>
              <Tile icon="alert" color="red" solid />
              <span className="stack grow gap2">
                <span className="t-body b">Eksiye düşüyor · {dayNum(fc.firstNegative.date)} {monthShort(fc.firstNegative.date)}</span>
                <span className="t-meta c-red">{fmt(fc.firstNegative.balance)} · {fc.firstNegative.label}</span>
              </span>
              <span className="pill blue sm" aria-hidden="true">Çöz</span>
            </button>
          )}
          {up.map(it => {
            const income = it.type === "income";
            return (
              <div className="li" key={it.key}>
                <DateBadge date={it.date} tone={fc.firstNegative?.key === it.key ? "red" : undefined} />
                <Tile icon={it.icon} color={it.color} />
                <span className="stack grow gap2">
                  <span className="t-body ellipsis">{it.name}</span>
                  <span className="t-meta ellipsis">{income ? (it.date < today ? "Alındı mı?" : `Gelir · ${daysText(today, it.date)}`) : it.auto ? (it.total ? `Taksit ${it.index}/${it.total} · otomatik` : it.bankAuto ? "Banka talimatı" : "Karttan otomatik") : it.type === "card" ? "Ekstre · son ödeme" : daysText(today, it.date)}</span>
                </span>
                <span className={`num t-body b${income ? " c-green" : ""}`}>{income ? "+" : ""}{fmt(it.auto ? it.amount : it.open)}</span>
                {it.auto ? <span className="auto-tag">oto</span> : <Check on={false} onClick={() => onPay(it)} label={`${it.name} ${income ? "alındı" : "ödendi"} olarak işaretle`} />}
              </div>
            );
          })}
          {!up.length && !fc.firstNegative && <p className="t-sub" style={{ margin: 0, padding: 16 }}>Yaklaşan ödeme yok.</p>}
        </section>
      ) : (
        <section className="list" aria-label="Son işlemler" style={{ "--inset": "64px" }}>
          {rec.map(t => <TxRow key={t.id} t={t} state={state} member={memberList.length > 1 ? members[t.createdBy] : null} onClick={() => open({ name: "tx", id: t.id })} />)}
          {!rec.length && <p className="t-sub" style={{ margin: 0, padding: 16 }}>Henüz işlem yok. Sağ alttaki + ile ilk harcamanızı ekleyin.</p>}
          {rec.length > 0 && (
            <button type="button" className="li" onClick={() => open({ name: "txlist" })} style={{ justifyContent: "center" }}>
              <span className="t-sub c-blue" style={{ fontWeight: 600 }}>Tüm işlemler · ara, düzenle, sil</span>
            </button>
          )}
        </section>
      )}

      <button type="button" className="row between" onClick={onOpenPayments} style={{ padding: "0 4px", minHeight: 44 }}>
        <span className="t-meta">Bu dönem {fmt(nextMonth.open)} ödeme kaldı</span>
        <span className="t-sub c-blue" style={{ fontWeight: 500 }}>Tümü</span>
      </button>
    </>
  );
}

// Son işlem satırı: harcama, iade, gelir, aktarım ya da düzenli ödeme kaydı.
export function TxRow({ t, state, member, onClick }) {
  const acc = id => state.accounts[id]?.name;
  const ob = t.obligationId && state.obligations[t.obligationId];
  const c = state.categories[t.categoryId];
  const transfer = t.type === "transfer" || t.type === "exchange";
  const plus = t.type === "income" || t.type === "refund";
  const when = `${dayNum(t.date)} ${monthShort(t.date)}`;
  const [title, sub, icon, color] = transfer
    ? [t.note || "Aktarım", `${when} · ${acc(t.accountId)} → ${acc(t.toAccountId)}`, "repeat", "indigo"]
    : ob
      ? [ob.name, `${when} · ${t.type === "income" ? "Gelir alındı" : t.partial ? "Kısmi ödeme" : "Düzenli ödeme"} · ${acc(t.accountId)}`, ob.icon || (t.type === "income" ? "cash" : "repeat"), ob.color || (t.type === "income" ? "green" : "orange")]
      : [t.note || (t.type === "income" ? "Gelir" : categoryName(state, t.categoryId)), `${when} · ${t.type === "income" ? "Gelir" : t.type === "refund" ? "İade" : categoryName(state, t.categoryId)} · ${acc(t.accountId)}`, c?.icon || (t.type === "income" ? "cash" : "more"), c?.color || (t.type === "income" ? "green" : "gray")];
  const body = (
    <>
      <Tile icon={icon} color={color} />
      <span className="stack grow gap2">
        <span className="t-body ellipsis">{title}</span>
        <span className="t-meta ellipsis">{sub}</span>
      </span>
      <span className={`num t-body b${plus ? " c-green" : ""}`}>{transfer ? "" : plus ? "+" : "−"}{t.currency && t.currency !== "TRY" ? formatUnits(t.amount, t.currency) : fmt(t.amount)}</span>
      {member && <Avatar member={member} size={24} />}
    </>
  );
  if (!onClick) return <div className="li">{body}</div>;
  return <button type="button" className="li" onClick={onClick} aria-label={`${title}, ${fmt(t.amount)}, ${sub}. Düzenle`}>{body}</button>;
}

function daysText(today, date) {
  const [a, b] = [today, date].map(d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
  const n = Math.round((b - a) / 86400000);
  return n === 0 ? "Bugün" : n === 1 ? "Yarın" : `${n} gün sonra`;
}
