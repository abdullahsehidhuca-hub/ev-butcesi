// v3 önizleme girişi: /v3.html bu dosyayı yükler. Mevcut uygulamaya (src/main.jsx) dokunmaz.
import { createRoot } from "react-dom/client";
import AppV3 from "./AppV3.jsx";

createRoot(document.getElementById("root")).render(<AppV3 />);
