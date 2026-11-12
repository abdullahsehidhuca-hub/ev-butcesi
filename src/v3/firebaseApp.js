// v3'ün tek Firebase bağlantısı (useCloud.js ve family.js aynı örneği kullanır).
// iOS / Android kabuğunda (Capacitor, capacitor://localhost) getAuth() Google giriş
// penceresi için authDomain'den gizli bir çerçeve yüklemeye çalışır; kabukta bu çerçeve açılamadığı için oturum durumu
// hiç bildirilmez ve uygulama açılışta bekler. Kabukta oturum bu yüzden yalnız cihaz depolamasıyla başlatılır.
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { firebaseConfig } from "../firebaseConfig.js";

// useCloud bu modülü açılıştan sonra dinamik yükler; kullandığı işlevler buradan gelir ki paket ağacı sallansın
// ("firebase/auth" doğrudan dinamik yüklenirse kullanılmayan tüm giriş kodu da pakete girer).
export { onAuthStateChanged } from "firebase/auth";
export { ref, get, onValue, update, set } from "firebase/database";

export const isNativeShell = () => typeof location !== "undefined" && (location.protocol === "capacitor:" || !!globalThis.Capacitor?.isNativePlatform?.());

let auth = null;
export function firebase() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  if (!auth) {
    if (isNativeShell()) {
      try { auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }); }
      catch { auth = getAuth(app); } // daha önce başlatılmışsa aynı örnek
    } else auth = getAuth(app);
  }
  return { auth, db: getDatabase(app) };
}
