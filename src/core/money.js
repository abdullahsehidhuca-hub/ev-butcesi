// Para yardımcıları.
// Tüm tutarlar para biriminin 1/100'ü cinsinden TAM SAYI tutulur (TL için kuruş).
// Kayan noktalı toplama hataları (0,1 + 0,2) bu sayede oluşmaz.

export const CURRENCIES = ["TRY", "USD", "EUR", "XAU"];
export const BASE = "TRY";

export const toMinor = value => Math.round(Number(value) * 100);
export const fromMinor = minor => minor / 100;

export const isMinor = v => Number.isSafeInteger(v);

// rates: { USD: 34.2, EUR: 37.1, XAU: 2950 } → 1 birimin TL karşılığı.
// Kur yoksa null döner; çağıran taraf eksik kuru raporlar, sessizce 0 saymaz.
export function toBase(amount, currency, rates) {
  if (currency === BASE) return amount;
  const rate = rates?.[currency];
  if (!(rate > 0)) return null;
  return Math.round(amount * rate);
}

export const sum = list => list.reduce((s, v) => s + v, 0);

const TRY_FMT = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatTRY = minor => TRY_FMT.format(fromMinor(minor));
