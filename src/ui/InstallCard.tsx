import { isNative } from '../lib/native';
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

type Env = 'standalone' | 'ios' | 'inapp' | 'prompt' | 'samsung' | 'android' | 'desktop';

/** what this browser can do to install the app */
export function installEnv(): Env {
  const ua = navigator.userAgent;
  // the Android app from the store is already installed
  if (isNative()) return 'standalone';
  if (matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) return 'standalone';
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  // browsers inside other apps (WhatsApp, Instagram, Facebook, Snapchat, Google app…) can't install anything
  if (/android/i.test(ua) && /; wv\)|FBAN|FBAV|Instagram|Line\/|Snapchat|WhatsApp|GSA\/|Telegram/i.test(ua)) return 'inapp';
  if (deferred) return 'prompt';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

/** open this page in Chrome from an in-app browser */
const chromeIntent = () => `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end`;

/**
 * Data lives only in this browser. On iPhone, Safari clears a site's storage after about a
 * week without a visit unless it's on the Home Screen — so we say so, plainly, until it is.
 * On Android every case gets a way in: the one-tap prompt, Samsung Internet's menu, Chrome's
 * menu, or — inside another app's browser — a button that reopens the page in Chrome.
 */
export function InstallCard({ always }: { always?: boolean }) {
  const [, bump] = useState(0);
  const [hidden, setHidden] = useState(() => !always && hiddenUntil() > Date.now());
  useEffect(() => {
    const l = () => bump((x) => x + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  const env = installEnv();
  if (env === 'standalone') return always ? <div className="tile install-card"><b>✓ {L('«مدار» مثبّت على هذا الجهاز', 'Madar is installed on this device')}</b></div> : null;
  if (hidden || (env === 'desktop' && !always)) return null;
  const ios = env === 'ios';

  const later = () => {
    try {
      localStorage.setItem(KEY, String(Date.now() + 14 * 86_400_000));
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  const how: Record<Env, string> = {
    ios: L('بياناتك محفوظة في هذا الجوال فقط، وسفاري يمسحها إذا ما فتحت الموقع أسبوع. اضغط زر المشاركة ⬆︎ ثم «إضافة إلى الشاشة الرئيسية»، وافتحه من هناك.', "Your data is stored on this phone only, and Safari clears it if you don't open the site for a week. Tap Share ⬆︎, then “Add to Home Screen”, and open it from there."),
    inapp: L('أنت فاتح الرابط من داخل تطبيق ثاني، وهذا ما يقدر يثبّت. اضغط الزر يفتح «مدار» في Chrome، وهناك اضغط «ثبّت».', "You opened the link inside another app, which can't install. Tap the button to open Madar in Chrome, then tap “Install” there."),
    prompt: L('ضغطة وحدة ويصير عندك أيقونة مثل أي تطبيق: يفتح أسرع، يشتغل بدون إنترنت، وبياناتك تبقى محفوظة أكثر.', 'One tap and it’s an icon like any app: opens faster, works offline, keeps your data safer.'),
    samsung: L('من متصفح سامسونج: اضغط ☰ تحت ← «إضافة الصفحة إلى» ← «الشاشة الرئيسية». أو افتحه في Chrome وثبّته بضغطة.', 'In Samsung Internet: tap ☰ → “Add page to” → “Home screen”. Or open it in Chrome and install with one tap.'),
    android: L('اضغط ⋮ فوق ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', 'Tap ⋮ at the top → “Install app” or “Add to Home screen”.'),
    desktop: L('في Chrome أو Edge: أيقونة التثبيت ⊕ في شريط العنوان.', 'In Chrome or Edge: the install icon ⊕ in the address bar.'),
    standalone: '',
  };

  return (
    <div className="tile install-card">
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <span className="ic-round"><Icon name="shield" size={18} /></span>
        <div className="grow">
          <b>{ios ? L('احمِ بياناتك: أضف «مدار» للشاشة الرئيسية', 'Protect your data: add Madar to your Home Screen') : L('ثبّت «مدار» كتطبيق', 'Install Madar as an app')}</b>
          <div className="small muted" style={{ marginTop: 3 }}>{how[env]}</div>
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
            {env === 'prompt' && (
              <button className="btn sm primary" onClick={async () => { deferred?.prompt(); await deferred?.userChoice; deferred = null; bump((x) => x + 1); }}>
                <Icon name="plus" size={14} /> {L('ثبّت', 'Install')}
              </button>
            )}
            {(env === 'inapp' || env === 'samsung') && (
              <a className={`btn sm ${env === 'inapp' ? 'primary' : ''}`} href={chromeIntent()}>{L('افتح في Chrome', 'Open in Chrome')}</a>
            )}
            {ios && (
              <button className="btn sm primary" onClick={exportUI}>
                <Icon name="download" size={14} /> {L('نزّل نسخة احتياطية الآن', 'Download a backup now')}
              </button>
            )}
            {!always && <button className="btn sm ghost" onClick={later}>{L('لاحقًا', 'Later')}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
