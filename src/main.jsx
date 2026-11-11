import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";

// Kök adres (/) ve /v3 yeni arayüzü (src/v3) açar; eski uygulama /eski adresinde kalır (11 Kasım 2026:
// onaylı tasarım depoya alındı, ana ekran uygulamasının başlangıç adresi / olduğu için kök v3'e verildi).
// İki arayüz de ayrı paket olarak tembel yüklenir; böylece biri açılırken diğerinin kodu indirilmez.
// Yalnız geliştirmede: /?ornek örnek aile verisiyle, /?ornek=yedek depo dışı yedek/ klasöründeki eski uygulama
// yedeğiyle açılır (ayrı anahtarda; gerçek veriye dokunmaz). import.meta.env.DEV üretim derlemesinde false
// olduğu için örnek ve yedek verisi canlı pakete girmez.
const sampleKind = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("ornek") : null;
const sampleMode = sampleKind != null;
const V3App = lazy(async () => {
  const app = await import("./v3/V3App.jsx");
  if (!sampleMode) return app;
  const sample = sampleKind === "yedek" ? (await import("./v3/sampleBackup.js")).load() : await import("./v3/sampleData.js");
  return { default: () => <app.default sample={sample} /> };
});
const App = lazy(() => import("./App.jsx"));
const path = window.location.pathname.replace(/\/+$/, "");
const isLegacy = path === "/eski";

const fallback = <p role="status" style={{ padding: 24, fontSize: 15, fontFamily: "-apple-system, system-ui, sans-serif" }}>Yükleniyor…</p>;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={fallback}>{isLegacy ? <App /> : <V3App />}</Suspense>
  </React.StrictMode>
);
