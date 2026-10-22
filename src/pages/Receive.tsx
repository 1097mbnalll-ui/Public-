import { useMemo, useState } from 'react';
import { Empty } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { getState, replaceState } from '../lib/store';
import { fromB64url, mergeStates, open, WrongCode } from '../lib/transfer';
import type { AppState } from '../lib/types';
import { go, useRoute } from '../ui/router';
import { toast } from '../ui/toast';
import { PageTop } from '../ui/PageTop';

/** a file picked on «أنت» is handed over here in memory (never put in the URL) */
let pendingFile: Uint8Array | null = null;
export function receiveFile(bytes: Uint8Array) {
  pendingFile = bytes;
  go('receive?f=1');
}

function counts(s: AppState) {
  return [
    { l: 'مهام', n: s.tasks.length },
    { l: 'إجراءات عمل', n: s.procedures.length },
    { l: 'مواد', n: s.courses.length },
    { l: 'اختبارات', n: s.exams.length },
    { l: 'قوالب', n: s.templates.length },
  ].filter((x) => x.n);
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
        <PageTop title="استقبال بيانات" back={{ label: 'أنت', to: 'me' }} />
        <div className="card"><Empty icon="alert" title="الرابط ناقص أو غير صالح">اطلب رابطًا جديدًا من جهازك الأول، أو استخدم ملف النقل من صفحة «أنت».</Empty></div>
      </div>
    );

  const unlock = async () => {
    setBusy(true);
    setErr('');
    try {
      setGot(await open(packed, code));
    } catch (e) {
      setErr(e instanceof WrongCode ? 'الكود غير صحيح — تأكد منه وحاول مرة أخرى.' : (e as Error).message);
    }
    setBusy(false);
  };

  const finish = async (mode: 'replace' | 'merge') => {
    if (!got) return;
    const next = mode === 'merge' ? mergeStates(getState(), got.state) : { ...got.state, meta: { ...got.state.meta, onboarded: true } };
    await replaceState(next, mode === 'merge' ? 'دمج بيانات' : 'استبدال بيانات');
    pendingFile = null;
    go('today'); // also drops the encrypted data from the address bar
    toast(mode === 'merge' ? 'دُمجت البيانات ✓' : 'انتقلت بياناتك إلى هذا الجهاز ✓', { undoable: true, ms: 8000 });
  };

  return (
    <div>
      <PageTop title="استقبال بيانات" sub="من جهازك الآخر — مشفّرة، وتحتاج الكود لفتحها" back={{ label: 'اليوم', to: 'today' }} />
      {!got ? (
        <div className="card fields">
          <div className="field">
            <label>كود النقل</label>
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
              aria-label="كود النقل"
            />
          </div>
          {err && <div className="notice red small">{err}</div>}
          <button className="btn primary" disabled={!code.trim() || busy} onClick={unlock}>
            {busy ? 'جارٍ الفتح…' : 'افتح'}
          </button>
        </div>
      ) : (
        <div className="stack">
          <div className="card">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="check" size={18} style={{ color: 'var(--green)' }} />
              <b>فُتحت البيانات</b>
              {got.exportedAt && <span className="faint small">· أُرسلت {new Date(got.exportedAt).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>{counts(got.state).map((c) => `${c.n} ${c.l}`).join(' · ') || 'لا توجد بيانات'}</div>
          </div>
          {hasData ? (
            <>
              <div className="notice amber small">
                <Icon name="info" size={16} />
                <div>هذا الجهاز فيه بيانات أيضًا ({counts(mine).map((c) => `${c.n} ${c.l}`).join(' · ')}). اختر:</div>
              </div>
              <button className="btn primary" onClick={() => finish('merge')}>ادمجها مع بيانات هذا الجهاز</button>
              <div className="faint tiny" style={{ marginTop: -14 }}>يحتفظ بالاثنين؛ عند التعارض يبقى الأحدث تعديلًا. إعدادات هذا الجهاز تبقى.</div>
              <button className="btn danger" onClick={() => { if (confirm('استبدال كل بيانات هذا الجهاز ببيانات الجهاز الآخر؟ (يمكنك التراجع فورًا)')) finish('replace'); }}>
                استبدل بيانات هذا الجهاز بالكامل
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={() => finish('replace')}>انقلها إلى هذا الجهاز</button>
          )}
        </div>
      )}
    </div>
  );
}
