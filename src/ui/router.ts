import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

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
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Moving between pages animates like iOS: a page deeper in (a course, a task) slides in from the
// leading side and back out the way it came; switching tabs cross-fades. The tab bar stays put.
addEventListener('hashchange', () => {
  const next = parse();
  const kind = next.id && !current.id ? 'push' : !next.id && current.id ? 'pop' : next.page === current.page && next.id === current.id ? 'same' : next.page === current.page ? 'push' : 'tab';
  const apply = () => {
    current = next;
    ls.forEach((l) => l());
    window.scrollTo({ top: 0 });
  };
  const start = (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }).startViewTransition;
  if (!start || kind === 'same' || reducedMotion() || document.visibilityState === 'hidden') return apply();
  const root = document.documentElement;
  root.dataset.nav = kind;
  start
    .call(document, () => flushSync(apply))
    .finished.catch(() => {})
    .finally(() => {
      if (root.dataset.nav === kind) delete root.dataset.nav;
    });
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

// An open sheet adds a history entry, so the phone's back button closes it instead of leaving the page.
let overlay = false;
let popping = false;
let queued: string | null = null;
let pushAfterPop = false;
let onOverlayBack: (() => void) | null = null;

export function pushOverlay(onBack: () => void) {
  onOverlayBack = onBack;
  if (overlay) return;
  // another sheet is still taking its entry off: add ours once it's gone
  if (popping) return void (pushAfterPop = true);
  history.pushState({ overlay: true }, '');
  overlay = true;
}

/** the sheet closed by itself: drop its history entry */
export function popOverlay() {
  pushAfterPop = false;
  if (!overlay) return;
  overlay = false;
  popping = true;
  history.back();
}

addEventListener('popstate', () => {
  if (popping) {
    popping = false;
    if (pushAfterPop) {
      pushAfterPop = false;
      history.pushState({ overlay: true }, '');
      overlay = true;
    }
    if (queued) {
      const h = queued;
      queued = null;
      location.hash = h;
    }
    return;
  }
  if (overlay) {
    overlay = false;
    onOverlayBack?.();
  }
});

export function go(path: string) {
  const h = '#/' + path.replace(/^#?\/?/, '');
  // wait for a closing sheet's history entry to go first, or take its place
  if (popping) queued = h;
  else if (overlay) {
    overlay = false;
    location.replace(h);
  } else location.hash = h;
}

export function back(fallback: string) {
  if (history.length > 1) history.back();
  else go(fallback);
}
