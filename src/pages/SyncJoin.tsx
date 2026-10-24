import { useState } from 'react';
import { Empty } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { PageTop } from '../ui/PageTop';
import { go } from '../ui/router';
import { toast } from '../ui/toast';
import { getState } from '../lib/store';
import { getSync, joinFromLink } from '../lib/sync';
import { L } from '../lib/i18n';

/** #/sync?c=… — the pairing link from another device */
export function SyncJoin() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const s = getState();
  const has = s.tasks.length + s.procedures.length + s.courses.length + s.expenses.length > 0;
  if (getSync()) {
    return (
      <div>
        <PageTop title={L('المزامنة', 'Sync')} />
        <div className="card"><Empty icon="check" title={L('هذا الجهاز مربوط أصلًا ✓', 'This device is already linked ✓')}><button className="btn sm" style={{ marginTop: 12 }} onClick={() => go('today')}>{L('اليوم', 'Today')}</button></Empty></div>
      </div>
    );
  }
  return (
    <div>
      <PageTop title={L('اربط هذا الجهاز', 'Link this device')} />
      <div className="card stack" style={{ padding: 18 }}>
        <div>{L('هذا الجهاز بيشوف نفس بياناتك اللي على جهازك الثاني، وأي تعديل هنا أو هناك يوصل لحاله.', 'This device will see the same data as your other one, and every change here or there carries over by itself.')}</div>
        {has && <div className="notice">{L('فيه بيانات على هذا الجهاز — بندمجها مع بيانات جهازك الثاني، ما يضيع شي.', 'There’s data on this device — it will be merged with your other device’s, nothing is lost.')}</div>}
        {err && <div className="notice amber">{err}</div>}
        <button className="btn primary" disabled={busy} onClick={async () => {
          setBusy(true);
          setErr('');
          try {
            await joinFromLink(location.hash);
            toast(L('تم الربط — بياناتك صارت هنا ✓', 'Linked — your data is here ✓'), { ms: 6000 });
            go('today');
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}><Icon name="repeat" size={16} /> {busy ? L('جاري الربط…', 'Linking…') : L('اربط', 'Link')}</button>
      </div>
    </div>
  );
}
