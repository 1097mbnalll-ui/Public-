// Prayer times on the device, no network: the sun's position for the date and place, by the
// Umm al-Qura method (Fajr at 18.5°, Isha 90 minutes after Maghrib — 120 in Ramadan, Asr when a
// shadow equals its object). A study session plans around them: from the adhan, through the
// iqama and the prayer, until you're back.

import type { Settings } from '../types';
import { L } from '../i18n';

export type PrayerId = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYERS: { id: PrayerId; t: [string, string] }[] = [
  { id: 'fajr', t: ['الفجر', 'Fajr'] },
  { id: 'dhuhr', t: ['الظهر', 'Dhuhr'] },
  { id: 'asr', t: ['العصر', 'Asr'] },
  { id: 'maghrib', t: ['المغرب', 'Maghrib'] },
  { id: 'isha', t: ['العشاء', 'Isha'] },
];
export const prayerName = (id: PrayerId) => L(...PRAYERS.find((p) => p.id === id)!.t);

/** minutes from the adhan to the iqama, as in Saudi mosques */
export const IQAMA: Record<PrayerId, number> = { fajr: 25, dhuhr: 20, asr: 20, maghrib: 10, isha: 20 };
/** the prayer itself */
export const PRAY_MIN = 10;

/** a few cities to pick from when the location isn't shared */
export const CITIES: { v: string; t: [string, string]; lat: number; lng: number }[] = [
  { v: 'riyadh', t: ['الرياض', 'Riyadh'], lat: 24.7136, lng: 46.6753 },
  { v: 'jeddah', t: ['جدة', 'Jeddah'], lat: 21.4858, lng: 39.1925 },
  { v: 'makkah', t: ['مكة', 'Makkah'], lat: 21.3891, lng: 39.8579 },
  { v: 'madinah', t: ['المدينة', 'Madinah'], lat: 24.5247, lng: 39.5692 },
  { v: 'dammam', t: ['الدمام', 'Dammam'], lat: 26.4207, lng: 50.0888 },
  { v: 'khobar', t: ['الخبر', 'Khobar'], lat: 26.2172, lng: 50.1971 },
  { v: 'qassim', t: ['بريدة', 'Buraydah'], lat: 26.3592, lng: 43.9818 },
  { v: 'hail', t: ['حائل', 'Hail'], lat: 27.5114, lng: 41.7208 },
  { v: 'tabuk', t: ['تبوك', 'Tabuk'], lat: 28.3835, lng: 36.5662 },
  { v: 'taif', t: ['الطائف', 'Taif'], lat: 21.2703, lng: 40.4158 },
  { v: 'abha', t: ['أبها', 'Abha'], lat: 18.2164, lng: 42.5053 },
  { v: 'jazan', t: ['جازان', 'Jazan'], lat: 16.8892, lng: 42.5511 },
  { v: 'najran', t: ['نجران', 'Najran'], lat: 17.5656, lng: 44.2289 },
  { v: 'kuwait', t: ['الكويت', 'Kuwait'], lat: 29.3759, lng: 47.9774 },
  { v: 'doha', t: ['الدوحة', 'Doha'], lat: 25.2854, lng: 51.531 },
  { v: 'manama', t: ['المنامة', 'Manama'], lat: 26.2285, lng: 50.586 },
  { v: 'dubai', t: ['دبي', 'Dubai'], lat: 25.2048, lng: 55.2708 },
  { v: 'abudhabi', t: ['أبوظبي', 'Abu Dhabi'], lat: 24.4539, lng: 54.3773 },
  { v: 'muscat', t: ['مسقط', 'Muscat'], lat: 23.588, lng: 58.3829 },
];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => ((a % b) + b) % b;

function sun(jd: number) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const Lr = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(Lr)), Math.cos(rad(Lr)))) / 15;
  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(Lr)))), eqt: q / 15 - fix(RA, 24) };
}

/** is this local day in Ramadan (Umm al-Qura calendar) */
function ramadan(d: Date): boolean {
  try {
    return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).format(d).replace(/\D/g, '') === '9';
  } catch {
    return false;
  }
}

/** the five adhan times (ms) for a local day `YYYY-MM-DD` at a place */
export function prayerTimes(day: string, lat: number, lng: number): Record<PrayerId, number> {
  const [y, m, d] = day.split('-').map(Number);
  const noonLocal = new Date(y, m - 1, d, 12);
  const tz = -noonLocal.getTimezoneOffset() / 60;
  // Julian day at 0h UT of that date, shifted to the place's longitude
  const A = Math.floor((14 - m) / 12);
  const Y = y + 4800 - A;
  const M = m + 12 * A - 3;
  const jd0 = d + Math.floor((153 * M + 2) / 5) + 365 * Y + Math.floor(Y / 4) - Math.floor(Y / 100) + Math.floor(Y / 400) - 32045 - 0.5 - lng / (15 * 24);
  const noonAt = (h: number) => fix(12 - sun(jd0 + h / 24).eqt, 24);
  const angleAt = (angle: number, h: number, before: boolean) => {
    const { decl } = sun(jd0 + h / 24);
    const T = deg(Math.acos((-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) / (Math.cos(rad(decl)) * Math.cos(rad(lat))))) / 15;
    return noonAt(h) + (before ? -T : T);
  };
  const asrAt = (h: number) => {
    const { decl } = sun(jd0 + h / 24);
    const angle = -deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(lat - decl))))));
    return angleAt(angle, h, false);
  };
  // two passes: a guess, then the sun's position at that guess
  let t = { fajr: 5, dhuhr: 12, asr: 13, maghrib: 18 };
  for (let i = 0; i < 2; i++) t = { fajr: angleAt(18.5, t.fajr, true), dhuhr: noonAt(t.dhuhr), asr: asrAt(t.asr), maghrib: angleAt(0.833, t.maghrib, false) };
  const shift = tz - lng / 15;
  const at = (h: number) => new Date(y, m - 1, d, 0, 0, 0).getTime() + Math.round((h + shift) * 60) * 60000;
  const maghrib = at(t.maghrib);
  return { fajr: at(t.fajr), dhuhr: at(t.dhuhr), asr: at(t.asr), maghrib, isha: maghrib + (ramadan(noonLocal) ? 120 : 90) * 60000 };
}

export interface PrayerGap {
  id: PrayerId;
  /** the adhan */
  from: number;
  /** back home and ready */
  to: number;
}

/** the time each prayer takes you away: adhan → iqama → prayer → back */
export const awayMin = (id: PrayerId, st: Settings) => IQAMA[id] + PRAY_MIN + (st.prayer?.back ?? 10);

/** the prayer gaps touching [from, to), over the days it spans; none when prayer times are off */
export function prayerGaps(st: Settings, from: number, to: number): PrayerGap[] {
  const p = st.prayer;
  if (!p?.on || p.lat == null || p.lng == null) return [];
  const out: PrayerGap[] = [];
  const day = new Date(from);
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - 1);
  while (day.getTime() < to + 86_400_000) {
    const k = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const pt = prayerTimes(k, p.lat, p.lng);
    for (const x of PRAYERS) {
      const g = { id: x.id, from: pt[x.id], to: pt[x.id] + awayMin(x.id, st) * 60000 };
      if (g.to > from && g.from < to) out.push(g);
    }
    day.setDate(day.getDate() + 1);
  }
  return out.sort((a, b) => a.from - b.from);
}
