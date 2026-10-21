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

export function back(fallback: string) {
  if (history.length > 1) history.back();
  else go(fallback);
}
