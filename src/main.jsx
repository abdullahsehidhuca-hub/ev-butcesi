import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { TEST_TOOLS } from "./v3/testTools.js";

// Kök adres (/) ve /v3 yeni arayüzü (src/v3) açar; eski uygulama /eski adresinde kalır (11 Kasım 2026:
// onaylı tasarım depoya alındı, ana ekran uygulamasının başlangıç adresi / olduğu için kök v3'e verildi).
// İki arayüz de ayrı paket olarak tembel yüklenir; böylece biri açılırken diğerinin kodu indirilmez.
// Geliştirmede ve TestFlight derlemesinde (testTools.js): /?test ekran seçiciyi, /?ornek örnek aile verisini,
// /?ornek=<senaryo> test senaryosunu (testScenarios.js) açar. Yalnız geliştirmede /?ornek=yedek depo dışı yedek/
// klasöründeki eski uygulama yedeğiyle açılır; import.meta.env.DEV üretim derlemesinde false olduğu için gerçek mali
// veri hiçbir pakete girmez. Örnekler ayrı anahtarda tutulur, gerçek veriye dokunmaz.
const params = TEST_TOOLS ? new URLSearchParams(window.location.search) : null;
const sampleKind = params ? params.get("ornek") : null;
const sampleMode = sampleKind != null;
const pickerMode = !!params?.has("test");
const V3App = lazy(async () => {
  const app = await import("./v3/V3App.jsx");
  if (!sampleMode) return app;
  const sample = import.meta.env.DEV && sampleKind === "yedek" ? (await import("./v3/sampleBackup.js")).load()
    : sampleKind ? (await import("./v3/testScenarios.js")).scenario(sampleKind)
    : await import("./v3/sampleData.js");
  return { default: () => <app.default sample={sample} /> };
});
const TestEkranlari = lazy(() => import("./v3/screens/TestEkranlari.jsx"));
const App = lazy(() => import("./App.jsx"));
const path = window.location.pathname.replace(/\/+$/, "");
const isLegacy = path === "/eski";

const fallback = <p role="status" style={{ padding: 24, fontSize: 15, fontFamily: "-apple-system, system-ui, sans-serif" }}>Yükleniyor…</p>;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={fallback}>{isLegacy ? <App /> : pickerMode ? <TestEkranlari /> : <V3App />}</Suspense>
  </React.StrictMode>
);
