// Test senaryoları: ekran seçicideki (TestEkranlari.jsx) her satır uygulamayı bu verilerden biriyle açar (/?ornek=<id>).
// Örnek veri modudur: bulut kapalıdır, her senaryo kendi anahtarında tutulur; gerçek veri okunmaz ve yazılmaz.
// Kayıtlar core fonksiyonlarıyla eklenir; geçersiz bir kayıt olursa core hata verir.

import { emptyState, addAccount, addObligation, setAllowance } from "../core/index.js";
import * as dolu from "./sampleData.js";

const TODAY = dolu.SAMPLE_TODAY;
const TL = n => Math.round(n * 100);

const fresh = mode => {
  const s = emptyState();
  return mode ? { ...s, settings: { ...s.settings, trackingMode: mode } } : s;
};
const withBank = s => addAccount(s, { id: "ana", name: "Ana hesap", type: "bank", currency: "TRY", opening: { date: TODAY, balance: TL(25000) } });
const withCard = s => addAccount(s, { id: "kart", name: "Bonus kart", type: "credit", currency: "TRY", cutoffDay: 28, paymentDay: 10, opening: { date: TODAY, balance: 0 } });
const withIncome = s => addObligation(s, { id: "maas", kind: "income", name: "Maaş", amount: TL(60000), currency: "TRY", accountId: "ana", startPeriod: "2026-11", dueDay: 15 });

// Her hesabı ayrı izleyen aile: dolu örnek veriye konfor kartı (haftalık 1.500 TL, Pazartesi) ve talimat hesabı eklenir.
// Açılışta bekleyen iki haftalık yükleme yazılır; talimat hesabına aktarım ve bankayla karşılaştırma hatırlatması çıkar.
function separateFull() {
  let s = dolu.buildSampleState();
  s = { ...s, settings: { ...s.settings, trackingMode: "separate", setupDone: true } };
  s = addAccount(s, { id: "konfor", name: "Konfor kartı", type: "prepaid", currency: "TRY", opening: { date: "2026-11-15", balance: 0 } });
  s = addAccount(s, { id: "talimat", name: "Talimat hesabı", type: "bank", currency: "TRY", opening: { date: "2026-11-15", balance: 0 } });
  s = setAllowance(s, "konfor", { amount: TL(1500), weekday: 1, fromAccountId: "maas" }, "2026-11-15");
  return addObligation(s, { id: "internet", kind: "fixed", name: "İnternet", icon: "repeat", color: "teal", amount: TL(650), currency: "TRY",
    accountId: "talimat", categoryId: "fatura", startPeriod: "2026-01", dueDay: 28, autopayFrom: "2026-11" });
}

export const SCENARIOS = [
  { id: "duzen", group: "Hoş geldiniz", title: "Kurulumu baştan başlat", sub: "Hiçbir şey girilmemiş yeni bütçe · hesap düzeni sorusu", build: () => fresh(null) },
  { id: "tek", group: "Hoş geldiniz", title: "Tek hesap", sub: "Düzen seçilmiş, adımların hepsi boş", build: () => fresh("single") },
  { id: "kart", group: "Hoş geldiniz", title: "Kartlarımı da izlerim · kredi kartı adımı", sub: "Ana hesap eklenmiş", build: () => withBank(fresh("cards")) },
  { id: "ayri", group: "Hoş geldiniz", title: "Her hesabı ayrı izlerim · talimat hesabı adımı", sub: "Ana hesap ve kredi kartı eklenmiş", build: () => withCard(withBank(fresh("separate"))) },
  { id: "basla", group: "Hoş geldiniz", title: "Başla düğmesi", sub: "Hesap ve maaş eklenmiş, sabit ödeme yok", build: () => withIncome(withCard(withBank(fresh("cards")))) },
  { id: "dolu", group: "Özet", title: "Dolu özet", sub: "İki kişilik örnek bütçe, ay ortası", build: dolu.buildSampleState },
  { id: "harclik", group: "Özet", title: "Haftalık harçlık ve talimat aktarımı", sub: "Konfor kartı, talimat hesabı, bankayla karşılaştırma hatırlatması", build: separateFull },
  { id: "ayarlar", group: "Ayarlar", title: "Ayarlar · hesaplar ve haftalık yükleme", sub: "Konfor kartına dokunup haftalık yüklemeyi görün", build: separateFull, tab: "settings" }
];

export const stateKey = id => `evButcesi.v3.test.${id}.state`;
export const planKey = id => `evButcesi.v3.test.${id}.plan`;

// V3App'in örnek veri biçimi (sampleData.js ile aynı alanlar). Bilinmeyen senaryo dolu örnekle açılır.
export function scenario(id) {
  const sc = SCENARIOS.find(x => x.id === id) || SCENARIOS.find(x => x.id === "dolu");
  return {
    SAMPLE_TODAY: TODAY,
    SAMPLE_MEMBERS: dolu.SAMPLE_MEMBERS,
    SAMPLE_LABEL: `Test · ${sc.title}`,
    STATE_KEY: stateKey(sc.id),
    PLAN_KEY: planKey(sc.id),
    buildSampleState: sc.build
  };
}
