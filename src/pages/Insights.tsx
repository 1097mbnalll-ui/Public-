import { useMemo } from 'react';
import { Empty } from '../ui/kit';
import { PageTop } from '../ui/PageTop';
import { useApp } from '../lib/store';
import { addDays, fmtDate, fmtMinutes, todayKey } from '../lib/dates';
import { calibration, coursePace, typicalMinutes } from '../lib/engine/learning';
import { AREA_LABEL } from '../lib/engine/planner';
import type { Area } from '../lib/types';

export function Insights() {
  const s = useApp();
  const today = todayKey();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const rec = days.map((d) => s.days[d] || { done: 0, minutes: 0, study: 0 });
  const maxM = Math.max(60, ...rec.map((r) => r.minutes));
  const areas: Area[] = ['study', 'work', 'life'];

  const deferStats = useMemo(() => {
    const out = areas.map((a) => {
      const ts = s.tasks.filter((t) => t.area === a);
      const def = ts.reduce((x, t) => x + t.deferrals, 0);
      return { a, n: ts.length, def, avg: ts.length ? def / ts.length : 0 };
    });
    return out;
  }, [s.tasks]);

  const late = useMemo(() => {
    const done = s.tasks.filter((t) => t.status === 'done' && t.due && t.completedAt);
    const lateN = done.filter((t) => todayKey(t.completedAt) > (t.due as string)).length;
    return { n: done.length, late: lateN };
  }, [s.tasks]);

  const weekdayLoad = useMemo(() => {
    const sums = Array(7).fill(0);
    const cnt = Array(7).fill(0);
    for (const [d, r] of Object.entries(s.days)) {
      const wd = new Date(d + 'T12:00').getDay();
      sums[wd] += r.minutes;
      cnt[wd]++;
    }
    return sums.map((x, i) => (cnt[i] ? x / cnt[i] : 0));
  }, [s.days]);

  const exams = s.exams.filter((e) => e.score != null);
  const totalDone = rec.reduce((a, r) => a + r.done, 0);
  const totalMin = rec.reduce((a, r) => a + r.minutes, 0);

  return (
    <div>
      <PageTop back={{ label: 'أنت', to: 'me' }} title="ما تعلمته عنك" sub="من بياناتك أنت فقط — لا تخمين" />

      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
        <div className="card stat"><span className="v num">{totalDone}</span><span className="k">إنجاز في 14 يومًا</span></div>
        <div className="card stat"><span className="v num">{fmtMinutes(totalMin)}</span><span className="k">وقت عمل مسجل</span></div>
        <div className="card stat"><span className="v num">{fmtMinutes(rec.reduce((a, r) => a + r.study, 0))}</span><span className="k">مذاكرة</span></div>
        <div className="card stat">
          <span className="v num">{late.n ? `${Math.round((late.late / late.n) * 100)}%` : '—'}</span>
          <span className="k">مهام أُنجزت بعد موعدها{late.n ? ` (${late.late}/${late.n})` : ''}</span>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>آخر 14 يومًا</h2></div>
        <div className="card">
          <div className="bars" style={{ height: 140 }}>
            {days.map((d, i) => (
              <div key={d} className="b" title={`${fmtDate(d)}: ${fmtMinutes(rec[i].minutes)} · ${rec[i].done} إنجاز`}>
                <i style={{ height: `${(rec[i].minutes / maxM) * 85}%`, background: d === today ? 'var(--accent)' : 'rgba(138,164,255,.45)' }} />
                <span>{new Date(d + 'T12:00').getDate()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>دقة تقديراتك</h2></div>
        <div className="list">
          {areas.map((a) => {
            const c = calibration(s, a);
            const own = s.tasks.filter((t) => t.status === 'done' && t.area === a && t.estimate && t.spent > 0).length;
            const typ = typicalMinutes(s, a);
            return (
              <div key={a} className="item">
                <span className={`chip ${a}`}>{AREA_LABEL[a]}</span>
                <div className="grow small">
                  {own >= 3 ? (
                    c.factor > 1.1 ? (
                      <>تأخذ مهامك عادةً <b>×{c.factor.toFixed(1)}</b> من تقديرك. الخطة تصحح ذلك تلقائيًا.</>
                    ) : c.factor < 0.9 ? (
                      <>تنجز أسرع من تقديرك (×{c.factor.toFixed(1)}). الخطة تأخذ ذلك في الحساب.</>
                    ) : (
                      <>تقديراتك دقيقة. ممتاز.</>
                    )
                  ) : (
                    <span className="muted">بيانات غير كافية ({own}/3). استخدم المؤقت أو أجب «كم أخذت فعلًا؟» بعد الإنجاز.</span>
                  )}
                  {typ.n >= 3 && <div className="faint tiny">المهمة النموذجية هنا تأخذ ~{fmtMinutes(typ.minutes)}.</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {s.courses.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>سرعة المذاكرة</h2></div>
          <div className="list">
            {s.courses.map((c) => {
              const p = coursePace(s, c);
              return (
                <div key={c.id} className="item">
                  <span className="dot" style={{ background: c.color, marginTop: 8 }} />
                  <div className="grow small">
                    <b>{c.name}</b>: {p.pace.toFixed(1)} د لكل {c.sizeLabel} عند صعوبة متوسطة
                    <div className="faint tiny">
                      {p.source === 'data' ? `من ${p.n} جلسات مسجلة · هامش الخطأ ±${Math.round(p.spread * 100)}%` : `لا توجد جلسات مسجلة بعد · التقدير ${p.source === 'guess' ? 'من إدخالك' : p.source === 'global' ? 'من موادك الأخرى' : 'افتراضي'} (±${Math.round(p.spread * 100)}%)`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>التأجيل</h2></div>
        <div className="list">
          {deferStats.map((d) => (
            <div key={d.a} className="item small">
              <span className={`chip ${d.a}`}>{AREA_LABEL[d.a]}</span>
              <div className="grow">{d.n ? `${d.def} تأجيل على ${d.n} مهمة (متوسط ${d.avg.toFixed(1)})` : <span className="muted">لا مهام</span>}</div>
            </div>
          ))}
        </div>
        {deferStats.some((d) => d.avg >= 1) && (
          <div className="notice amber" style={{ marginTop: 10 }}>
            التأجيل المتكرر في {AREA_LABEL[deferStats.slice().sort((a, b) => b.avg - a.avg)[0].a]} يعني غالبًا أن المهام هناك أكبر من اللازم أو بلا خطوة أولى واضحة. جرّب تقسيمها.
          </div>
        )}
      </div>

      {Object.keys(s.days).length >= 7 && (
        <div className="section">
          <div className="section-head"><h2>متوسط إنتاجك حسب اليوم</h2></div>
          <div className="card">
            <div className="bars">
              {weekdayLoad.map((m, i) => (
                <div key={i} className="b">
                  <span className="num">{m ? fmtMinutes(m) : ''}</span>
                  <i style={{ height: `${(m / Math.max(1, ...weekdayLoad)) * 80}%` }} />
                  <span>{['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'][i]}</span>
                </div>
              ))}
            </div>
            <div className="faint tiny" style={{ marginTop: 8 }}>قارنه بالوقت المتاح في الإعدادات؛ إن كان الفعلي أقل بكثير فقلل المتاح لتكون الخطة واقعية.</div>
          </div>
        </div>
      )}

      {exams.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>النتائج مقابل التحضير</h2></div>
          <div className="list">
            {exams.map((e) => {
              const c = s.courses.find((x) => x.id === e.courseId);
              const mins = s.sessions.filter((x) => x.courseId === e.courseId && x.date <= e.date).reduce((a, x) => a + x.minutes, 0);
              return (
                <div key={e.id} className="item small">
                  <div className="grow"><b>{c?.name}</b> — {e.title}<div className="faint tiny">ذاكرت {fmtMinutes(mins)} قبله</div></div>
                  <span className="chip green">{e.score}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!s.tasks.length && !s.sessions.length && (
        <div className="card" style={{ marginTop: 20 }}><Empty icon="insights" title="سأتعلم مع الاستخدام">بعد أيام من الاستخدام سترى هنا دقة تقديراتك وسرعة مذاكرتك وأنماط التأجيل.</Empty></div>
      )}
    </div>
  );
}
