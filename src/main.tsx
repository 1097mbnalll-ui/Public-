import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { init } from './lib/store';
import { setServiceWorker } from './lib/reminders';

init().then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
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
