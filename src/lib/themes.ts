import { L } from './i18n';

/**
 * Colour themes for the soft-glass design. Each theme is a pastel background
 * gradient plus an accent gradient; every other colour is derived from these so
 * all themes stay in the same calm family.
 */
export interface Theme {
  id: string;
  name: string;
  dark?: boolean;
  bg: [string, string, string];
  blobs: [string, string];
  accent: string;
  accent2: string;
  /** third stop used on the big round "add" button */
  pop: string;
  text: string;
  /** solid colour for sheets / toasts on dark themes */
  sheet?: string;
}

export const THEMES: Theme[] = [
  { id: 'lavender', get name() { return L('لافندر', 'Lavender'); }, bg: ['#EDE7FF', '#FFE9E0', '#E3F3FF'], blobs: ['#B9A8FF', '#FFC2B0'], accent: '#7E62F0', accent2: '#B36BF0', pop: '#FF8FA8', text: '#26233A' },
  { id: 'peach', get name() { return L('خوخي', 'Peach'); }, bg: ['#FFE6DA', '#FFF4E3', '#FDE5EF'], blobs: ['#FFBFA6', '#FFD98F'], accent: '#E8603F', accent2: '#F0932E', pop: '#F7B84B', text: '#3A2620' },
  { id: 'rose', get name() { return L('وردي', 'Rose'); }, bg: ['#FFE3EE', '#F3E5FF', '#FFEFE6'], blobs: ['#FFADC8', '#D8B5FF'], accent: '#D9467A', accent2: '#B05EE8', pop: '#FF9A8B', text: '#3A2030' },
  { id: 'mint', get name() { return L('نعناعي', 'Mint'); }, bg: ['#DCF5EA', '#E6F2FF', '#F0FAE3'], blobs: ['#9EE6C8', '#A9D4FF'], accent: '#0F9C7E', accent2: '#2FA9D6', pop: '#7ED9A6', text: '#17322C' },
  { id: 'sky', get name() { return L('سماوي', 'Sky'); }, bg: ['#E0EBFF', '#EEEDFF', '#DFF6FA'], blobs: ['#A8C6FF', '#A6E6F2'], accent: '#3768E8', accent2: '#4FB3EC', pop: '#8C7CFF', text: '#1E2A44' },
  { id: 'sand', get name() { return L('رملي', 'Sand'); }, bg: ['#F3EBDF', '#F9F2E7', '#E7EEE2'], blobs: ['#E6CBA8', '#C9DDBE'], accent: '#A26A42', accent2: '#C9964F', pop: '#D9AE6A', text: '#2F261E' },
  { id: 'night', dark: true, get name() { return L('ليلي', 'Night'); }, bg: ['#17142B', '#251838', '#101C30'], blobs: ['#5B44C8', '#C2487E'], accent: '#A48BFF', accent2: '#D67CF0', pop: '#FF8FB8', text: '#EEEAF8', sheet: '#1E1A33' },
  { id: 'ocean', dark: true, get name() { return L('بحري', 'Ocean'); }, bg: ['#0E1A2A', '#14223D', '#0C2A2C'], blobs: ['#2A6FD6', '#1FA59A'], accent: '#4FC7D9', accent2: '#6F95FF', pop: '#5EE0B4', text: '#E6F1F5', sheet: '#14202F' },
];

/** 'auto' follows the device: Lavender by day, Night when the system is dark */
export const AUTO = 'auto';
const systemDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
export const getTheme = (id?: string) => (id === AUTO ? THEMES.find((t) => t.id === (systemDark() ? 'night' : 'lavender'))! : THEMES.find((t) => t.id === id) || THEMES[0]);

const channels = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = (hex: string) => channels(hex).join(', ');
const a = (hex: string, alpha: number) => `rgba(${rgb(hex)}, ${alpha})`;

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (x: string, y: string) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

/** darkens a colour just enough for white text on it (or it on white) to reach the 4.5:1 reading minimum */
export function readable(hex: string, min = 4.5): string {
  let c = channels(hex);
  const hexOf = (v: number[]) => '#' + v.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  for (let i = 0; i < 40 && contrast(hexOf(c), '#FFFFFF') < min; i++) c = c.map((x) => x * 0.96);
  return hexOf(c).toUpperCase();
}

export function themeVars(theme: Theme): Record<string, string> {
  const d = !!theme.dark;
  // light themes: accents dark enough for white button text and for accent-coloured text
  const t = d ? theme : { ...theme, accent: readable(theme.accent), accent2: readable(theme.accent2) };
  const status = d
    ? { green: '#52D396', amber: '#FFB547', red: '#FF6B81', violet: '#B892FF' }
    : { green: readable('#14A06B'), amber: readable('#C27A06'), red: readable('#DD3D5C'), violet: readable('#8656E8') };
  const white = '#FFFFFF';
  return {
    '--g1': t.bg[0],
    '--g2': t.bg[1],
    '--g3': t.bg[2],
    '--blob1': a(t.blobs[0], d ? 0.35 : 0.55),
    '--blob2': a(t.blobs[1], d ? 0.25 : 0.5),
    '--bg': t.bg[0],
    '--bg-2': d ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.72)',
    '--surface': d ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.6)',
    '--surface-2': d ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.85)',
    '--elev': d ? 'rgba(255, 255, 255, 0.16)' : white,
    '--glass-border': d ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.9)',
    '--line': a(t.text, d ? 0.08 : 0.07),
    '--line-2': a(t.text, d ? 0.15 : 0.13),
    '--hover': a(t.text, d ? 0.05 : 0.035),
    '--press': a(t.text, d ? 0.09 : 0.06),
    '--track': a(t.text, d ? 0.1 : 0.08),
    '--text': t.text,
    '--muted': a(t.text, d ? 0.72 : 0.68),
    '--faint': a(t.text, d ? 0.6 : 0.6),
    '--accent': t.accent,
    '--accent-2': t.accent2,
    '--accent-soft': a(t.accent, d ? 0.18 : 0.11),
    '--accent-line': a(t.accent, 0.35),
    '--accent-dim': a(t.accent, 0.45),
    '--grad': `linear-gradient(135deg, ${t.accent}, ${t.accent2})`,
    '--grad-pop': `linear-gradient(135deg, ${t.accent}, ${t.pop})`,
    '--glow': `0 8px 22px ${a(t.accent, d ? 0.4 : 0.32)}`,
    // dark themes have light accents: dark text reads on them, white doesn't
    '--on-accent': d ? t.sheet || t.bg[0] : white,
    '--green': status.green,
    '--green-soft': a(status.green, 0.14),
    '--amber': status.amber,
    '--amber-soft': a(status.amber, 0.15),
    '--red': status.red,
    '--red-soft': a(status.red, 0.13),
    '--violet': status.violet,
    '--violet-soft': a(status.violet, 0.14),
    '--study': t.accent,
    '--work': status.amber,
    '--life': status.green,
    '--sheet': d ? t.sheet || t.bg[0] : 'rgba(255, 255, 255, 0.92)',
    '--toast': d ? a(t.sheet || t.bg[0], 0.95) : 'rgba(255, 255, 255, 0.92)',
    '--bar-bg': d ? a(t.sheet || t.bg[0], 0.86) : 'rgba(255, 255, 255, 0.8)',
    '--backdrop': d ? 'rgba(0, 0, 0, 0.5)' : a(t.text, 0.22),
    '--shadow': d ? '0 20px 60px rgba(0, 0, 0, 0.5)' : `0 20px 50px ${a(t.text, 0.14)}`,
    '--shadow-soft': d ? '0 8px 24px rgba(0, 0, 0, 0.25)' : `0 10px 30px ${a(t.accent, 0.08)}`,
    '--focus-bg': t.bg[0],
    'color-scheme': d ? 'dark' : 'light',
  };
}

export function applyTheme(id?: string) {
  const t = getTheme(id);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(t))) root.style.setProperty(k, v);
  root.dataset.theme = t.id;
  root.dataset.dark = t.dark ? '1' : '0';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg[0]);
  // read by theme-boot.js on the next load, so a dark theme doesn't flash light first
  try {
    localStorage.setItem('masar.themeBoot', JSON.stringify({ bg: t.bg[0], text: t.text, dark: !!t.dark }));
  } catch {
    /* ignore */
  }
}
