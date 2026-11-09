import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";

// /v3 adresi yeni arayüzü (src/v3) açar. İki arayüz de ayrı paket olarak tembel yüklenir;
// böylece biri açılırken diğerinin kodu indirilmez.
// Yalnız geliştirmede: /v3?ornek örnek aile verisiyle açılır (ayrı anahtarda; gerçek veriye dokunmaz).
// import.meta.env.DEV üretim derlemesinde false olduğu için örnek veri canlı pakete girmez.
const sampleMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("ornek");
const V3App = lazy(async () => {
  const app = await import("./v3/V3App.jsx");
  if (!sampleMode) return app;
  const sample = await import("./v3/sampleData.js");
  return { default: () => <app.default sample={sample} /> };
});
const App = lazy(() => import("./App.jsx"));
const isV3 = window.location.pathname.replace(/\/+$/, "") === "/v3";

const fallback = <p role="status" style={{ padding: 24, fontSize: 15, fontFamily: "-apple-system, system-ui, sans-serif" }}>Yükleniyor…</p>;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={fallback}>{isV3 ? <V3App /> : <App />}</Suspense>
  </React.StrictMode>
);
