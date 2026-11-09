import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180
  },
  build: {
    rollupOptions: {
      output: {
        // Kütüphaneler ayrı parçalarda: iki arayüz de aynı dosyaları paylaşır ve uygulama
        // güncellendiğinde değişmeyen kütüphane dosyaları tarayıcı önbelleğinden gelir.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/firebase/") || id.includes("/@firebase/")) return "firebase";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "react";
          if (id.includes("/papaparse/")) return "papaparse";
        }
      }
    }
  }
});
