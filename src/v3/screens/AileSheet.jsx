// Aile üyeleri (Ayarlar › Aile üyeleri): üye listesi; aileyi kuran kişi yeni üye için davet kodu üretir ve gönderir.
// Davet kodunu yalnız kurucu üretebilir; veritabanı kuralı da bunu denetler (invitations/$code: familyId === auth.uid).
// Üye, uygulamanın ilk ekranındaki "Davet kodum var" ile kodu ve kendi şifresini girerek katılır.
// Gönderme: WhatsApp, e-posta ve mesaj doğrudan bağlantıyla açılır (kabukta da çalışır; uygulama yüklü değilse
// WhatsApp web sayfası açılır). "Diğer" sistemin paylaşım penceresidir; orada yalnız cihazda yüklü uygulamalar görünür.
import { useState } from "react";
import { Sheet, Field, Actions, ErrorText, Form } from "../ui.jsx";
import { authMessage, createInvitation, logOut, INVITE_DAYS } from "../family.js";

const isApple = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
const linkStyle = { minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", borderRadius: 12, background: "var(--card)", color: "var(--blue)", fontWeight: 600, textDecoration: "none" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AileSheet({ cloud, members = {}, onClose, onToast }) {
  const admin = !!cloud.user && cloud.familyId === cloud.user.uid;
  const list = Object.values(members).sort((a, b) => (b.self ? 1 : 0) - (a.self ? 1 : 0) || a.name.localeCompare(b.name, "tr"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(null); // { code, name, email }

  const message = inv => `Ev Bütçesi aile hesabımıza davetlisin. Uygulamayı açıp “Davet kodum var”a dokun ve şu kodu gir: ${inv.code}. Hesabın ${inv.email} adresiyle açılır; kendine bir şifre belirlemen yeterli. Kod ${INVITE_DAYS} gün geçerli.`;
  const links = inv => {
    const text = encodeURIComponent(message(inv));
    return [
      { label: "WhatsApp", href: `https://wa.me/?text=${text}` },
      { label: "E-posta", href: `mailto:${encodeURIComponent(inv.email)}?subject=${encodeURIComponent("Ev Bütçesi daveti")}&body=${text}` },
      // iOS "sms:&body=", Android "sms:?body=" biçimini ister.
      { label: "Mesaj", href: `sms:${isApple() ? "&" : "?"}body=${text}` }
    ];
  };
  const submit = async () => {
    if (busy) return;
    if (!name.trim() || !EMAIL.test(email.trim())) return setErrors(["Üyenin adını ve geçerli bir e-posta adresini girin"]);
    setBusy(true); setErrors(null);
    try {
      const code = await createInvitation(cloud.user, name, email);
      setInvite({ code, name: name.trim(), email: email.trim().toLowerCase() });
      setName(""); setEmail("");
    } catch (e) {
      setErrors([authMessage(e).replace(/\.$/, "")]);
    }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(message(invite)); onToast?.("Davet metni kopyalandı"); }
    catch { onToast?.("Kopyalanamadı; kodu elle yazabilirsiniz"); }
  };
  const share = async () => {
    try { await navigator.share({ title: "Ev Bütçesi daveti", text: message(invite) }); } catch { /* kullanıcı vazgeçti */ }
  };

  return (
    <Sheet title="Aile üyeleri" onClose={onClose}>
      <ul className="stack" style={{ listStyle: "none", margin: "0 0 8px", padding: 0, gap: 2 }} aria-label="Üyeler">
        {list.map(m => (
          <li key={m.id} className="row between" style={{ minHeight: 44, borderBottom: ".5px solid var(--sep)" }}>
            <span className="t-body">{m.name}{m.self ? " (siz)" : ""}</span>
            {m.self && admin && <span className="t-meta">Aileyi kuran</span>}
          </li>
        ))}
        {!list.length && <li className="t-meta" style={{ minHeight: 44 }}>Üyeler yükleniyor…</li>}
      </ul>

      {invite && (
        <section className="v3-alert" role="status" aria-label="Davet kodu" style={{ marginTop: 8 }}>
          <strong>{invite.name} için davet kodu</strong>
          <span className="num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: 4, userSelect: "all", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} aria-label={`Davet kodu: ${invite.code.split("").join(" ")}`}>{invite.code}</span>
          Kodu {invite.name} ile paylaşın. Uygulamada “Davet kodum var”a dokunup bu kodu girecek; hesabı {invite.email} adresiyle açılır. Kod {INVITE_DAYS} gün geçerli ve bir kez kullanılır.
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }} role="group" aria-label="Daveti gönder">
            {links(invite).map(l => <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" style={linkStyle}>{l.label}</a>)}
            {typeof navigator !== "undefined" && navigator.share && <button type="button" style={linkStyle} onClick={share}>Diğer…</button>}
          </span>
          <button type="button" className="v3-link" style={{ minHeight: 44, padding: 0, textAlign: "left" }} onClick={copy}>Davet metnini kopyala</button>
        </section>
      )}

      {admin ? (
        <Form onSubmit={submit}>
          <p className="v3-sheet-text" style={{ marginTop: 12 }}>Yeni üye davet edin: eşiniz ya da çocuğunuz kendi telefonundan aynı veriyi görür ve harcama girer.</p>
          <Field label="Üyenin adı" value={name} onChange={setName} placeholder="Örn: Ayşe" />
          <Field label="Üyenin e-postası" type="email" inputMode="email" value={email} onChange={setEmail} placeholder="ornek@eposta.com" hint="Üyenin hesabı bu adresle açılır." />
          <ErrorText errors={errors} />
          <Actions onCancel={onClose} disabled={busy} submit={busy ? "Bekleyin…" : "Davet kodu oluştur"} />
        </Form>
      ) : (
        <p className="v3-sheet-text" style={{ marginTop: 12 }}>Yeni üye davetini aileyi kuran kişi yapar.</p>
      )}

      <button type="button" className="v3-cancel" style={{ width: "100%", marginTop: 14 }}
        onClick={async () => { if (!confirm("Bu cihazda hesaptan çıkılsın mı?")) return; await logOut(); onClose(); }}>Hesaptan çık</button>
    </Sheet>
  );
}
