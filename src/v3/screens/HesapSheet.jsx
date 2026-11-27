// Hesap çekmecesi: giriş yap / şifreyi sıfırla / üye hesabı aç / davet koduyla katıl; giriş yapılmış ama bütçe yoksa
// bütçe kurma ya da davet koduyla katılma. Üye hesabı açan kişi ardından ne kuracağını seçer (bütçe, davet, kısa süreli
// bütçe); bütçe kurucusu davet kodunu Ayarlar › Üyeler'den gönderir. Davetliler "Davet kodum var" ile katılır: önce kod,
// kod doğrulanınca davetteki e-posta ve şifre (invitePass). Veri işlemleri ../family.js'tedir.
// start: açılış kipi (ilk açılış ekranındaki düğmeden gelir). api: test ekranlarında family.js yerine sahte hesap (testCloud.js).
// Davete katılım doğrulanmış e-posta ister: doğrulama bağlantısı yalnız bu akışta gönderilir, "verify" adımında beklenir.
// Davetteki e-postayla zaten hesap varsa hata yerine soru (inviteAccount) ve davetle giriş (inviteLogin) gelir.
// Kayıt sırasında oturum değişince çekmece yeniden açılır; bekleyen davet kodu bu yüzden cihazda tutulur.
import React, { useState } from "react";
import { Sheet, Field, Actions, ErrorText, Form } from "../ui.jsx";
import * as family from "../family.js";
import { loadPref, savePref } from "../store.js";

const TITLES = {
  login: "Tekrar hoş geldiniz", reset: "Şifreyi sıfırla", register: "Üye hesabı aç", invite: "Davet koduyla katıl",
  invitePass: "Şifre belirleyin", inviteLogin: "Davet kodunuz kaydedildi",
  family: "Bütçe kur", verify: "E-postanızı kontrol edin"
};
const SUBMIT = {
  login: "Giriş yap", reset: "Bağlantı gönder", register: "Devam", invite: "Devam", invitePass: "Katıl", inviteAccount: "Giriş yap",
  inviteLogin: "Giriş yap", family: "Başla", verify: "Doğruladım"
};
// Bekleme metni işin adını taşır.
const BUSY = {
  login: "Giriş yapılıyor…", reset: "Bağlantı gönderiliyor…", register: "Üye hesabı açılıyor…", invite: "Kod kontrol ediliyor…",
  invitePass: "Üye hesabı açılıyor…", inviteAccount: "Giriş yap", inviteLogin: "Giriş yapılıyor…", family: "Bütçe kuruluyor…",
  verify: "Doğrulama kontrol ediliyor…"
};
const PENDING_INVITE_KEY = "evb-v3-bekleyen-davet";

export default function HesapSheet({ cloud, onClose, onDone, start, api = family }) {
  const { authMessage, createFamily, joinFamily, lookupInvitation, normalizeCode, registerEmail, signInEmail, signInGoogle, googleAvailable, logOut, refreshVerified, resendVerification, sendPasswordReset } = api;
  const user = cloud.user;
  const [pending] = useState(() => loadPref(PENDING_INVITE_KEY, null));
  const [mode, setMode] = useState(user ? (pending ? (user.emailVerified ? "invite" : "verify") : start === "invite" ? "invite" : "family") : start || "login");
  const [name, setName] = useState(user?.displayName || "");
  const [budgetName, setBudgetName] = useState("");
  // Doğrulanan davet (2. adımda bütçenin adı ve e-posta gösterilir).
  const [inv, setInv] = useState(null);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [code, setCode] = useState(pending || "");
  // Davetteki adres: hesabı olan davetli bu adresle giriş yapar (alan değiştirilemez).
  const [inviteEmail, setInviteEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetBack, setResetBack] = useState("login");
  const [errors, setErrors] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async fn => {
    if (busy) return;
    setBusy(true); setErrors(null); setNotice(null);
    try { await fn(); } catch (e) { setErrors([authMessage(e)]); }
    setBusy(false);
  };
  const go = m => { setMode(m); setErrors(null); setNotice(null); setResetSent(false); };
  const cleanCode = normalizeCode(code);

  // Doğrulanmış e-postayla bütçeye katılır; doğrulanmamışsa doğrulama adımına geçer.
  const finishJoin = async (u, found) => {
    if (!(await refreshVerified(u))) {
      if (mode === "verify") throw new Error("E-postanız henüz doğrulanmadı. Size gönderdiğimiz bağlantıya dokunun. Gelmediyse “Bağlantıyı tekrar gönder”i seçin.");
      try { await resendVerification(u); } catch { /* "Bağlantıyı tekrar gönder" ile yeniden denenir */ }
      go("verify");
      return;
    }
    const joined = await joinFamily(u, cleanCode, found, found.name);
    savePref(PENDING_INVITE_KEY, null);
    onDone("Bütçeye katıldınız", joined.familyId);
  };
  const findInvitation = async () => {
    if (cleanCode.length !== 6) throw new Error("6 karakterli davet kodunu yazın");
    const inv = await lookupInvitation(cleanCode);
    if (!inv) { savePref(PENDING_INVITE_KEY, null); throw new Error("Bu kod geçersiz ya da süresi dolmuş. Bütçe kurucusundan yeni bir kod isteyin"); }
    return inv;
  };

  // 1. adım: davet kodunu doğrular. Giriş yapılmışsa hemen katılır; yapılmamışsa 2. adımda davetteki e-posta gösterilip
  // şifre istenir.
  const checkCode = () => run(async () => {
    const found = await findInvitation();
    // Kurallar da denetler: davet yalnız davetteki e-postayla açılmış ve doğrulanmış hesaba geçer.
    if (user && user.email?.toLowerCase() !== String(found.email || "").toLowerCase()) throw new Error(`Bu davet ${found.email} adresi için. Farklı bir e-postayla giriş yapıp o adresi kullanın.`);
    savePref(PENDING_INVITE_KEY, cleanCode);
    setInv(found); setInviteEmail(found.email);
    if (user) await finishJoin(user, found);
    else go("invitePass");
  });
  // 2. adım: davetteki e-postayla üye hesabı açar; bu adresle hesap zaten varsa katılmayı sorar.
  const joinWithPassword = () => run(async () => {
    if (pass.length < 6) throw new Error("Şifre en az 6 karakter olmalı.");
    let u;
    try { u = await registerEmail(inv.name || "", inv.email, pass); } catch (e) {
      if (e?.code !== "auth/email-already-in-use") throw e;
      setPass(""); go("inviteAccount");
      return;
    }
    await finishJoin(u, inv);
  });

  const resend = () => run(async () => {
    await resendVerification(user);
    setNotice("Bağlantı tekrar gönderildi.");
  });
  const openReset = from => { setResetBack(from); if (from === "inviteLogin") setEmail(inviteEmail); go("reset"); };

  const submit = {
    login: () => run(async () => {
      if (!email.trim() || !pass) throw new Error("E-posta ve şifreyi yazın");
      await signInEmail(email, pass);
      onDone("Giriş yapıldı");
    }),
    reset: () => run(async () => {
      if (!email.trim()) throw new Error("E-posta adresinizi yazın");
      await sendPasswordReset(email);
      setResetSent(true);
    }),
    register: () => run(async () => {
      if (!name.trim() || !email.trim()) throw new Error("Adınızı ve e-postanızı yazın");
      if (pass.length < 6) throw new Error("Şifre en az 6 karakter olmalı");
      await registerEmail(name.trim(), email, pass);
      onDone("Üye hesabınız açıldı");
    }),
    invite: checkCode,
    invitePass: joinWithPassword,
    verify: checkCode,
    inviteAccount: () => go("inviteLogin"),
    inviteLogin: () => run(async () => {
      if (!pass) throw new Error("Şifrenizi yazın");
      const inv = await findInvitation();
      const u = await signInEmail(inviteEmail, pass);
      await finishJoin(u, inv);
    }),
    family: () => run(async () => {
      if (!budgetName.trim() || !name.trim()) throw new Error(!budgetName.trim() && !name.trim() ? "Bütçenin adını ve kendi adınızı yazın." : !name.trim() ? "Adınızı yazın." : "Bütçenin adını yazın.");
      const made = await createFamily(user, name.trim(), budgetName);
      onDone("Bütçeniz kuruldu", made.familyId);
    }),
  };

  const google = () => run(async () => {
    try { await signInGoogle(); } catch (e) { if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") return; throw e; }
    onDone("Giriş yapıldı");
  });

  const link = (label, onClick) => <button type="button" className="v3-link" onClick={onClick} disabled={busy}>{label}</button>;
  const switchAccount = () => run(async () => { savePref(PENDING_INVITE_KEY, null); await logOut(); onClose(); });
  // Her kipte en çok iki bağlantı.
  const links = {
    login: [link("Şifremi unuttum", () => openReset("login")), link("Üye hesabı aç", () => go("register"))],
    reset: resetSent ? [link("Giriş yap", () => go(resetBack))] : [],
    register: [link("Giriş yap", () => go("login")), link("Davet kodum var", () => go("invite"))],
    invite: user ? [link("Farklı bir e-postayla giriş yap", switchAccount)] : [link("Giriş yap", () => go("login")), link("Üye hesabı aç", () => go("register"))],
    invitePass: [link("Başka bir kod gir", () => { setPass(""); go("invite"); })],
    inviteAccount: [],
    inviteLogin: [link("Şifremi unuttum", () => openReset("inviteLogin"))],
    family: [link("Davet kodum var", () => go("invite")), link("Farklı bir e-postayla giriş yap", switchAccount)],
    verify: [link("Bağlantıyı tekrar gönder", resend), link("Farklı bir e-postayla giriş yap", switchAccount)],
  }[mode];

  const text = {
    reset: "Yeni şifre belirlemeniz için bu adrese bir bağlantı göndereceğiz.",
    register: "Girdiğiniz her veriyi sadece siz ve bütçenizi paylaştığınız üyeler görebilir.",
    invite: user ? null : "Size gönderilen kodu yazın.",
    invitePass: `${inv?.budgetName ? `“${inv.budgetName}” adlı bütçeye katılıyorsunuz. ` : ""}Üye hesabınız ${inviteEmail} adresiyle açılır.`,
    inviteAccount: `${inviteEmail} adresiyle bir üye hesabınız var. Giriş yapınca bu bütçe listenize eklenir, şu an kullandıklarınız olduğu gibi kalır.`,
    inviteLogin: "Üye hesabınızın şifresini yazın.",
    verify: user?.email || inviteEmail ? `${user?.email || inviteEmail} adresine bir doğrulama bağlantısı gönderdik. Ona dokunup buraya dönün.` : "Size bir doğrulama bağlantısı gönderdik. Ona dokunup buraya dönün.",
  }[mode];

  return (
    <Sheet title={mode === "inviteAccount" ? (inv?.budgetName ? `“${inv.budgetName}” adlı bütçeye katılmak istiyor musunuz?` : "Bu bütçeye katılmak istiyor musunuz?") : TITLES[mode]} onClose={onClose}>
      {mode === "reset" && resetSent ? (
        <p className="v3-sheet-done" role="status">Bu adresle bir üye hesabı varsa birkaç dakika içinde e-posta gelir. Gelen kutunuzda yoksa gereksiz klasörüne bakın.</p>
      ) : <>
        {text && <p className="v3-sheet-text">{text}</p>}
        <Form onSubmit={submit[mode]}>
          {mode === "family" && <Field label="Bütçenin adı" value={budgetName} onChange={setBudgetName} autoComplete="off" hint="Birden fazlası olursa açılışta bu adla seçersiniz." />}
          {(mode === "register" || mode === "family") && <Field label="Adınız" value={name} onChange={setName} autoComplete="name" hint="Uygulamada bu adla görünürsünüz" />}
          {(mode === "login" || mode === "register" || mode === "reset") && <Field label="E-posta" type="email" inputMode="email" value={email} onChange={setEmail} placeholder="ad@ornek.com" autoComplete="email" />}
          {(mode === "inviteLogin" || mode === "invitePass") && <Field label="E-posta" type="email" value={inviteEmail} onChange={() => {}} readOnly autoComplete="username" />}
          {mode === "invite" && <Field label="Davet kodu" value={code} onChange={v => setCode(v.toLocaleUpperCase("en-US"))} placeholder="K7M2QX" autoComplete="off" hint="6 karakter, harf ve rakam" />}
          {(mode === "login" || mode === "inviteLogin") && <Field label="Şifre" type="password" value={pass} onChange={setPass} autoComplete="current-password" />}
          {mode === "register" && <Field label="Şifre" type="password" value={pass} onChange={setPass} autoComplete="new-password" hint="En az 6 karakter" />}
          {mode === "invitePass" && <Field label="Şifre" type="password" value={pass} onChange={setPass} autoComplete="new-password" hint="En az 6 karakter" />}
          {notice && <p className="v3-hint" role="status">{notice}</p>}
          <ErrorText errors={errors} />
          <Actions glossy onCancel={onClose} disabled={busy} submit={busy ? BUSY[mode] : SUBMIT[mode]} />
        </Form>
        {(mode === "login" || mode === "register") && googleAvailable() && (
          <button type="button" className="v3-cancel" style={{ width: "100%", marginTop: 10 }} onClick={google} disabled={busy}>Google ile devam et</button>
        )}
      </>}
      {links.length > 0 && <div className="stack" style={{ marginTop: 8, alignItems: "flex-start" }}>{links.map((l, i) => <React.Fragment key={i}>{l}</React.Fragment>)}</div>}
    </Sheet>
  );
}
