import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { init } from './lib/store';
import { setServiceWorker } from './lib/reminders';
import { onSmsAdded, startSync } from './lib/sync';
import { toast } from './ui/toast';
import { L } from './lib/i18n';

init().then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
  onSmsAdded((n) => toast(n === 1 ? L('📩 أُضيف مصروف من رسائل البنك', '📩 An expense was added from your bank messages') : L(`📩 أُضيفت ${n} مصاريف من رسائل البنك`, `📩 ${n} expenses added from your bank messages`), { undoable: true, ms: 6000 }));
  startSync();
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // a new version took over → reload once so the page runs the new code
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => setServiceWorker(reg))
      .catch(() => setServiceWorker(null));
  });
}

// notification click → open the related screen
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'open' && typeof e.data.url === 'string') location.hash = e.data.url.replace(/^#?/, '#');
});
