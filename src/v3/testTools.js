// Test ekranları (?test) ve test senaryoları (?ornek=<senaryo>) yalnız iki yerde açıktır: geliştirme sunucusu
// (npm run dev, iPhone'da canlı yenileme: npm run ios:canli) ve TestFlight derlemesi. TestFlight betiği web paketini
// VITE_TEST_ARACLARI=1 ile derler; o derleme yalnız iç test içindir, App Store'a gönderilemez. Google Play paketi ve
// diğer derlemeler bu değişken olmadan derlenir, test araçları görünmez.
export const TEST_TOOLS = import.meta.env.DEV || import.meta.env.VITE_TEST_ARACLARI === "1";
