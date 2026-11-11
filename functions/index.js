// Firebase Functions: yapay zekâ uç noktaları (Vercel api/ klasörünün yerine).
// Adresler: https://europe-west1-ev-butcesi-96167.cloudfunctions.net/{aiAdvisor|analyzeReceipt|analyzeStatement}
// İşleyiciler functions/ai/ altında; oturum jetonu her istekte sunucuda doğrulanır.
// Model functions/ai/providers.js içindeki AI_MODEL satırıyla seçilir. Seçilen sağlayıcının anahtarı Firebase gizli
// anahtar deposunda (Secret Manager) tutulur, koda ve istemciye girmez. Kurulum ve model değişikliği: npm run ai:kurulum

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import advisor from "./ai/advisor.js";
import receipt from "./ai/receipt.js";
import statement from "./ai/statement.js";
import { modelInfo } from "./ai/providers.js";

// Bilinmeyen model yazılırsa yükleme burada açık bir hatayla durur.
const AI_KEY = defineSecret(modelInfo().keyName);

// Tarayıcıdan çağrıya izin verilen kaynaklar: iOS kabuğu (Capacitor), Android kabuğu, yerel geliştirme sunucusu
// ve Vercel kapanana kadar eski web adresi. Uygulama dışı sitelerden gelen tarayıcı istekleri reddedilir.
const ORIGINS = [
  "capacitor://localhost",
  "http://localhost",
  "http://localhost:5180",
  "https://ev-butcesi-eight.vercel.app"
];

const options = timeoutSeconds => ({
  region: "europe-west1",
  cors: ORIGINS,
  secrets: [AI_KEY],
  timeoutSeconds,
  // Maliyet koruması: aynı anda en fazla 3 kopya çalışır.
  maxInstances: 3
});

export const aiAdvisor = onRequest(options(300), advisor);
export const analyzeReceipt = onRequest(options(120), receipt);
export const analyzeStatement = onRequest(options(300), statement);
