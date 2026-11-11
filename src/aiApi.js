// Yapay zekâ uç noktaları Firebase Functions'ta (functions/index.js, bölge europe-west1).
// Tam adres kullanılır: iOS kabuğunda (capacitor://localhost) göreli "/api" adresi hiçbir sunucuya ulaşmaz.
const BASE = "https://europe-west1-ev-butcesi-96167.cloudfunctions.net";

/** @param {"aiAdvisor"|"analyzeReceipt"|"analyzeStatement"} name */
export const aiUrl = name => `${BASE}/${name}`;
