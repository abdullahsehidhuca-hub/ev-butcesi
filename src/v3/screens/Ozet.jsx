// Özet (taslak C1): özet kart + hesaplar şeridi + tek liste. İleriye dönük uyarı listenin ilk satırıdır.
// Ana rakam "kullanılabilir" tutardır: gelir − düzenli ödemeler − harcama − bütçelere ayrılan.
// Dokununca bankadaki tutar, bloke ve bankayla karşılaştırma çekmecesi açılır (BakiyeSheet).
// Kurulum bitene kadar karşılama gösterilir: önce hesap düzeni sorulur, adımlar düzene göre değişir (setupSteps).
// Kredi kartı varsa altında tek satır "Kart blokesi" durur; dokununca kart kart döküm açılır (BlokeSheet).
import { useState } from "react";
import { pendingCarryover, formatUnits, balanceOf, nextAllowanceDate } from "../../core/index.js";
import { Icon, Tile, DateBadge, Avatar, Check } from "../components/ui.jsx";
import { overview, upcoming, recent, forecast, paymentsView, accountsView, balanceView, closeCandidate, categoryName, periodLabel, fmt, fmtNum, dayNum, monthShort, monthLong, setupSteps } from "../selectors.js";

// Hesap düzeni: karşılamada ilk hesaptan önce sorulur; yalnız kurulum adımlarını belirler.
const MODES = [
  { id: "single", title: "Tek hesap", sub: "Her şey maaş hesabımdan çıkar", icon: "wallet", color: "blue" },
  { id: "cards", title: "Kartlarımı da izlerim", sub: "Önerilen · kart harcaması karta yazılır, ekstreyi ayda bir ödersiniz", icon: "card", color: "pink", primary: true },
  { id: "separate", title: "Her hesabı ayrı izlerim", sub: "Talimat hesabı, konfor kartı gibi hesapları bankayla karşılaştırırsınız", icon: "repeat", color: "teal" }
];

function ModeChoice({ onMode }) {
  return (
    <>
      <header className="stack gap2" style={{ padding: "0 4px" }}>
        <h1 className="t-title" style={{ margin: 0 }}>Paranızı nasıl takip edersiniz?</h1>
        <span className="t-sub">Sonradan istediğiniz hesabı ekleyebilirsiniz.</span>
      </header>
      <section className="list" aria-label="Hesap düzeni" style={{ "--inset": "64px" }}>
        {MODES.map(m => (
          <button key={m.id} type="button" className="li" onClick={() => onMode(m.id)}>
            <Tile icon={m.icon} color={m.color} solid={m.primary} />
            <span className="stack grow gap2">
              <span className="t-body b">{m.title}</span>
              <span className="t-meta">{m.sub}</span>
            </span>
            <Icon name="chev" size={14} style={{ color: "var(--label3)" }} />
          </button>
        ))}
      </section>
    </>
  );
}

function Welcome({ state, open, onDone, onMode }) {
  const st = setupSteps(state);
  // Düzen seçilmeden hesap eklenmişse (eski kurulum) tek hesap adımları gösterilir.
  const mode = st.mode || (st.account || !onMode ? "single" : null);
  if (!mode) return <ModeChoice onMode={onMode} />;
  const single = mode === "single";
  const later = st.bank ? null : "Önce ana hesabı ekleyin";
  const steps = [
    { title: single ? "Maaş hesabı ve bugünkü bakiye" : "Ana hesap ve bugünkü bakiye", sub: single ? "Bütün ödemeler bu hesaptan düşer" : "Maaşın yattığı, ödemelerin çıktığı hesap", icon: "wallet", color: "blue", sheet: { name: "account", type: "bank" }, on: true, done: st.bank },
    !single && { title: "Kredi kartları", sub: later || "Kart harcaması karta yazılır; ekstreyi ayda bir ödersiniz", icon: "card", color: "pink", sheet: { name: "account", type: "credit" }, on: st.bank, done: st.credit },
    mode === "separate" && { title: "Talimat hesabı, konfor kartı", sub: later || "Bankayla karşılaştırmak istediğiniz diğer hesaplar", icon: "repeat", color: "teal", sheet: { name: "account", type: "bank" }, on: st.bank, done: st.extra },
    { title: "Maaş ve maaş günü", sub: later || "Bütçe ayı maaş gününden başlar", icon: "cash", color: "green", sheet: { name: "obligation", kind: "income" }, on: st.bank, done: st.income },
    { title: "Kira, fatura gibi sabit ödemeler", sub: later || "Talimatla ödenenler işaretlemeden düşer", icon: "repeat", color: "orange", sheet: { name: "obligation", kind: "fixed" }, on: st.bank, done: st.fixed }
  ].filter(Boolean);
  const canStart = st.bank && st.income;
  return (
    <>
      <header className="stack gap2" style={{ padding: "0 4px" }}>
        <h1 className="t-title" style={{ margin: 0 }}>Hoş geldiniz</h1>
        <span className="t-sub">Hesap ve maaşla başlayın; diğer adımları sonra da ekleyebilirsiniz.</span>
      </header>
      <section className="list" aria-label="Başlangıç adımları" style={{ "--inset": "64px" }}>
        {steps.map((s, i) => (
          <button key={s.title} type="button" className="li" disabled={!s.on} onClick={() => open(s.sheet)} style={{ opacity: s.on ? 1 : .55 }}
            aria-label={`${i + 1}. ${s.title}${s.done ? ", eklendi. Bir tane daha ekle" : ""}`}>
            <Tile icon={s.done ? "check" : s.icon} color={s.done ? "green" : s.color} />
            <span className="stack grow gap2">
              <span className="t-body b">{i + 1}. {s.title}</span>
              <span className="t-meta">{s.done ? "Eklendi · bir tane daha eklemek için dokunun" : s.sub}</span>
            </span>
            {s.on && <Icon name={s.done ? "plus" : "chev"} size={14} style={{ color: "var(--label3)" }} />}
          </button>
        ))}
      </section>
      {canStart && onDone && (
        <button type="button" className="pill blue" style={{ justifyContent: "center", minHeight: 50, borderRadius: 14, fontSize: 17 }} onClick={onDone}>Başla</button>
      )}
      {!st.account && onMode && (
        <button type="button" className="t-sub c-blue" style={{ minHeight: 44, fontWeight: 500 }} onClick={() => onMode(null)}>Hesap düzenini değiştir</button>
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

export default function Ozet({ state, today, members = {}, overrides, open, onResolve, onPay, onOpenPayments, onOpenSettings, backupDue, onSetupDone, onSetupMode, reconcileReminder, funding = [] }) {
  const [list, setList] = useState("upcoming");
  if (setupSteps(state).show) return <Welcome state={state} open={open} onDone={onSetupDone} onMode={onSetupMode} />;

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
