// Aile hesabı çekmecesi: giriş yap / kayıt ol / davet koduyla katıl; giriş yapılmış ama aile yoksa aile kurma ya da
// davet koduyla katılma. Kayıt olan kişi aileyi kuran kişidir: kayıtla birlikte aile hesabı da kurulur, üyelerine
// Ayarlar › Aile üyeleri'nden davet kodu gönderir. Üyeler "Davet kodum var" ile katılır. Veri işlemleri ../family.js'tedir.
// start: açılış kipi (ilk açılış ekranındaki düğmeden gelir).
import React, { useState } from "react";
import { Sheet, Field, Actions, ErrorText, Form } from "../ui.jsx";
import { authMessage, createFamily, joinFamily, lookupInvitation, normalizeCode, registerEmail, signInEmail, signInGoogle, googleAvailable, logOut } from "../family.js";

const TITLES = { login: "Giriş yap", register: "Kayıt ol", invite: "Davet koduyla katıl", family: "Aile hesabı kurun" };

export default function HesapSheet({ cloud, onClose, onDone, start }) {
  const user = cloud.user;
  const [mode, setMode] = useState(user ? "family" : start || "login");
  const [name, setName] = useState(user?.displayName || "");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async fn => {
    if (busy) return;
    setBusy(true); setErrors(null);
    try { await fn(); } catch (e) { setErrors([authMessage(e)]); }
    setBusy(false);
  };
  const go = m => { setMode(m); setErrors(null); };
  const cleanCode = normalizeCode(code);

  // Davet kodunu doğrular; hesabı yoksa davetteki e-postayla hesap açar, sonra aileye katılır.
  const joinWithCode = () => run(async () => {
    if (cleanCode.length !== 6) throw new Error("6 karakterli davet kodunu girin");
    const inv = await lookupInvitation(cleanCode);
    if (!inv) throw new Error("Davet kodu geçersiz, süresi dolmuş ya da daha önce kullanılmış. Aileyi kuran kişiden yeni kod isteyin");
    // Kurallar da denetler: davet yalnız davetteki e-postayla açılmış hesaba geçer.
    if (user && user.email?.toLowerCase() !== String(inv.email || "").toLowerCase()) throw new Error(`Bu davet ${inv.email} adresi için. Çıkış yapıp o adresle giriş yapın`);
    let u = user;
    if (!u) {
      if (pass.length < 6) throw new Error("Şifre en az 6 karakter olmalı");
      u = await registerEmail(inv.name || "", inv.email, pass);
    }
    await joinFamily(u, cleanCode, inv, inv.name);
    onDone("Aileye katıldınız");
  });

  const submit = {
    login: () => run(async () => {
      if (!email.trim() || !pass) throw new Error("E-posta ve şifreyi girin");
      await signInEmail(email, pass);
      onDone("Giriş yapıldı");
    }),
    register: () => run(async () => {
      if (!name.trim() || !email.trim()) throw new Error("Ad ve e-postayı girin");
      if (pass.length < 6) throw new Error("Şifre en az 6 karakter olmalı");
      const u = await registerEmail(name.trim(), email, pass);
      await createFamily(u, name.trim());
      onDone("Aile hesabınız kuruldu");
    }),
    invite: joinWithCode,
    family: () => run(async () => {
      if (cleanCode) return joinWithCode();
      if (!name.trim()) throw new Error("Aile hesabında görünecek adınızı girin");
      await createFamily(user, name.trim());
      onDone("Aile hesabı kuruldu");
    }),
  };

  const google = () => run(async () => {
    try { await signInGoogle(); } catch (e) { if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") return; throw e; }
    onDone("Giriş yapıldı");
  });

  const links = (
    <div className="stack" style={{ marginTop: 8, alignItems: "flex-start" }}>
      {mode !== "login" && !user && <button type="button" className="v3-link" onClick={() => go("login")}>Hesabım var, giriş yap</button>}
      {mode !== "register" && !user && <button type="button" className="v3-link" onClick={() => go("register")}>Hesabım yok, kayıt ol</button>}
      {mode !== "invite" && !user && <button type="button" className="v3-link" onClick={() => go("invite")}>Davet kodum var</button>}
      {user && <button type="button" className="v3-link" onClick={() => run(async () => { await logOut(); onClose(); })}>Başka hesapla giriş yap (çıkış)</button>}
    </div>
  );

  return (
    <Sheet title={TITLES[mode]} onClose={onClose}>
      {mode === "login" && <p className="v3-sheet-text">Verileriniz tüm cihazlarınızda ve aile üyelerinizde eşitlenir.</p>}
      {mode === "register" && <p className="v3-sheet-text">Kayıt olunca aile hesabınız kurulur. Eşinizi ve diğer aile üyelerinizi sonra Ayarlar › Aile üyeleri'nden davet edersiniz.</p>}
      {mode === "invite" && <p className="v3-sheet-text">Aileyi kuran kişinin size gönderdiği 6 karakterli kodu girin. Hesabınız davetteki e-postayla açılır.</p>}
      {mode === "family" && <p className="v3-sheet-text">{user?.email} ile giriş yaptınız. Yeni bir aile kurun ya da size verilen davet koduyla katılın.</p>}
      <Form onSubmit={submit[mode]}>
        {(mode === "register" || mode === "family") && <Field label="Adınız" value={name} onChange={setName} placeholder="Örn: Ayşe Yılmaz" />}
        {(mode === "login" || mode === "register") && <Field label="E-posta" type="email" inputMode="email" value={email} onChange={setEmail} placeholder="ornek@eposta.com" />}
        {(mode === "invite" || mode === "family") && <Field label={mode === "family" ? "Davet kodu (katılacaksanız)" : "Davet kodu"} value={code} onChange={v => setCode(v.toLocaleUpperCase("en-US"))} placeholder="Örn: K7M2QX" />}
        {(mode === "login" || mode === "register" || (mode === "invite" && !user)) && <Field label="Şifre" type="password" value={pass} onChange={setPass} hint={mode === "login" ? null : "En az 6 karakter"} />}
        <ErrorText errors={errors} />
        <Actions onCancel={onClose} disabled={busy}
          submit={busy ? "Bekleyin…" : mode === "login" ? "Giriş yap" : mode === "register" ? "Kayıt ol" : mode === "invite" || cleanCode ? "Katıl" : "Aileyi kur"} />
      </Form>
      {(mode === "login" || mode === "register") && googleAvailable() && (
        <button type="button" className="v3-cancel" style={{ width: "100%", marginTop: 10 }} onClick={google} disabled={busy}>Google ile devam et</button>
      )}
      {links}
    </Sheet>
  );
}
