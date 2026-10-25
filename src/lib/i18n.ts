// Interface language. Every UI string is written as L('عربي', 'English') at its source, so both
// languages live side by side and nothing can drift out of sync. The store keeps `current` in step
// with settings.lang before any re-render.

export type Lang = 'ar' | 'en';

let current: Lang = 'ar';

export function setLang(l: Lang | undefined) {
  current = l === 'en' ? 'en' : 'ar';
}

export const lang = (): Lang => current;

export function L(ar: string, en: string): string {
  return current === 'en' ? en : ar;
}

/** a pinned edge marker (inset shadow) on the reading-start side */
export const startEdge = (color: string) => `inset ${current === 'en' ? 3 : -3}px 0 0 ${color}`;

const SIZE_EN: Record<string, string> = {
  'صفحة': 'pages',
  'شريحة': 'slides',
  'محاضرة': 'lectures',
  'درس': 'lessons',
  'مسألة': 'problems',
  'دقيقة': 'min',
  'دقيقة فيديو': 'video min',
};
/** course size units are stored in Arabic; show them in the current language */
export const sz = (label?: string) => {
  const v = label || 'صفحة';
  return current === 'en' ? SIZE_EN[v] || v : v;
};

const PLURAL_AR: Record<string, [string, string]> = {
  'صفحة': ['صفحتين', 'صفحات'],
  'شريحة': ['شريحتين', 'شرائح'],
  'محاضرة': ['محاضرتين', 'محاضرات'],
  'درس': ['درسين', 'دروس'],
  'مسألة': ['مسألتين', 'مسائل'],
  'دقيقة': ['دقيقتين', 'دقائق'],
  'دقيقة فيديو': ['دقيقتين فيديو', 'دقائق فيديو'],
};
/** an amount of material, counted the way it's said: «صفحتين»، «7 صفحات»، «12 صفحة» · "1 page", "7 pages" */
export const szn = (n: number, label?: string) => {
  const v = label || 'صفحة';
  if (current === 'en') {
    const pl = SIZE_EN[v] || v;
    return `${n} ${n === 1 && pl.endsWith('s') ? pl.slice(0, -1) : pl}`;
  }
  const f = PLURAL_AR[v];
  if (f && n === 2) return f[0];
  if (f && Number.isInteger(n) && n >= 3 && n <= 10) return `${n} ${f[1]}`;
  return `${n} ${v}`;
};

/** rotation that keeps the same visual meaning when the layout mirrors */
export const turn = (deg: number) => `rotate(${current === 'en' ? -deg : deg}deg)`;
