// Aile hesabı çekmecesi: giriş yapılmamışsa giriş / kayıt / davetle katılma; giriş yapılmış ama aile
// yoksa aile kurma ya da davet koduyla katılma. Veri işlemleri ../family.js'tedir.
import React, { useState } from "react";
import { Sheet, Field, Actions, ErrorText, Form } from "../ui.jsx";
import { authMessage, createFamily, joinFamily, lookupInvitation, registerEmail, signInEmail, signInGoogle, logOut } from "../family.js";

const TITLES = { login: "Aile hesabına giriş", register: "Yeni hesap oluştur", invite: "Davet koduyla katıl", family: "Aile hesabı kurun" };

export default function HesapSheet({ cloud, onClose, onDone }) {
  const user = cloud.user;
  const [mode, setMode] = useState(user ? "family" : "login");
  const [name, setName] = useState(user?.displayName || "");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);

  const run = async fn => {
    if (busy) return;
    setBusy(true); setErrors(null); setInfo(null);
    try { await fn(); } catch (e) { setErrors([authMessage(e)]); }
    setBusy(false);
  };
  const go = m => { setMode(m); setErrors(null); setInfo(null); };
  const cleanCode = code.replace(/\D/g, "");
  const unverified = user && !user.emailVerified && user.providerData?.[0]?.providerId === "password";

  // Davet kodunu doğrular; hesabı yoksa davetteki e-postayla hesap açar, sonra aileye katılır.
  const joinWithCode = () => run(async () => {
    if (cleanCode.length !== 6) throw new Error("6 haneli davet kodunu girin");
    const inv = await lookupInvitation(cleanCode);
    if (!inv) throw new Error("Davet kodu geçersiz ya da daha önce kullanılmış");
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
      await registerEmail(name.trim(), email, pass);
      setMode("family");
      setInfo("Hesap açıldı. E-postanıza gelen bağlantıyla adresinizi doğrulayın, sonra aileyi kurun.");
    }),
    invite: joinWithCode,
    family: () => run(async () => {
      if (cleanCode) return joinWithCode();
      if (unverified) {
        await user.reload();
        if (!user.emailVerified) throw new Error("E-posta adresiniz henüz doğrulanmadı; gelen kutunuzdaki bağlantıya dokunun");
      }
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
      {mode === "login" && <p className="v3-sheet-text">Giriş yapınca verileriniz tüm cihazlarınızda ve aile üyelerinizde eşitlenir.</p>}
      {mode === "invite" && <p className="v3-sheet-text">Aile yöneticisinin verdiği 6 haneli kodu girin. Hesabınız davetteki e-postayla açılır.</p>}
      {mode === "family" && <p className="v3-sheet-text">{user?.email} ile giriş yaptınız. Yeni bir aile kurun ya da size verilen davet koduyla katılın.</p>}
      {info && <p className="v3-sheet-text" role="status">{info}</p>}
      <Form onSubmit={submit[mode]}>
        {(mode === "register" || mode === "family") && <Field label="Adınız" value={name} onChange={setName} placeholder="Örn: Ayşe Yılmaz" />}
        {(mode === "login" || mode === "register") && <Field label="E-posta" type="email" inputMode="email" value={email} onChange={setEmail} placeholder="ornek@eposta.com" />}
        {(mode === "invite" || mode === "family") && <Field label={mode === "family" ? "Davet kodu (katılacaksanız)" : "Davet kodu"} inputMode="numeric" value={code} onChange={setCode} placeholder="6 hane" />}
        {(mode === "login" || mode === "register" || (mode === "invite" && !user)) && <Field label="Şifre" type="password" value={pass} onChange={setPass} hint={mode === "login" ? null : "En az 6 karakter"} />}
        {unverified && mode === "family" && !cleanCode && <p className="v3-hint">Aileyi kurmadan önce e-posta adresinizi doğrulayın.</p>}
        <ErrorText errors={errors} />
        <Actions onCancel={onClose} disabled={busy}
          submit={busy ? "Bekleyin…" : mode === "login" ? "Giriş yap" : mode === "register" ? "Kayıt ol" : mode === "invite" || cleanCode ? "Katıl" : "Aileyi kur"} />
      </Form>
      {(mode === "login" || mode === "register") && (
        <button type="button" className="v3-cancel" style={{ width: "100%", marginTop: 10 }} onClick={google} disabled={busy}>Google ile devam et</button>
      )}
      {links}
    </Sheet>
  );
}
