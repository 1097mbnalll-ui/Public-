import { lang } from '../lib/i18n';
import { useSyncExternalStore } from 'react';

export interface Route {
  page: string;
  id?: string;
  sub?: string;
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const [page, id, sub] = path.split('/').map(decodeURIComponent);
  return { page: page || 'today', id, sub, query: new URLSearchParams(qs || '') };
}

let current = parse();
const ls = new Set<() => void>();
addEventListener('hashchange', () => {
  current = parse();
  ls.forEach((l) => l());
  window.scrollTo({ top: 0 });
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (f) => {
      ls.add(f);
      return () => ls.delete(f);
    },
    () => current,
  );
}

export function go(path: string) {
  location.hash = '#/' + path.replace(/^#?\/?/, '');
}

/**
 * open a Masar link (course pack / device transfer) inside the app. On iPhone the
 * Home Screen app keeps its data apart from Safari, so a tapped link would land in
 * Safari — pasting it here keeps everything in the installed app.
 */
export async function openPastedLink(): Promise<boolean> {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { /* permission refused — ask instead */ }
  if (!/#\/(import|receive)\?/.test(text)) text = prompt(lang() === 'en' ? 'Paste the link here' : 'الصق الرابط هنا') || '';
  const m = text.trim().match(/#\/((?:import|receive)\?\S+)/);
  if (!m) return false;
  go(m[1]);
  return true;
}

export function back(fallback: string) {
  if (history.length > 1) history.back();
  else go(fallback);
}
