import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { exportUI } from './ops';
import { L } from '../lib/i18n';

// Chrome/Android offer an install prompt; keep it so the card can trigger it later
let deferred: any = null;
const listeners = new Set<() => void>();
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  listeners.forEach((l) => l());
});

const KEY = 'masar.installHiddenUntil';
const hiddenUntil = () => {
  try {
    return Number(localStorage.getItem(KEY) || 0);
  } catch {
    return 0;
  }
};

/**
 * Data lives only in this browser. On iPhone, Safari clears a site's storage after about a
 * week without a visit unless it's on the Home Screen — so we say so, plainly, until it is.
 */
export function InstallCard() {
  const [, bump] = useState(0);
  const [hidden, setHidden] = useState(() => hiddenUntil() > Date.now());
  useEffect(() => {
    const l = () => bump((x) => x + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (standalone || hidden || (!ios && !deferred)) return null;

  const later = () => {
    try {
      localStorage.setItem(KEY, String(Date.now() + 14 * 86_400_000));
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <div className="tile install-card">
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <span className="ic-round"><Icon name="shield" size={18} /></span>
        <div className="grow">
          <b>{ios ? L('احمِ بياناتك: أضف «مسار» للشاشة الرئيسية', 'Protect your data: add Masar to your Home Screen') : L('ثبّت «مسار» كتطبيق', 'Install Masar as an app')}</b>
          <div className="small muted" style={{ marginTop: 3 }}>
            {ios
              ? L('بياناتك محفوظة في هذا الجوال فقط، وسفاري يمسحها إذا ما فتحت الموقع أسبوع. اضغط زر المشاركة ⬆︎ ثم «إضافة إلى الشاشة الرئيسية»، وافتحه من هناك.', "Your data is stored on this phone only, and Safari clears it if you don't open the site for a week. Tap Share ⬆︎, then “Add to Home Screen”, and open it from there.")
              : L('يفتح أسرع، يشتغل بدون إنترنت، وبياناتك تبقى محفوظة أكثر.', 'Opens faster, works offline, and keeps your data safer.')}
          </div>
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
            {!ios && (
              <button className="btn sm primary" onClick={async () => { deferred?.prompt(); await deferred?.userChoice; deferred = null; bump((x) => x + 1); }}>
                <Icon name="plus" size={14} /> {L('ثبّت', 'Install')}
              </button>
            )}
            <button className={`btn sm ${ios ? 'primary' : ''}`} onClick={exportUI}>
              <Icon name="download" size={14} /> {L('نزّل نسخة احتياطية الآن', 'Download a backup now')}
            </button>
            <button className="btn sm ghost" onClick={later}>{L('لاحقًا', 'Later')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
