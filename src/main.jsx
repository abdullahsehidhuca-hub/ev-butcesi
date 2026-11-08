import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// /v3 adresi yeni arayüzü (src/v3) açar; ayrı paket olarak yüklenir, eski uygulamayı etkilemez.
// Yalnız geliştirmede: /v3?ornek örnek aile verisiyle açılır (ayrı anahtarda; gerçek v3 verisine dokunmaz).
// import.meta.env.DEV üretim derlemesinde false olduğu için örnek veri canlı pakete girmez.
const sampleMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("ornek");
const V3App = lazy(async () => {
  const app = await import("./v3/V3App.jsx");
  if (!sampleMode) return app;
  const sample = await import("./v3/sampleData.js");
  return { default: () => <app.default sample={sample} /> };
});
const isV3 = window.location.pathname.replace(/\/+$/, "") === "/v3";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isV3
      ? <Suspense fallback={<p style={{ padding: 24, fontSize: 15 }}>Yükleniyor…</p>}><V3App /></Suspense>
      : <App />}
  </React.StrictMode>
);
