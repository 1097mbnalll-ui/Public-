import { useMemo } from 'react';
import { Empty } from '../ui/kit';
import { PageTop } from '../ui/PageTop';
import { useApp } from '../lib/store';
import { addDays, fmtDate, fmtMinutes, todayKey } from '../lib/dates';
import { calibration, coursePace, typicalMinutes } from '../lib/engine/learning';
import { AREA_LABEL } from '../lib/engine/planner';
import type { Area } from '../lib/types';
import { L, sz } from '../lib/i18n';

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
      <PageTop back={{ label: L('أنت', "You"), to: 'me' }} title={L("ما تعلمته عنك", "What I've learned about you")} sub={L("من بياناتك أنت فقط — لا تخمين", "From your own data only — no guessing")} />

      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
        <div className="card stat"><span className="v num">{totalDone}</span><span className="k">{L("إنجاز في 14 يومًا", "Done in 14 days")}</span></div>
        <div className="card stat"><span className="v num">{fmtMinutes(totalMin)}</span><span className="k">{L("وقت عمل مسجل", "Tracked work time")}</span></div>
        <div className="card stat"><span className="v num">{fmtMinutes(rec.reduce((a, r) => a + r.study, 0))}</span><span className="k">{L("مذاكرة", "Study")}</span></div>
        <div className="card stat">
          <span className="v num">{late.n ? `${Math.round((late.late / late.n) * 100)}%` : '—'}</span>
          <span className="k">{L("مهام أُنجزت بعد موعدها", "Tasks finished after their due date")}{late.n ? ` (${late.late}/${late.n})` : ''}</span>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>{L("آخر 14 يومًا", "Last 14 days")}</h2></div>
        <div className="card">
          <div className="bars" style={{ height: 140 }}>
            {days.map((d, i) => (
              <div key={d} className="b" title={L(`${fmtDate(d)}: ${fmtMinutes(rec[i].minutes)} · ${rec[i].done} إنجاز`, `${fmtDate(d)}: ${fmtMinutes(rec[i].minutes)} · ${rec[i].done} done`)}>
                <i style={{ height: `${(rec[i].minutes / maxM) * 85}%`, background: d === today ? 'var(--accent)' : 'var(--accent-dim)' }} />
                <span>{new Date(d + 'T12:00').getDate()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>{L("دقة تقديراتك", "How accurate your estimates are")}</h2></div>
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
                      <>{L("تأخذ مهامك عادةً ", "Your tasks usually take ")}<b>×{c.factor.toFixed(1)}</b>{L(" من تقديرك. الخطة تصحح ذلك تلقائيًا.", " of your estimate. The plan corrects for it automatically.")}</>
                    ) : c.factor < 0.9 ? (
                      <>{L("تنجز أسرع من تقديرك (×", "You finish faster than you estimate (×")}{c.factor.toFixed(1)}{L("). الخطة تأخذ ذلك في الحساب.", "). The plan takes that into account.")}</>
                    ) : (
                      <>{L("تقديراتك دقيقة. ممتاز.", "Your estimates are accurate. Nice.")}</>
                    )
                  ) : (
                    <span className="muted">{L("بيانات غير كافية (", "Not enough data (")}{own}{L("/3). استخدم المؤقت أو أجب «كم أخذت فعلًا؟» بعد الإنجاز.", "/3). Use the timer or answer “How long did it really take?” after finishing.")}</span>
                  )}
                  {typ.n >= 3 && <div className="faint tiny">{L("المهمة النموذجية هنا تأخذ ~", "A typical task here takes ~")}{fmtMinutes(typ.minutes)}.</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {s.courses.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>{L("سرعة المذاكرة", "Study speed")}</h2></div>
          <div className="list">
            {s.courses.map((c) => {
              const p = coursePace(s, c);
              return (
                <div key={c.id} className="item">
                  <span className="dot" style={{ background: c.color, marginTop: 8 }} />
                  <div className="grow small">
                    <b>{c.name}</b>: {p.pace.toFixed(1)}{L(" د لكل ", " min per ")}{sz(c.sizeLabel)}{L(" عند صعوبة متوسطة", " at average difficulty")}<div className="faint tiny">
                      {p.source === 'data' ? L(`من ${p.n} جلسات مسجلة · هامش الخطأ ±${Math.round(p.spread * 100)}%`, `From ${p.n} logged sessions · margin ±${Math.round(p.spread * 100)}%`) : L(`لا توجد جلسات مسجلة بعد · التقدير ${p.source === 'guess' ? 'من إدخالك' : p.source === 'global' ? 'من موادك الأخرى' : 'افتراضي'} (±${Math.round(p.spread * 100)}%)`, `No sessions logged yet · estimate ${p.source === 'guess' ? 'from your input' : p.source === 'global' ? 'from your other courses' : 'by default'} (±${Math.round(p.spread * 100)}%)`)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>{L("التأجيل", "Postponing")}</h2></div>
        <div className="list">
          {deferStats.map((d) => (
            <div key={d.a} className="item small">
              <span className={`chip ${d.a}`}>{AREA_LABEL[d.a]}</span>
              <div className="grow">{d.n ? L(`${d.def} تأجيل على ${d.n} مهمة (متوسط ${d.avg.toFixed(1)})`, `${d.def} postponements over ${d.n} tasks (average ${d.avg.toFixed(1)})`) : <span className="muted">{L("لا مهام", "No tasks")}</span>}</div>
            </div>
          ))}
        </div>
        {deferStats.some((d) => d.avg >= 1) && (
          <div className="notice amber" style={{ marginTop: 10 }}>{L("التأجيل المتكرر في ", "Frequent postponing in ")}{AREA_LABEL[deferStats.slice().sort((a, b) => b.avg - a.avg)[0].a]}{L(" يعني غالبًا أن المهام هناك أكبر من اللازم أو بلا خطوة أولى واضحة. جرّب تقسيمها.", " usually means tasks there are too big or lack a clear first step. Try splitting them.")}</div>
        )}
      </div>

      {Object.keys(s.days).length >= 7 && (
        <div className="section">
          <div className="section-head"><h2>{L("متوسط إنتاجك حسب اليوم", "Your average output by day")}</h2></div>
          <div className="card">
            <div className="bars">
              {weekdayLoad.map((m, i) => (
                <div key={i} className="b">
                  <span className="num">{m ? fmtMinutes(m) : ''}</span>
                  <i style={{ height: `${(m / Math.max(1, ...weekdayLoad)) * 80}%` }} />
                  <span>{[L('أحد', "Sun"), L('إثنين', "Mon"), L('ثلاثاء', "Tue"), L('أربعاء', "Wed"), L('خميس', "Thu"), L('جمعة', "Fri"), L('سبت', "Sat")][i]}</span>
                </div>
              ))}
            </div>
            <div className="faint tiny" style={{ marginTop: 8 }}>{L("قارنه بالوقت المتاح في الإعدادات؛ إن كان الفعلي أقل بكثير فقلل المتاح لتكون الخطة واقعية.", "Compare it with your available time in settings; if the real amount is much lower, lower the available time so the plan stays realistic.")}</div>
          </div>
        </div>
      )}

      {exams.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>{L("النتائج مقابل التحضير", "Results vs. preparation")}</h2></div>
          <div className="list">
            {exams.map((e) => {
              const c = s.courses.find((x) => x.id === e.courseId);
              const mins = s.sessions.filter((x) => x.courseId === e.courseId && x.date <= e.date).reduce((a, x) => a + x.minutes, 0);
              return (
                <div key={e.id} className="item small">
                  <div className="grow"><b>{c?.name}</b> — {e.title}<div className="faint tiny">{L("ذاكرت ", "Studied ")}{fmtMinutes(mins)}{L(" قبله", " before it")}</div></div>
                  <span className="chip green">{e.score}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!s.tasks.length && !s.sessions.length && (
        <div className="card" style={{ marginTop: 20 }}><Empty icon="insights" title={L("سأتعلم مع الاستخدام", "I'll learn as you go")}>{L("بعد أيام من الاستخدام سترى هنا دقة تقديراتك وسرعة مذاكرتك وأنماط التأجيل.", "After a few days of use you'll see your estimate accuracy, study speed and postponing patterns here.")}</Empty></div>
      )}
    </div>
  );
}
