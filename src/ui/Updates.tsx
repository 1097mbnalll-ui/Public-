import { useEffect, useState } from 'react';
import { Sheet } from './kit';
import { Icon } from './Icon';
import { closeSheet, openSheet } from './sheets';
import { getState, useApp } from '../lib/store';
import * as A from '../lib/actions';
import { CHANGES, cmpVersion, releasesBetween, VERSION, type Release } from '../lib/changelog';
import { isNative, SITE_URL } from '../lib/native';
import { fmtDate } from '../lib/dates';
import { L } from '../lib/i18n';

// Updates: the site publishes version.json with each build. The app compares it with its own
// version — when the site is newer, a notice says an update is out (the web reloads into it, the
// Android app downloads the new APK). After updating, «وش الجديد» lists what changed.

export const APK_URL = 'https://github.com/1097mbnalll-ui/Public-/releases/download/latest-apk/madar.apk';
const LATER = 'masar.updateLater';

async function remote(): Promise<Release | null> {
  try {
    const url = isNative() ? `${SITE_URL}version.json` : './version.json';
    const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.version === 'string' && j.release && Array.isArray(j.release.items) ? { ...j.release, v: j.version } : null;
  } catch {
    return null;
  }
}

// one check for the whole app (each page mounts its own notice): at most every 20 minutes
let lastCheck = 0;
let found: Release | null = null;
const newer = (r: Release | null) => {
  let later = '';
  try { later = localStorage.getItem(LATER) || ''; } catch { /* storage blocked */ }
  return r && cmpVersion(r.v, VERSION) > 0 && later !== r.v ? r : null;
};

/** a notice at the top when the site has a newer version than the one running */
export function UpdateNotice() {
  const [rel, setRel] = useState<Release | null>(() => newer(found));
  useEffect(() => {
    const check = () => {
      if (Date.now() - lastCheck < 20 * 60_000) return;
      lastCheck = Date.now();
      void remote().then((r) => {
        found = r;
        setRel(newer(r));
      });
    };
    const first = setTimeout(check, 3000);
    const vis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(first); document.removeEventListener('visibilitychange', vis); };
  }, []);
  if (!rel) return null;
  const update = async () => {
    if (isNative()) {
      window.open(APK_URL, '_blank');
      return;
    }
    try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* no worker: a plain reload */ }
    location.reload();
  };
  const later = () => {
    try { localStorage.setItem(LATER, rel.v); } catch { /* storage blocked */ }
    setRel(null);
  };
  return (
    <div className="upd" role="status">
      <span className="upd-i"><Icon name="download" size={18} /></span>
      <div className="m">
        <b>{L(`نزل تحديث جديد · ${rel.v}`, `A new update is out · ${rel.v}`)}</b>
        <small>{L(...rel.items[0])}{rel.items.length > 1 ? L(` و${rel.items.length - 1} غيرها`, ` and ${rel.items.length - 1} more`) : ''}</small>
      </div>
      <div className="a">
        <button className="upd-go" onClick={update}>{isNative() ? L('نزّله', 'Download') : L('حدّث', 'Update')}</button>
        <button className="icon-btn sm" aria-label={L('لاحقًا', 'Later')} onClick={later}><Icon name="x" size={15} /></button>
      </div>
    </div>
  );
}

/** after an update: what's new, once */
export function useWhatsNew() {
  const seen = useApp().meta.seenVersion;
  useEffect(() => {
    const s = getState();
    if (!s.meta.onboarded) {
      if (!seen) A.setMeta({ seenVersion: VERSION });
      return;
    }
    if (seen && cmpVersion(VERSION, seen) <= 0) return;
    const t = setTimeout(() => {
      openSheet({ type: 'whats-new', since: seen || CHANGES[1]?.v });
      A.setMeta({ seenVersion: VERSION });
    }, 1200);
    return () => clearTimeout(t);
  }, [seen]);
}

export function WhatsNewSheet({ since }: { since?: string }) {
  const list = since ? releasesBetween(since) : CHANGES;
  return (
    <Sheet title={since ? L(`وش الجديد في ${VERSION}`, `What's new in ${VERSION}`) : L('سجل التحديثات', 'Update history')} onClose={closeSheet} footer={<button className="btn primary grow" onClick={closeSheet}>{L('تمام', 'OK')}</button>}>
      <div className="wn">
        {(list.length ? list : CHANGES.slice(0, 1)).map((r) => (
          <section key={r.v}>
            <div className="wn-h"><b className="num">{r.v}</b><small>{fmtDate(r.day, false)}</small></div>
            <ul>{r.items.map((x, i) => <li key={i}>{L(...x)}</li>)}</ul>
          </section>
        ))}
        {since && <button className="btn sm ghost" onClick={() => openSheet({ type: 'whats-new' })}>{L('كل التحديثات', 'All updates')}</button>}
      </div>
    </Sheet>
  );
}
