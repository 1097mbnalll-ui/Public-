import { useMemo, useState } from 'react';
import { Empty } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { getState, replaceState } from '../lib/store';
import { fromB64url, mergeStates, open, WrongCode } from '../lib/transfer';
import type { AppState } from '../lib/types';
import { go, useRoute } from '../ui/router';
import { toast } from '../ui/toast';
import { PageTop } from '../ui/PageTop';
import { L, lang } from '../lib/i18n';
import { stateCounts } from '../lib/backup';

/** a file picked on «أنت» is handed over here in memory (never put in the URL) */
let pendingFile: Uint8Array | null = null;
export function receiveFile(bytes: Uint8Array) {
  pendingFile = bytes;
  go('receive?f=1');
}

export function Receive() {
  const q = useRoute().query;
  const packed = useMemo(() => {
    try {
      if (q.get('f') && pendingFile) return pendingFile;
      const d = q.get('d');
      return d ? fromB64url(d) : null;
    } catch {
      return null;
    }
  }, [q]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [got, setGot] = useState<{ state: AppState; exportedAt?: string } | null>(null);

  const mine = getState();
  const hasData = mine.tasks.length + mine.procedures.length + mine.courses.length > 0;

  if (!packed)
    return (
      <div>
        <PageTop title={L("استقبال بيانات", "Receive data")} back={{ label: L('أنت', "You"), to: 'me' }} />
        <div className="card"><Empty icon="alert" title={L("الرابط ناقص أو غير صالح", "The link is incomplete or invalid")}>{L("اطلب رابطًا جديدًا من جهازك الأول، أو استخدم ملف النقل من صفحة «أنت».", "Ask your first device for a new link, or use the transfer file from the “You” page.")}</Empty></div>
      </div>
    );

  const unlock = async () => {
    setBusy(true);
    setErr('');
    try {
      setGot(await open(packed, code));
    } catch (e) {
      setErr(e instanceof WrongCode ? L('الكود غير صحيح — تأكد منه وحاول مرة أخرى.', "Wrong code — check it and try again.") : (e as Error).message);
    }
    setBusy(false);
  };

  const finish = async (mode: 'replace' | 'merge') => {
    if (!got) return;
    const next = mode === 'merge' ? mergeStates(getState(), got.state) : { ...got.state, meta: { ...got.state.meta, onboarded: true } };
    await replaceState(next, mode === 'merge' ? L('دمج بيانات', "Merge data") : L('استبدال بيانات', "Replace data"));
    pendingFile = null;
    go('today'); // also drops the encrypted data from the address bar
    toast(mode === 'merge' ? L('دُمجت البيانات ✓', "Data merged ✓") : L('انتقلت بياناتك إلى هذا الجهاز ✓', "Your data is now on this device ✓"), { undoable: true, ms: 8000 });
  };

  return (
    <div>
      <PageTop title={L("استقبال بيانات", "Receive data")} sub={L("من جهازك الآخر — مشفّرة، وتحتاج الكود لفتحها", "From your other device — encrypted, needs the code to open")} back={{ label: L('اليوم', "Today"), to: 'today' }} />
      {!got ? (
        <div className="card fields">
          <div className="field">
            <label>{L("كود النقل", "Transfer code")}</label>
            <input
              className="input big"
              style={{ direction: 'ltr', textAlign: 'center', letterSpacing: '.08em' }}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && code.trim() && unlock()}
              placeholder="XXXX-XXXX-XXXX"
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              aria-label={L("كود النقل", "Transfer code")}
            />
          </div>
          {err && <div className="notice red small">{err}</div>}
          <button className="btn primary" disabled={!code.trim() || busy} onClick={unlock}>
            {busy ? L('جارٍ الفتح…', "Opening…") : L('افتح', "Open")}
          </button>
        </div>
      ) : (
        <div className="stack">
          <div className="card">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="check" size={18} style={{ color: 'var(--green)' }} />
              <b>{L("فُتحت البيانات", "Data unlocked")}</b>
              {got.exportedAt && <span className="faint small">{L("· أُرسلت ", "· sent ")}{new Date(got.exportedAt).toLocaleString(lang() === 'en' ? 'en' : 'ar', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>{stateCounts(got.state).map((c) => `${c.n} ${c.label}`).join(' · ') || L('لا توجد بيانات', "No data")}</div>
          </div>
          {hasData ? (
            <>
              <div className="notice amber small">
                <Icon name="info" size={16} />
                <div>{L("هذا الجهاز فيه بيانات أيضًا (", "This device has data too (")}{stateCounts(mine).map((c) => `${c.n} ${c.label}`).join(' · ')}{L("). اختر:", "). Choose:")}</div>
              </div>
              <button className="btn primary" onClick={() => finish('merge')}>{L("ادمجها مع بيانات هذا الجهاز", "Merge with this device's data")}</button>
              <div className="faint tiny" style={{ marginTop: -14 }}>{L("يحتفظ بالاثنين؛ عند التعارض يبقى الأحدث تعديلًا. إعدادات هذا الجهاز تبقى.", "Keeps both; on conflicts the most recent edit wins. This device's settings stay.")}</div>
              <button className="btn danger" onClick={() => { if (confirm(L('استبدال كل بيانات هذا الجهاز ببيانات الجهاز الآخر؟ (يمكنك التراجع فورًا)', "Replace all data on this device with the other device's data? (You can undo right away)"))) finish('replace'); }}>{L("استبدل بيانات هذا الجهاز بالكامل", "Replace this device's data completely")}</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => finish('replace')}>{L("انقلها إلى هذا الجهاز", "Move it to this device")}</button>
          )}
        </div>
      )}
    </div>
  );
}
