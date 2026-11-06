// Dönem (bütçe ayı) yardımcıları.
// Dönem anahtarı "YYYY-MM": maaş gününden bir sonraki maaş gününün öncesine kadar.
// Örn. payDay=15 → "2026-04" = 15 Nisan – 14 Mayıs.
// Tüm hesaplar işlemin TARİHİNE dayanır; cihaz saati yalnızca "bugün" sorusunda kullanılır.

const pad = n => String(n).padStart(2, "0");
const key = (y, m) => `${y}-${pad(m)}`;
const parseKey = k => k.split("-").map(Number);

export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Şubat gibi kısa aylarda 29-31 maaş günü ayın son gününe çekilir.
const clampDay = (y, m, day) => Math.min(Math.max(1, day), daysInMonth(y, m));

export function isPeriodKey(k) {
  return typeof k === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
}

export function isDate(d) {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split("-").map(Number);
  return m >= 1 && m <= 12 && day >= 1 && day <= daysInMonth(y, m);
}

export function nextPeriod(k) {
  let [y, m] = parseKey(k);
  m++; if (m > 12) { m = 1; y++; }
  return key(y, m);
}

export function prevPeriod(k) {
  let [y, m] = parseKey(k);
  m--; if (m < 1) { m = 12; y--; }
  return key(y, m);
}

// from → to arası dönem sayısı (to önceyse negatif).
export function periodDistance(from, to) {
  const [y1, m1] = parseKey(from);
  const [y2, m2] = parseKey(to);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function addPeriods(k, n) {
  let [y, m] = parseKey(k);
  const total = y * 12 + (m - 1) + n;
  return key(Math.floor(total / 12), (total % 12) + 1);
}

// Tarihin ait olduğu dönem.
export function periodOf(date, payDay = 1) {
  const [y, m, d] = date.split("-").map(Number);
  if (d < clampDay(y, m, payDay)) return prevPeriod(key(y, m));
  return key(y, m);
}

function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// Dönemin ilk ve son günü (ikisi dahil).
export function periodRange(k, payDay = 1) {
  const [y, m] = parseKey(k);
  const start = `${key(y, m)}-${pad(clampDay(y, m, payDay))}`;
  const [ny, nm] = parseKey(nextPeriod(k));
  const nextStart = `${key(ny, nm)}-${pad(clampDay(ny, nm, payDay))}`;
  return { start, end: addDays(nextStart, -1) };
}

// Ayın belirli bir gününe denk gelen, dönem içindeki tarih (son ödeme günü gibi).
export function dateInPeriod(k, day, payDay = 1) {
  const { start } = periodRange(k, payDay);
  const [y, m] = parseKey(k);
  const sameMonth = `${key(y, m)}-${pad(clampDay(y, m, day))}`;
  if (sameMonth >= start) return sameMonth;
  const [ny, nm] = parseKey(nextPeriod(k));
  return `${key(ny, nm)}-${pad(clampDay(ny, nm, day))}`;
}

// Yerel saatle bugünün tarihi ("YYYY-MM-DD").
export function today(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
