import { useMemo, useState } from 'react';
import { Seg, Sheet, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { PageTop } from '../ui/PageTop';
import { closeSheet, openSheet } from '../ui/sheets';
import { go, useRoute } from '../ui/router';
import { toast } from '../ui/toast';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, diffDays, fmtDate, todayKey } from '../lib/dates';
import {
  analyzePostings, budget, catName, CATS, currentStage, defaultStages, focusSkill, hoursLeft, isFutureTask, LEVELS, localAdviser, progress, QUESTIONS, realism, recommendations, simulate,
  skillMinutes, STARTERS, stepIndex, STEPS, thisWeek, timeGone, type ActionRef, type Question, type Reason,
} from '../lib/engine/future';
import type { AppState, FutureKind, FutureProject, FutureSkill, FutureVision, SkillCat, SkillStep, WinKind } from '../lib/types';
import { L } from '../lib/i18n';
import { uid } from '../lib/text';

// «مستقبلي» answers, in this order: where am I going and how far along? what's the one next step and
// why? — then the plan (stages, skills, projects), the wins with their evidence, and what the ads you
// collected ask for. Calm on top; the detail is a tap away.

type Tab = 'board' | 'plan' | 'wins' | 'market';

export function Future() {
  const r = useRoute();
  const s = useApp();
  const tab: Tab = r.id === 'plan' || r.id === 'wins' || r.id === 'market' ? r.id : 'board';
  const v = s.future.vision;
  return (
    <div>
      <PageTop title={L('مستقبلي', 'My future')} sub={v ? undefined : L('استثمر أيامك في بناء نفسك.', 'Invest your days in building yourself.')} actions={v ? <button className="icon-btn" onClick={() => openSheet({ type: 'fu-setup' })} aria-label={L('هدفي', 'My goal')}><Icon name="target" /></button> : undefined} />
      {v && (
        <div style={{ marginBottom: 16 }}>
          <Seg value={tab} onChange={(t) => go(t === 'board' ? 'future' : `future/${t}`)} label={L('أقسام مستقبلي', 'Sections')} options={[
            { v: 'board', l: L('لوحتي', 'Board') }, { v: 'plan', l: L('خطتي', 'Plan') }, { v: 'wins', l: L('إنجازاتي', 'Wins') }, { v: 'market', l: L('السوق', 'Market') },
          ]} />
        </div>
      )}
      {!v ? <Welcome /> : tab === 'board' ? <Board /> : tab === 'plan' ? <Plan /> : tab === 'wins' ? <Wins /> : <Market />}
    </div>
  );
}

/** the actions a recommendation can carry */
function runAction(ref: ActionRef) {
  switch (ref.type) {
    case 'setup':
      return openSheet({ type: 'fu-setup' });
    case 'skill':
      return openSheet({ type: 'fu-skill', id: ref.id });
    case 'project':
      return openSheet({ type: 'fu-project', id: ref.id, skillId: ref.skillId });
    case 'win':
      return openSheet({ type: 'fu-win', skillId: ref.skillId, projectId: ref.projectId });
    case 'review':
      return openSheet({ type: 'fu-review', kind: ref.kind });
    case 'log':
      return openSheet({ type: 'fu-log', id: ref.id });
    case 'starters':
      return openSheet({ type: 'fu-starters' });
    case 'tab':
      return go(ref.tab === 'study' ? 'study' : `future/${ref.tab}`);
  }
}

function Reasons({ list }: { list: Reason[] }) {
  return (
    <ul className="fu-reasons">
      {list.map((r, i) => (
        <li key={i} className={r.kind}>
          <span className="tag">{r.kind === 'fact' ? L('من بياناتك', 'your data') : L('تقدير', 'estimate')}</span>
          {r.text}
        </li>
      ))}
    </ul>
  );
}

// ---------------- before a goal ----------------

function Welcome() {
  return (
    <section className="fu-welcome">
      <h2>{L('مدار ما ينظّم يومك بس — يساعدك تستثمره في بناء مستقبلك.', 'Madar doesn’t only organise your day — it helps you invest it in your future.')}</h2>
      <ul>
        <li><b>{L('هدف واحد واضح', 'One clear goal')}</b><span>{L('وين تبي توصل، وليش، ومتى.', 'Where you’re going, why, and by when.')}</span></li>
        <li><b>{L('مهارات تُختار بعناية', 'Skills chosen with care')}</b><span>{L('القليل اللي يخدم هدفك، مو كل شي.', 'The few that serve your goal, not everything.')}</span></li>
        <li><b>{L('مشاريع وأدلة', 'Projects and evidence')}</b><span>{L('اللي يقدر غيرك يشوفه، مو بس دورات.', 'What others can see, not just courses.')}</span></li>
        <li><b>{L('خطوة تالية كل يوم', 'A next step every day')}</b><span>{L('مع سببها، من بياناتك أنت.', 'With its reason, from your own data.')}</span></li>
      </ul>
      <button className="btn primary fu-go" onClick={() => openSheet({ type: 'fu-setup' })}><Icon name="target" size={16} /> {L('حدّد هدفك', 'Set your goal')}</button>
      <p className="faint small">{L('يشتغل بالكامل على جهازك وبدون نت. ما يحتاج أي مفتاح أو اشتراك.', 'Works fully on your device, offline. No key or subscription needed.')}</p>
    </section>
  );
}

// ---------------- لوحتي ----------------

function Board() {
  const s = useApp();
  const now = useNow(60_000);
  const f = s.future;
  const v = f.vision!;
  const today = todayKey(now);
  const stage = currentStage(f.stages, today);
  const recs = useMemo(() => recommendations(s, now), [s, now]);
  const pr = progress(s);
  const gone = timeGone(v, now);
  const wk = thisWeek(s, now);
  const [q, setQ] = useState<Question | null>(null);
  const answer = q ? localAdviser.answer(q, s, now) : null;
  const top = recs[0];
  const wins = [...f.wins].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 2);
  const daysLeft = Math.max(0, diffDays(today, v.target));
  return (
    <>
      <section className="fu-vision">
        <span className="k">{v.kind === 'student' && v.year && v.years ? L(`السنة ${v.year} من ${v.years}${v.field ? ` · ${v.field}` : ''}`, `Year ${v.year} of ${v.years}${v.field ? ` · ${v.field}` : ''}`) : L(`باقي ${daysLeft} يوم`, `${daysLeft} days left`)}</span>
        <h2>{v.title}</h2>
        {v.why && <p className="why">{L('لأن ', 'Because ')}{v.why}</p>}
        {stage && <p className="stage"><b>{stage.title}</b>{stage.focus ? ` — ${stage.focus}` : ''}</p>}
        <div className="fu-bars" aria-label={L('التقدم مقابل الوقت', 'Progress vs time')}>
          <div><span>{L('تقدمك', 'Progress')}</span><i><i style={{ width: `${pr.pct * 100}%` }} /></i><b className="num">{Math.round(pr.pct * 100)}%</b></div>
          <div className="time"><span>{L('الوقت', 'Time')}</span><i><i style={{ width: `${gone * 100}%` }} /></i><b className="num">{Math.round(gone * 100)}%</b></div>
        </div>
        <small className="faint">{L('التقدم من المستويات اللي حددتها لمهاراتك، مو اختبار.', 'Progress is from the levels you set, not a test.')}{pr.proven ? L(` · ${pr.proven} مهارة مثبتة بدليل`, ` · ${pr.proven} proven with evidence`) : ''}</small>
      </section>

      {top && (
        <section className="fu-next" aria-label={L('الخطوة التالية', 'Next step')}>
          <span className="k">{L('الخطوة التالية', 'Next step')}</span>
          <h3>{top.title}</h3>
          <Reasons list={top.reasons} />
          {top.action && <button className="btn primary fu-go" onClick={() => runAction(top.action!.ref)}>{top.action.label}</button>}
        </section>
      )}

      {recs.length > 1 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('بعدها', 'After that')}</span></div>
          <div className="fu-list">
            {recs.slice(1, 4).map((r) => (
              <button key={r.id} className="fu-row" onClick={() => (r.action ? runAction(r.action.ref) : undefined)}>
                <span className="m"><b>{r.title}</b><span>{r.reasons[0]?.text}</span></span>
                <Icon name="chevron" size={14} className="chev-end" />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="fu-week">
        <div className="h"><b>{L('هالأسبوع', 'This week')}</b><span className="num">{fmtH(wk.minutes)} / {fmtH(wk.target)}</span></div>
        <i className="bar"><i style={{ width: `${Math.min(100, (wk.minutes / Math.max(1, wk.target)) * 100)}%` }} /></i>
        <div className="a">
          {f.skills.length ? <button className="btn sm" onClick={() => openSheet({ type: 'fu-log', id: focusSkill(s, now)?.k.id || f.skills[0].id })}><Icon name="clock" size={14} /> {L('سجّل وقت تدريب', 'Log practice')}</button> : null}
          {wk.tasks + wk.steps > 0 && <span className="faint small">{L(`خلّصت ${wk.tasks + wk.steps} خطوة`, `${wk.tasks + wk.steps} steps done`)}</span>}
        </div>
      </section>

      <section className="fu-advisor">
        <div className="h"><b>{L('اسأل مستشار مدى', 'Ask Madar’s adviser')}</b><small>{localAdviser.label()}</small></div>
        <div className="fu-qs">
          {QUESTIONS.map((x) => <button key={x.q} className={q === x.q ? 'on' : ''} aria-pressed={q === x.q} onClick={() => setQ(q === x.q ? null : x.q)}>{L(...x.t)}</button>)}
        </div>
        {answer && (
          <div className="fu-answer" aria-live="polite">
            <b>{answer.title}</b>
            <Reasons list={answer.reasons} />
            {answer.action && <button className="btn sm primary" onClick={() => runAction(answer.action!.ref)}>{answer.action.label}</button>}
          </div>
        )}
      </section>

      {wins.length > 0 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('آخر إنجازاتك', 'Latest wins')}</span><button onClick={() => go('future/wins')}>{L('الكل', 'All')}</button></div>
          <div className="fu-list">{wins.map((w) => <WinRow key={w.id} id={w.id} />)}</div>
        </section>
      )}
    </>
  );
}

const fmtH = (m: number) => (m >= 60 ? L(`${Math.round((m / 60) * 10) / 10} س`, `${Math.round((m / 60) * 10) / 10}h`) : L(`${m} د`, `${m}m`));

// ---------------- خطتي ----------------

function LevelDots({ k }: { k: FutureSkill }) {
  return (
    <span className="fu-dots" aria-label={L(`المستوى ${LEVELS()[k.level]} من ${LEVELS()[k.target]}`, `Level ${LEVELS()[k.level]} of ${LEVELS()[k.target]}`)}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= k.level ? 'on' : i <= k.target ? 'goal' : ''} />)}
    </span>
  );
}

function SkillRow({ k }: { k: FutureSkill }) {
  return (
    <button className={`fu-row ${k.paused ? 'paused' : ''}`} onClick={() => openSheet({ type: 'fu-skill', id: k.id })}>
      <span className="m">
        <b>{k.name}{k.priority === 1 && <em className="fu-p">{L('أولوية', 'priority')}</em>}{k.paused && <em>{L('موقوفة', 'paused')}</em>}</b>
        <span>{catName(k.cat)} · {L(...STEPS[stepIndex(k.step)].t)}{hoursLeft(k) ? L(` · باقي ~${hoursLeft(k)} س`, ` · ~${hoursLeft(k)}h left`) : ''}</span>
      </span>
      <LevelDots k={k} />
    </button>
  );
}

function ProjectRow({ p }: { p: FutureProject }) {
  const s = useApp();
  const done = p.steps.filter((x) => x.done || (x.taskId && s.tasks.find((t) => t.id === x.taskId)?.status === 'done')).length;
  return (
    <button className="fu-row" onClick={() => openSheet({ type: 'fu-project', id: p.id })}>
      <span className="m">
        <b>{p.title}{p.status === 'done' && <em className="ok">{L('مكتمل', 'done')}</em>}{p.status === 'idea' && <em>{L('فكرة', 'idea')}</em>}</b>
        <span>{p.steps.length ? L(`${done} من ${p.steps.length} خطوات`, `${done} of ${p.steps.length} steps`) : L('بدون خطوات', 'No steps')}{p.due ? ` · ${fmtDate(p.due, false)}` : ''}</span>
      </span>
      <Icon name="chevron" size={14} className="chev-end" />
    </button>
  );
}

function Plan() {
  const s = useApp();
  const now = useNow(60_000);
  const f = s.future;
  const v = f.vision!;
  const today = todayKey(now);
  const cur = currentStage(f.stages, today);
  const [hours, setHours] = useState(v.weeklyHours || 5);
  const [mode, setMode] = useState<'all' | 'top'>('all');
  const sim = useMemo(() => simulate(s, hours, mode, now), [s, hours, mode, now]);
  const b = budget(s, now);
  const stages = [...f.stages].sort((a, x) => a.from.localeCompare(x.from));
  const loose = f.skills.filter((k) => !k.stageId || !f.stages.some((x) => x.id === k.stageId));
  return (
    <>
      <section>
        <div className="group-title"><span className="sh-h2">{L('خارطة الطريق', 'Roadmap')}</span><button onClick={() => openSheet({ type: 'fu-stage' })}>{L('+ مرحلة', '+ Stage')}</button></div>
        <ol className="fu-road">
          {stages.map((st) => {
            const ks = f.skills.filter((k) => k.stageId === st.id);
            const ps = f.projects.filter((p) => p.stageId === st.id);
            const state = st.to < today ? 'past' : cur?.id === st.id ? 'now' : 'later';
            return (
              <li key={st.id} className={state}>
                <details open={state === 'now'}>
                  <summary>
                    <span className="dot" aria-hidden />
                    <span className="m"><b>{st.title}{state === 'now' && <em>{L('الحين', 'now')}</em>}</b><span>{fmtDate(st.from, false)} – {fmtDate(st.to, false)}{st.focus ? ` · ${st.focus}` : ''}</span></span>
                  </summary>
                  <div className="in">
                    {ks.map((k) => <SkillRow key={k.id} k={k} />)}
                    {ps.map((p) => <ProjectRow key={p.id} p={p} />)}
                    {!ks.length && !ps.length && <p className="faint small">{L('فاضية — أضف مهارة أو مشروع لهالمرحلة.', 'Empty — add a skill or project to this stage.')}</p>}
                    <div className="row wrap" style={{ gap: 6 }}>
                      <button className="btn sm ghost" onClick={() => openSheet({ type: 'fu-skill', stageId: st.id })}>{L('+ مهارة', '+ Skill')}</button>
                      <button className="btn sm ghost" onClick={() => openSheet({ type: 'fu-project', stageId: st.id })}>{L('+ مشروع', '+ Project')}</button>
                      <button className="btn sm ghost" onClick={() => openSheet({ type: 'fu-stage', id: st.id })}>{L('عدّل المرحلة', 'Edit stage')}</button>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <div className="group-title"><span className="sh-h2">{L('مهاراتي', 'My skills')}</span><span className="row" style={{ gap: 10 }}><button onClick={() => openSheet({ type: 'fu-starters' })}>{L('من القائمة العامة', 'From the list')}</button><button onClick={() => openSheet({ type: 'fu-skill' })}>{L('+ مهارة', '+ Skill')}</button></span></div>
        {f.skills.length ? (
          <div className="fu-list">{[...f.skills].sort((a, x) => Number(!!a.paused) - Number(!!x.paused) || a.priority - x.priority).map((k) => <SkillRow key={k.id} k={k} />)}</div>
        ) : <p className="faint small">{L('ابدأ بمهارة أو ثلاث. القليل اللي تشتغل عليه أحسن من قائمة طويلة.', 'Start with one to three. A few you work on beats a long list.')}</p>}
        {loose.length > 0 && f.stages.length > 0 && <p className="faint tiny">{L(`${loose.length} مهارات بدون مرحلة — حطها في مرحلة من صفحتها.`, `${loose.length} skills have no stage — set one on their page.`)}</p>}
      </section>

      <section>
        <div className="group-title"><span className="sh-h2">{L('مشاريعي', 'My projects')}</span><button onClick={() => openSheet({ type: 'fu-project' })}>{L('+ مشروع', '+ Project')}</button></div>
        {f.projects.length ? <div className="fu-list">{[...f.projects].sort((a, x) => (a.status === 'done' ? 1 : 0) - (x.status === 'done' ? 1 : 0)).map((p) => <ProjectRow key={p.id} p={p} />)}</div> : <p className="faint small">{L('مشروع صغير يطبّق مهارة أنفع من دورة ثانية.', 'A small project that uses a skill beats another course.')}</p>}
      </section>

      {f.skills.length > 0 && (
        <section className="fu-sim">
          <div className="h"><b>{L('جرّب سيناريو', 'Try a scenario')}</b><small>{L('تقدير، مو وعد', 'An estimate, not a promise')}</small></div>
          <label className="fu-slider">
            <span>{L('ساعات بالأسبوع', 'Hours a week')}</span>
            <input type="range" min={1} max={30} value={hours} onChange={(e) => setHours(+e.target.value)} />
            <b className="num">{hours}</b>
          </label>
          <Seg value={mode} onChange={setMode} options={[{ v: 'all', l: L('كل المهارات', 'All skills') }, { v: 'top', l: L('الأولوية العالية بس', 'High priority only') }]} />
          <p className="fu-sim-r">{sim.total ? L(`${sim.fits} من ${sim.total} تخلص قبل هدفك (${fmtDate(v.target, false)})`, `${sim.fits} of ${sim.total} finish before your goal (${fmtDate(v.target, false)})`) : L('ما فيه مهارات باقي لها وقت', 'No skills with time left')}</p>
          <div className="fu-sim-list">
            {sim.rows.map((r) => <div key={r.k.id} className={r.fits ? 'ok' : 'late'}><span>{r.k.name}</span><b className="num">{fmtDate(r.done, false)} {r.fits ? '✓' : ''}</b></div>)}
          </div>
          <small className="faint">{L('الحساب: الساعات الباقية لكل مهارة بالترتيب (المتطلبات أول)، مع هامش ٣٠٪.', 'Based on hours left per skill in order (prerequisites first), with a 30% margin.')}</small>
          {hours !== v.weeklyHours && <button className="btn sm" onClick={() => { A.setVision({ ...v, weeklyHours: hours }); toast(L('حفظت ساعاتك الجديدة', 'Saved your new hours')); }}>{L(`اعتمد ${hours} ساعة بالأسبوع`, `Use ${hours}h a week`)}</button>}
        </section>
      )}

      <section className="fu-budget">
        <div className="h"><b>{L('ميزانية التطوير', 'Growth budget')}</b>{b.budget ? <span className="num">{b.spent} / {b.budget}</span> : <span className="num">{b.spent}</span>}</div>
        {b.budget ? <i className="bar"><i style={{ width: `${Math.min(100, (b.spent / b.budget) * 100)}%` }} /></i> : null}
        <small className="faint">{b.budget ? L('هالسنة، من مصاريفك المعلّمة «تطوير». ', 'This year, from expenses marked as growth. ') : L('اختيارية — حددها من «هدفي». ', 'Optional — set it under “My goal”. ')}{L('سجّل تكلفة أي مصدر من صفحة المهارة.', 'Log a resource’s cost from its skill.')}</small>
      </section>
    </>
  );
}

// ---------------- إنجازاتي ----------------

const WIN_KINDS: { v: WinKind; t: [string, string] }[] = [
  { v: 'project', t: ['مشروع', 'Project'] },
  { v: 'skill', t: ['مهارة مثبتة', 'Proven skill'] },
  { v: 'cert', t: ['شهادة', 'Certificate'] },
  { v: 'experience', t: ['تدريب أو خبرة', 'Training / experience'] },
  { v: 'work', t: ['عمل قابل للعرض', 'Showable work'] },
  { v: 'academic', t: ['إنجاز أكاديمي', 'Academic'] },
  { v: 'other', t: ['غيره', 'Other'] },
];
const winKind = (k: WinKind) => L(...WIN_KINDS.find((x) => x.v === k)!.t);

function WinRow({ id }: { id: string }) {
  const s = useApp();
  const w = s.future.wins.find((x) => x.id === id)!;
  return (
    <button className="fu-row" onClick={() => openSheet({ type: 'fu-win', id })}>
      <span className="m"><b>{w.title}</b><span>{winKind(w.kind)} · {fmtDate(w.day, false)}{w.evidence ? L(' · فيه دليل', ' · has evidence') : ''}</span></span>
      {w.evidence ? <Icon name="link" size={15} /> : <Icon name="chevron" size={14} className="chev-end" />}
    </button>
  );
}

/** your wins as plain CV lines — only what you recorded */
function cvText(s: AppState): string {
  const f = s.future;
  const lines: string[] = [];
  const v = f.vision;
  if (v) lines.push(v.title, '');
  for (const k of WIN_KINDS) {
    const ws = f.wins.filter((w) => w.kind === k.v).sort((a, b) => b.day.localeCompare(a.day));
    if (!ws.length) continue;
    lines.push(`## ${L(...k.t)}`);
    for (const w of ws) lines.push(`- ${w.title} (${w.day.slice(0, 7)})${w.evidence ? ` — ${w.evidence}` : ''}`);
    lines.push('');
  }
  const proven = f.skills.filter((k) => k.step === 'proven');
  if (proven.length) lines.push(`## ${L('مهارات مثبتة', 'Proven skills')}`, ...proven.map((k) => `- ${k.name}${k.evidence ? ` — ${k.evidence}` : ''}`));
  return lines.join('\n').trim();
}

function Wins() {
  const s = useApp();
  const f = s.future;
  const wins = [...f.wins].sort((a, b) => b.day.localeCompare(a.day));
  const reviews = [...f.reviews].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  return (
    <>
      <section>
        <div className="group-title"><span className="sh-h2">{L('سجل الإنجازات', 'Wins')}</span><button onClick={() => openSheet({ type: 'fu-win' })}>{L('+ إنجاز', '+ Win')}</button></div>
        {wins.length ? <div className="fu-list">{wins.map((w) => <WinRow key={w.id} id={w.id} />)}</div> : <p className="faint small">{L('سجّل الحقيقي بس، ومعه دليل يقدر يشوفه غيرك: رابط أو شهادة أو نتيجة.', 'Record only what’s real, with evidence others can see: a link, a certificate, a result.')}</p>}
        {wins.length > 0 && (
          <button className="btn sm" style={{ marginTop: 8 }} onClick={async () => { try { await navigator.clipboard.writeText(cvText(s)); toast(L('نُسخت — الصقها في سيرتك وعدّلها', 'Copied — paste into your CV and edit')); } catch { prompt(L('انسخ:', 'Copy:'), cvText(s)); } }}>
            <Icon name="copy" size={14} /> {L('انسخها كنقاط لسيرتك الذاتية', 'Copy as CV bullet points')}
          </button>
        )}
      </section>
      <section>
        <div className="group-title"><span className="sh-h2">{L('المراجعات', 'Reviews')}</span><span className="row" style={{ gap: 10 }}><button onClick={() => openSheet({ type: 'fu-review', kind: 'week' })}>{L('+ أسبوعية', '+ Weekly')}</button><button onClick={() => openSheet({ type: 'fu-review', kind: 'month' })}>{L('+ شهرية', '+ Monthly')}</button></span></div>
        {reviews.length ? (
          <div className="fu-list">
            {reviews.map((r) => (
              <div key={r.id} className="fu-row static">
                <span className="m"><b>{r.kind === 'week' ? L(`أسبوع ${fmtDate(r.period, false)}`, `Week of ${fmtDate(r.period, false)}`) : L(`شهر ${r.period}`, `Month ${r.period}`)}</b><span>{[r.keep && L(`استمر: ${r.keep}`, `Keep: ${r.keep}`), r.stop && L(`أوقف: ${r.stop}`, `Stop: ${r.stop}`), r.next && L(`الجاي: ${r.next}`, `Next: ${r.next}`)].filter(Boolean).join(' · ')}</span></span>
              </div>
            ))}
          </div>
        ) : <p className="faint small">{L('دقيقتين بالأسبوع تكفي: وش مشى، وش وقف، وش الجاي.', 'Two minutes a week: what worked, what stalled, what’s next.')}</p>}
      </section>
    </>
  );
}

// ---------------- السوق ----------------

function Market() {
  const s = useApp();
  const m = analyzePostings(s);
  return (
    <>
      <section className="fu-honest">
        <b>{L('من إعلانات أنت تجمعها', 'From ads you collect')}</b>
        <p>{L('ما فيه بحث تلقائي في الإنترنت هنا. ألصق إعلانات وظائف أو تدريب حقيقية تعجبك (١٠ أو أكثر أفضل)، وأعدّ لك المتطلبات المتكررة وأقارنها بمهاراتك. النتيجة عيّنة إعلاناتك، مو السوق كله.', 'There’s no automatic web search here. Paste real job or internship ads you like (10+ is better); I’ll count what repeats and compare it with your skills. The result reflects your sample, not the whole market.')}</p>
        <button className="btn primary sm" onClick={() => openSheet({ type: 'fu-posting' })}><Icon name="plus" size={14} /> {L('ألصق إعلان', 'Paste an ad')}</button>
      </section>

      {m.total > 0 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L(`المتكرر في ${m.total} إعلان`, `Repeated across ${m.total} ads`)}</span></div>
          {m.rows.length ? (
            <div className="fu-market">
              {m.rows.map((r) => (
                <div key={r.term} className={r.have ? 'have' : ''}>
                  <span className="t">{r.term}</span>
                  <i className="bar"><i style={{ width: `${(r.count / m.total) * 100}%` }} /></i>
                  <span className="n num">{r.count}/{m.total}</span>
                  {r.have ? <span className="ok">{L(`عندك: ${LEVELS()[r.have.level]}`, `You: ${LEVELS()[r.have.level]}`)}</span> : <button className="btn sm ghost" onClick={() => { A.saveSkill({ name: r.term, cat: 'pro', priority: r.count / m.total >= 0.5 ? 1 : 2, why: L(`تكرر في ${r.count} من ${m.total} إعلان`, `In ${r.count} of ${m.total} ads`) }); toast(L(`انضافت «${r.term}» لمهاراتك`, `Added “${r.term}”`)); }}>{L('أضفها', 'Add')}</button>}
                </div>
              ))}
            </div>
          ) : <p className="faint small">{L('ما لقيت متطلبات أعرفها في النصوص. أضف مهاراتك بأسمائها وأبحث عنها كذلك.', 'No requirements I know in these texts. Add your skills by name and I’ll look for those too.')}</p>}
        </section>
      )}

      {s.future.postings.length > 0 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('إعلاناتك', 'Your ads')}</span></div>
          <div className="fu-list">
            {[...s.future.postings].sort((a, b) => b.createdAt - a.createdAt).map((p) => (
              <button key={p.id} className="fu-row" onClick={() => openSheet({ type: 'fu-posting', id: p.id })}>
                <span className="m"><b>{p.title}</b><span>{fmtDate(p.day, false)} · {p.text.slice(0, 60)}…</span></span>
                <Icon name="chevron" size={14} className="chev-end" />
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ---------------- sheets ----------------

const KINDS: { v: FutureKind; t: [string, string] }[] = [
  { v: 'student', t: ['طالب جامعي', 'University student'] },
  { v: 'career', t: ['تغيير مسار', 'Changing career'] },
  { v: 'skills', t: ['تطوير مهارات', 'Building skills'] },
  { v: 'project', t: ['بناء مشروع', 'Building a project'] },
  { v: 'personal', t: ['هدف شخصي', 'A personal goal'] },
];

/** the goal, in four short steps (all editable later) */
export function FutureSetupSheet() {
  const s = useApp();
  const was = s.future.vision;
  const today = todayKey();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Omit<FutureVision, 'createdAt'>>(() => was ? { ...was } : { kind: 'student', title: '', why: '', start: today, target: addDays(today, 365 * 4), weeklyHours: 5, year: 1, years: 4 });
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const student = v.kind === 'student';
  // a student's graduation is worked out from the years, until you set the date yourself
  const [edited, setEdited] = useState(!!was);
  const target = student && !edited && v.years && v.year ? addDays(v.start, Math.round((v.years - v.year + 1) * 365.25)) : v.target;
  const ok = [true, !!v.title.trim(), !!target && target > today, v.weeklyHours > 0][step];
  const save = () => {
    const final = { ...v, title: v.title.trim(), target };
    A.setVision(final, was ? undefined : defaultStages({ ...final, createdAt: Date.now() }));
    closeSheet();
    go('future');
    toast(was ? L('تحدّث هدفك', 'Goal updated') : L('هدفك جاهز — اختر مهاراتك الحين', 'Your goal is set — now pick your skills'));
    if (!was && !s.future.skills.length) setTimeout(() => openSheet({ type: 'fu-starters' }), 350);
  };
  const titles = [L('وش وضعك؟', 'Where are you?'), L('هدفك', 'Your goal'), L('المدة', 'The time'), L('وقتك ووضعك', 'Your time and situation')];
  return (
    <Sheet title={titles[step]} onClose={closeSheet} footer={
      <>
        {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>{L('رجوع', 'Back')}</button>}
        <span className="grow" />
        {step < 3 ? <button className="btn primary" disabled={!ok} onClick={() => setStep(step + 1)}>{L('التالي', 'Next')}</button> : <button className="btn primary" disabled={!ok} onClick={save}>{was ? L('احفظ', 'Save') : L('ابدأ', 'Start')}</button>}
      </>
    }>
      <div className="fu-form">
        <div className="fu-steps" aria-hidden>{[0, 1, 2, 3].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        {step === 0 && (
          <div className="fu-kinds">{KINDS.map((k) => <button key={k.v} className={v.kind === k.v ? 'on' : ''} aria-pressed={v.kind === k.v} onClick={() => set({ kind: k.v })}>{L(...k.t)}</button>)}</div>
        )}
        {step === 1 && (
          <>
            <label className="field"><span>{L('هدفك الكبير', 'Your big goal')}</span><input className="input" maxLength={120} value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder={student ? L('مثلًا: أتخرج جاهز لوظيفة محلل بيانات', 'e.g. Graduate ready for a data analyst role') : L('مثلًا: أنتقل لمجال تجربة المستخدم', 'e.g. Move into UX design')} /></label>
            <label className="field"><span>{L('ليش يهمك؟', 'Why does it matter?')}</span><input className="input" maxLength={200} value={v.why} onChange={(e) => set({ why: e.target.value })} placeholder={L('السبب اللي يرجّعك له لما تتعب', 'The reason that brings you back when tired')} /></label>
            <label className="field"><span>{L('كيف بتعرف إنك وصلت؟', 'How will you know you’ve arrived?')}</span><input className="input" maxLength={200} value={v.outcome || ''} onChange={(e) => set({ outcome: e.target.value })} placeholder={L('مثلًا: ٣ مشاريع منشورة وتدريب في شركة', 'e.g. 3 published projects and an internship')} /></label>
          </>
        )}
        {step === 2 && (student ? (
          <>
            <label className="field"><span>{L('تخصصك', 'Your major')}</span><input className="input" maxLength={80} value={v.field || ''} onChange={(e) => set({ field: e.target.value })} /></label>
            <div className="fu-two">
              <label className="field"><span>{L('أنت في السنة', 'Current year')}</span><select className="input" value={v.year} onChange={(e) => set({ year: +e.target.value })}>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
              <label className="field"><span>{L('من كم سنة', 'Of how many')}</span><select className="input" value={v.years} onChange={(e) => set({ years: Math.max(+e.target.value, v.year || 1) })}>{[2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
            </div>
            <label className="field"><span>{L('تاريخ التخرج المتوقع', 'Expected graduation')}</span><input className="input" type="date" min={addDays(today, 30)} value={target} onChange={(e) => { if (e.target.value) { setEdited(true); set({ target: e.target.value }); } }} /></label>
            {!edited && <p className="faint small" style={{ margin: 0 }}>{L('محسوب من سنواتك — عدّله لو تعرف التاريخ.', 'Worked out from your years — change it if you know the date.')}</p>}
          </>
        ) : (
          <>
            <label className="field"><span>{L('تبي توصل بتاريخ', 'Reach it by')}</span><input className="input" type="date" min={addDays(today, 30)} value={v.target} onChange={(e) => set({ target: e.target.value })} /></label>
            <div className="fu-kinds">{[6, 12, 24, 36].map((mo) => <button key={mo} onClick={() => set({ target: addDays(today, Math.round(mo * 30.4)) })}>{L(`${mo} شهر`, `${mo} months`)}</button>)}</div>
          </>
        ))}
        {step === 3 && (
          <>
            <label className="field"><span>{L('كم ساعة بالأسبوع تقدر تعطيه بصدق؟', 'Hours a week you can honestly give')}</span>
              <span className="fu-slider"><input type="range" min={1} max={30} value={v.weeklyHours} onChange={(e) => set({ weeklyHours: +e.target.value })} /><b className="num">{v.weeklyHours}</b></span>
            </label>
            <label className="field"><span>{L('وش تتقن الحين؟ (اختياري)', 'What are you good at now? (optional)')}</span><input className="input" maxLength={200} value={v.strengths || ''} onChange={(e) => set({ strengths: e.target.value })} /></label>
            <label className="field"><span>{L('وش تحتاج تطوّر؟ (اختياري)', 'What do you need to grow? (optional)')}</span><input className="input" maxLength={200} value={v.growth || ''} onChange={(e) => set({ growth: e.target.value })} /></label>
            <label className="field"><span>{L('التزاماتك الحالية (اختياري)', 'Current commitments (optional)')}</span><input className="input" maxLength={200} value={v.commitments || ''} onChange={(e) => set({ commitments: e.target.value })} placeholder={L('مثلًا: دوام جزئي، اختبارات نهاية الفصل', 'e.g. part-time job, finals')} /></label>
            <label className="field"><span>{L('ميزانية التطوير بالسنة (اختياري)', 'Yearly growth budget (optional)')}</span><input className="input num" inputMode="numeric" type="number" min={0} value={v.budget ?? ''} onChange={(e) => set({ budget: e.target.value ? Math.max(0, +e.target.value) : undefined })} /></label>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** pick starting skills from the general list (honestly labelled general) */
export function FutureStartersSheet() {
  const s = useApp();
  const kind = s.future.vision?.kind || 'student';
  const have = new Set(s.future.skills.map((k) => k.name));
  const list = STARTERS.filter((x) => x.for.includes(kind) && !have.has(L(...x.name)));
  const [pick, setPick] = useState<string[]>(() => list.slice(0, 3).map((x) => x.key));
  const [own, setOwn] = useState('');
  const stage = currentStage(s.future.stages, todayKey());
  const add = () => {
    const ids = new Map<string, string>();
    for (const x of list.filter((y) => pick.includes(y.key))) ids.set(x.key, A.saveSkill({ name: L(...x.name), cat: x.cat, why: L(...x.why), hours: x.hours, target: x.target, stageId: stage?.id }));
    // prerequisites among the picked ones
    for (const x of list.filter((y) => pick.includes(y.key) && y.after && ids.has(y.after!))) A.saveSkill({ id: ids.get(x.key)!, name: L(...x.name), prereqs: [ids.get(x.after!)!] });
    for (const name of own.split(/[\n،,]/).map((x) => x.trim()).filter(Boolean)) A.saveSkill({ name, cat: 'core', priority: 1, stageId: stage?.id });
    closeSheet();
    go('future/plan');
    toast(L('انضافت لخطتك — عدّل مستواك في كل وحدة', 'Added — set your level on each'));
  };
  return (
    <Sheet title={L('اختر مهاراتك', 'Pick your skills')} onClose={closeSheet} footer={<button className="btn primary grow" disabled={!pick.length && !own.trim()} onClick={add}>{L('أضف للخطة', 'Add to plan')}</button>}>
      <div className="fu-form">
        <label className="field"><span>{L('مهارات تخصصك (أنت أدرى بها)', 'Your field’s skills (you know them best)')}</span><textarea className="input" rows={2} value={own} onChange={(e) => setOwn(e.target.value)} placeholder={L('اكتبها مفصولة بفاصلة: مثلًا الإحصاء التطبيقي، SPSS', 'Comma-separated: e.g. applied statistics, SPSS')} /></label>
        <p className="faint small">{L('ومن قائمة عامة تطلبها أغلب المجالات — نقطة بداية، مو حكم على تخصصك:', 'And from a general list most fields ask for — a start, not a verdict on your field:')}</p>
        <div className="fu-starters">
          {list.map((x) => {
            const on = pick.includes(x.key);
            return (
              <button key={x.key} className={on ? 'on' : ''} aria-pressed={on} onClick={() => setPick(on ? pick.filter((y) => y !== x.key) : [...pick, x.key])}>
                <span className="c">{on ? '✓' : '+'}</span>
                <span className="m"><b>{L(...x.name)}</b><small>{L(...x.why)} · {catName(x.cat)} · {L(`~${x.hours} س`, `~${x.hours}h`)}</small></span>
              </button>
            );
          })}
        </div>
        <p className="faint tiny">{L('الساعات تقدير عام — عدّلها في صفحة كل مهارة.', 'Hours are rough estimates — edit them per skill.')}</p>
      </div>
    </Sheet>
  );
}

export function FutureSkillSheet({ id, stageId }: { id?: string; stageId?: string }) {
  const s = useApp();
  const was = s.future.skills.find((k) => k.id === id);
  const [k, setK] = useState<Partial<FutureSkill> & { name: string }>(() => was ? { ...was } : { name: '', cat: 'core', level: 0, target: 3, priority: 2, prereqs: [], step: 'none', resources: [], log: [], stageId });
  const set = (p: Partial<FutureSkill>) => setK((x) => ({ ...x, ...p }));
  const others = s.future.skills.filter((x) => x.id !== id);
  const [res, setRes] = useState({ title: '', url: '', cost: '' });
  const canProve = !!k.evidence?.trim();
  const save = () => {
    if (k.step === 'proven' && !canProve) return toast(L('«أثبتّ» تحتاج دليل — رابط أو شهادة أو نتيجة', '“Proven” needs evidence — a link, certificate or result'));
    A.saveSkill({ ...k, name: k.name.trim() });
    closeSheet();
  };
  const minutes = was ? skillMinutes(was) : 0;
  return (
    <Sheet title={was ? was.name : L('مهارة جديدة', 'New skill')} onClose={closeSheet} footer={
      <>
        <button className="btn primary grow" disabled={!k.name.trim()} onClick={save}>{L('احفظ', 'Save')}</button>
        {was && <button className="btn ghost" onClick={() => { if (confirm(L('تحذف المهارة؟ تقدر تتراجع.', 'Delete the skill? You can undo.'))) { A.deleteSkill(was.id); closeSheet(); toast(L('انحذفت', 'Deleted'), { undoable: true }); } }}><Icon name="trash" size={15} /></button>}
      </>
    }>
      <div className="fu-form">
        <label className="field"><span>{L('المهارة', 'Skill')}</span><input className="input" maxLength={80} value={k.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="field"><span>{L('ليش تخدم هدفك؟', 'Why it serves your goal')}</span><input className="input" maxLength={200} value={k.why || ''} onChange={(e) => set({ why: e.target.value })} /></label>
        <div className="fu-f"><span>{L('النوع', 'Kind')}</span><div className="fu-chips">{CATS.map((c) => <button key={c.v} className={k.cat === c.v ? 'on' : ''} onClick={() => set({ cat: c.v as SkillCat })}>{L(...c.t)}</button>)}</div></div>
        <div className="fu-two">
          <div className="fu-f"><span>{L('مستواك الحين', 'Your level now')}</span><select className="input" value={k.level} onChange={(e) => set({ level: +e.target.value })}>{LEVELS().map((l, i) => <option key={i} value={i}>{l}</option>)}</select></div>
          <div className="fu-f"><span>{L('المستوى المطلوب', 'Target level')}</span><select className="input" value={k.target} onChange={(e) => set({ target: +e.target.value })}>{LEVELS().map((l, i) => i > 0 && <option key={i} value={i}>{l}</option>)}</select></div>
        </div>
        <div className="fu-f"><span>{L('الأولوية', 'Priority')}</span><Seg value={k.priority as 1 | 2 | 3} onChange={(p) => set({ priority: p })} options={[{ v: 1, l: L('عالية', 'High') }, { v: 2, l: L('متوسطة', 'Medium') }, { v: 3, l: L('لاحقًا', 'Later') }]} /></div>

        <div className="fu-f"><span>{L('وين وصلت فيها', 'How far you’ve taken it')}</span>
          <div className="fu-path">
            {STEPS.slice(1).map((st) => {
              const on = stepIndex(k.step as SkillStep) >= stepIndex(st.v);
              return <button key={st.v} className={on ? 'on' : ''} onClick={() => set({ step: k.step === st.v ? STEPS[stepIndex(st.v) - 1].v : st.v })} title={L(...st.d)}><b>{L(...st.t)}</b><small>{L(...st.d)}</small></button>;
            })}
          </div>
        </div>
        <label className="field"><span>{L('الدليل (يلزم لـ «أثبتّ»)', 'Evidence (needed for “Proven”)')}</span><input className="input" dir="auto" value={k.evidence || ''} onChange={(e) => set({ evidence: e.target.value })} placeholder={L('رابط مشروع، شهادة، نتيجة اختبار…', 'Project link, certificate, test result…')} /></label>

        <div className="fu-two">
          <label className="field"><span>{L('ساعات تقديرية من الحين', 'Estimated hours from now')}</span><input className="input num" inputMode="numeric" type="number" min={0} value={k.hours ?? ''} placeholder={String(Math.max(0, ((k.target || 0) - (k.level || 0)) * 25))} onChange={(e) => set({ hours: e.target.value ? +e.target.value : undefined })} /></label>
          <div className="fu-f"><span>{L('المرحلة', 'Stage')}</span><select className="input" value={k.stageId || ''} onChange={(e) => set({ stageId: e.target.value || undefined })}><option value="">{L('بدون', 'None')}</option>{s.future.stages.map((st) => <option key={st.id} value={st.id}>{st.title}</option>)}</select></div>
        </div>
        {others.length > 0 && (
          <div className="fu-f"><span>{L('تحتاج قبلها', 'Needs first')}</span>
            <div className="fu-chips">{others.map((o) => { const on = !!k.prereqs?.includes(o.id); return <button key={o.id} className={on ? 'on' : ''} onClick={() => set({ prereqs: on ? k.prereqs!.filter((x) => x !== o.id) : [...(k.prereqs || []), o.id] })}>{o.name}</button>; })}</div>
          </div>
        )}

        <div className="fu-f"><span>{L('مصادر التعلّم', 'Learning resources')}</span>
          {(k.resources || []).map((r) => (
            <div key={r.id} className="fu-res">
              <button className={`chk ${r.done ? 'on' : ''}`} aria-label={L('خلّصته', 'Done')} onClick={() => set({ resources: k.resources!.map((x) => (x.id === r.id ? { ...x, done: !x.done } : x)) })}>{r.done ? '✓' : ''}</button>
              <span className="m">{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}{r.cost ? <small className="num"> · {r.cost}{r.expenseId ? L(' · في مصاريفي ✓', ' · in Spending ✓') : ''}</small> : <small> · {L('مجاني', 'free')}</small>}</span>
              {was && r.cost && !r.expenseId ? <button className="btn sm ghost" onClick={() => { const eid = A.resourceToExpense(was.id, r.id); if (eid) { set({ resources: k.resources!.map((x) => (x.id === r.id ? { ...x, expenseId: eid } : x)) }); toast(L('انسجّلت في مصاريفي كتطوير', 'Logged in Spending as growth')); } }}>{L('سجّلها مصروف', 'Log expense')}</button> : null}
              <button className="icon-btn sm" aria-label={L('احذف', 'Remove')} onClick={() => set({ resources: k.resources!.filter((x) => x.id !== r.id) })}><Icon name="x" size={14} /></button>
            </div>
          ))}
          <div className="fu-addres">
            <input className="input" placeholder={L('اسم المصدر', 'Resource')} value={res.title} onChange={(e) => setRes({ ...res, title: e.target.value })} />
            <input className="input" dir="ltr" placeholder="https://" value={res.url} onChange={(e) => setRes({ ...res, url: e.target.value })} />
            <input className="input num" inputMode="numeric" type="number" min={0} placeholder={L('التكلفة', 'Cost')} value={res.cost} onChange={(e) => setRes({ ...res, cost: e.target.value })} />
            <button className="btn sm" disabled={!res.title.trim()} onClick={() => { set({ resources: [...(k.resources || []), { id: uid(), title: res.title.trim(), url: res.url.trim() || undefined, cost: res.cost ? +res.cost : undefined }] }); setRes({ title: '', url: '', cost: '' }); }}>{L('أضف', 'Add')}</button>
          </div>
          <small className="faint">{L('قبل المدفوع، دوّر بديل مجاني (توثيق رسمي، قناة جامعة، مكتبة). الأغلى مو دايم الأفضل.', 'Before paying, look for a free alternative (official docs, university channels, library). Pricier isn’t always better.')}</small>
        </div>

        {was && (
          <div className="fu-f"><span>{L('وقت التدريب', 'Practice time')}</span>
            <p className="faint small" style={{ margin: 0 }}>{L(`المجموع ${fmtH(minutes)} · باقي تقريبًا ${hoursLeft(was)} ساعة`, `Total ${fmtH(minutes)} · about ${hoursLeft(was)}h left`)}</p>
            <button className="btn sm" onClick={() => openSheet({ type: 'fu-log', id: was.id })}><Icon name="clock" size={14} /> {L('سجّل وقت', 'Log time')}</button>
          </div>
        )}
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!k.paused} onChange={(e) => set({ paused: e.target.checked })} /> {L('أوقفها مؤقتًا (ما تدخل الحساب)', 'Pause it (left out of the numbers)')}</label>
        {was && <button className="btn ghost sm" onClick={() => openSheet({ type: 'fu-project', skillId: was.id })}><Icon name="plus" size={14} /> {L('مشروع يطبّقها', 'A project that uses it')}</button>}
      </div>
    </Sheet>
  );
}

export function FutureLogSheet({ id }: { id: string }) {
  const s = useApp();
  const [sid, setSid] = useState(id);
  const k = s.future.skills.find((x) => x.id === sid);
  const [min, setMin] = useState(30);
  const [day, setDay] = useState(todayKey());
  if (!k) return null;
  return (
    <Sheet title={L('سجّل وقت تدريب', 'Log practice time')} onClose={closeSheet} footer={<button className="btn primary grow" onClick={() => { A.logSkill(k.id, min, day); closeSheet(); toast(L(`انسجّل ${fmtH(min)} على «${k.name}»`, `Logged ${fmtH(min)} on “${k.name}”`)); }}>{L('سجّل', 'Log')}</button>}>
      <div className="fu-form">
        <div className="fu-f"><span>{L('المهارة', 'Skill')}</span><select className="input" value={sid} onChange={(e) => setSid(e.target.value)}>{s.future.skills.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="fu-f"><span>{L('كم؟', 'How long?')}</span><div className="fu-chips">{[15, 30, 45, 60, 90, 120].map((m) => <button key={m} className={min === m ? 'on' : ''} onClick={() => setMin(m)}>{fmtH(m)}</button>)}</div></div>
        <label className="field"><span>{L('اليوم', 'Day')}</span><input className="input" type="date" max={todayKey()} value={day} onChange={(e) => setDay(e.target.value || todayKey())} /></label>
        <small className="faint">{L('سجّل تدريب حقيقي بس — حل تمارين، كتابة، بناء. القراءة تحسب، لكن التطبيق يحسب أكثر.', 'Log real practice — exercises, writing, building. Reading counts; applying counts more.')}</small>
      </div>
    </Sheet>
  );
}

export function FutureProjectSheet({ id, skillId, stageId }: { id?: string; skillId?: string; stageId?: string }) {
  const s = useApp();
  const was = s.future.projects.find((p) => p.id === id);
  const [p, setP] = useState<Partial<FutureProject> & { title: string }>(() => was ? { ...was, steps: was.steps.map((x) => ({ ...x })), links: [...was.links] } : { title: '', goal: '', skillIds: skillId ? [skillId] : [], steps: [], links: [], status: 'active', stageId });
  const set = (x: Partial<FutureProject>) => setP((y) => ({ ...y, ...x }));
  const [step, setStep] = useState('');
  const [link, setLink] = useState('');
  const taskDone = (tid?: string) => !!tid && s.tasks.find((t) => t.id === tid)?.status === 'done';
  const save = (extra: Partial<FutureProject> = {}) => {
    const pid = A.saveProject({ ...p, ...extra, title: p.title.trim() });
    closeSheet();
    if (extra.status === 'done') {
      toast(L('مبروك! سجّله في إنجازاتك مع رابطه', 'Congrats! Record it in your wins with its link'), { buttons: [{ label: L('سجّل', 'Record'), primary: true, fn: () => openSheet({ type: 'fu-win', projectId: pid }) }] });
    }
  };
  return (
    <Sheet title={was ? was.title : L('مشروع جديد', 'New project')} onClose={closeSheet} footer={
      <>
        <button className="btn primary grow" disabled={!p.title.trim()} onClick={() => save()}>{L('احفظ', 'Save')}</button>
        {was && p.status !== 'done' && <button className="btn" onClick={() => save({ status: 'done' })}>{L('اكتمل ✓', 'Done ✓')}</button>}
        {was && <button className="btn ghost" onClick={() => { if (confirm(L('تحذف المشروع؟ تقدر تتراجع.', 'Delete the project? You can undo.'))) { A.deleteProject(was.id); closeSheet(); toast(L('انحذف', 'Deleted'), { undoable: true }); } }}><Icon name="trash" size={15} /></button>}
      </>
    }>
      <div className="fu-form">
        <label className="field"><span>{L('المشروع', 'Project')}</span><input className="input" maxLength={100} value={p.title} onChange={(e) => set({ title: e.target.value })} placeholder={L('مثلًا: لوحة تحليل مصاريفي الشهرية', 'e.g. A dashboard of my monthly spending')} /></label>
        <label className="field"><span>{L('وش يحقق؟', 'What does it achieve?')}</span><input className="input" maxLength={200} value={p.goal || ''} onChange={(e) => set({ goal: e.target.value })} /></label>
        {s.future.skills.length > 0 && (
          <div className="fu-f"><span>{L('يطبّق مهارات', 'Uses skills')}</span>
            <div className="fu-chips">{s.future.skills.map((k) => { const on = !!p.skillIds?.includes(k.id); return <button key={k.id} className={on ? 'on' : ''} onClick={() => set({ skillIds: on ? p.skillIds!.filter((x) => x !== k.id) : [...(p.skillIds || []), k.id] })}>{k.name}</button>; })}</div>
          </div>
        )}
        <div className="fu-f"><span>{L('الخطوات', 'Steps')}</span>
          {(p.steps || []).map((st) => {
            const done = st.done || taskDone(st.taskId);
            return (
              <div key={st.id} className={`fu-res ${done ? 'done' : ''}`}>
                <button className={`chk ${done ? 'on' : ''}`} disabled={!!st.taskId} title={st.taskId ? L('حالتها من مهامي', 'Tracked in Tasks') : undefined} aria-label={L('خلّصتها', 'Done')} onClick={() => set({ steps: p.steps!.map((x) => (x.id === st.id ? { ...x, done: !x.done } : x)) })}>{done ? '✓' : ''}</button>
                <span className="m">{st.title}{st.taskId && <small> · {L('في مهامي', 'in Tasks')}</small>}</span>
                {was && !st.taskId && !done && <button className="btn sm ghost" onClick={() => { const tid = A.stepToTask(was.id, st.id); if (tid) { set({ steps: p.steps!.map((x) => (x.id === st.id ? { ...x, taskId: tid } : x)) }); toast(L('انضافت لمهامك', 'Added to your tasks')); } }}>{L('لمهامي', 'To Tasks')}</button>}
                {!st.taskId && <button className="icon-btn sm" aria-label={L('احذف', 'Remove')} onClick={() => set({ steps: p.steps!.filter((x) => x.id !== st.id) })}><Icon name="x" size={14} /></button>}
              </div>
            );
          })}
          <div className="fu-addres two">
            <input className="input" placeholder={L('خطوة صغيرة تقدر تسويها بجلسة', 'A small step you can do in one sitting')} value={step} onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && step.trim()) { set({ steps: [...(p.steps || []), { id: uid(), title: step.trim(), done: false }] }); setStep(''); } }} />
            <button className="btn sm" disabled={!step.trim()} onClick={() => { set({ steps: [...(p.steps || []), { id: uid(), title: step.trim(), done: false }] }); setStep(''); }}>{L('أضف', 'Add')}</button>
          </div>
          {!was && (p.steps || []).length > 0 && <small className="faint">{L('بعد الحفظ تقدر ترسل أي خطوة لمهامك.', 'After saving, send any step to your tasks.')}</small>}
        </div>
        <div className="fu-two">
          <label className="field"><span>{L('الموعد المستهدف', 'Target date')}</span><input className="input" type="date" value={p.due || ''} onChange={(e) => set({ due: e.target.value || undefined })} /></label>
          <div className="fu-f"><span>{L('المرحلة', 'Stage')}</span><select className="input" value={p.stageId || ''} onChange={(e) => set({ stageId: e.target.value || undefined })}><option value="">{L('بدون', 'None')}</option>{s.future.stages.map((st) => <option key={st.id} value={st.id}>{st.title}</option>)}</select></div>
        </div>
        <div className="fu-f"><span>{L('روابط وملفات', 'Links & files')}</span>
          {(p.links || []).map((u, i) => <div key={i} className="fu-res"><span className="m"><a href={u} target="_blank" rel="noreferrer" dir="ltr">{u}</a></span><button className="icon-btn sm" aria-label={L('احذف', 'Remove')} onClick={() => set({ links: p.links!.filter((_, j) => j !== i) })}><Icon name="x" size={14} /></button></div>)}
          <div className="fu-addres two"><input className="input" dir="ltr" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} /><button className="btn sm" disabled={!/^https?:\/\//.test(link.trim())} onClick={() => { set({ links: [...(p.links || []), link.trim()] }); setLink(''); }}>{L('أضف', 'Add')}</button></div>
        </div>
        <label className="field"><span>{L('النتيجة', 'Result')}</span><input className="input" maxLength={200} value={p.result || ''} onChange={(e) => set({ result: e.target.value })} placeholder={L('وش طلع منه؟ رقم، تقييم، أحد استخدمه…', 'What came of it? A number, feedback, someone used it…')} /></label>
      </div>
    </Sheet>
  );
}

export function FutureWinSheet({ id, skillId, projectId }: { id?: string; skillId?: string; projectId?: string }) {
  const s = useApp();
  const was = s.future.wins.find((w) => w.id === id);
  const proj = s.future.projects.find((p) => p.id === projectId);
  const sk = s.future.skills.find((k) => k.id === skillId);
  const [w, setW] = useState(() => was ? { ...was } : { title: proj?.title || (sk ? L(`إتقان ${sk.name}`, `${sk.name}`) : ''), kind: (proj ? 'project' : sk ? 'skill' : 'other') as WinKind, day: todayKey(), evidence: proj?.links[0] || sk?.evidence || '', skillIds: proj?.skillIds || (sk ? [sk.id] : []), note: proj?.result || '' });
  const set = (x: Partial<typeof w>) => setW((y) => ({ ...y, ...x }));
  const save = () => {
    A.saveWin({ ...w, title: w.title.trim() });
    // a proven skill needs evidence: give it this win's
    if (w.kind === 'skill' && (w.evidence || "").trim()) for (const k of s.future.skills.filter((x) => w.skillIds.includes(x.id))) if (!k.evidence) A.saveSkill({ id: k.id, name: k.name, evidence: (w.evidence || "").trim() });
    closeSheet();
    toast(L('انسجّل في إنجازاتك', 'Recorded in your wins'));
  };
  return (
    <Sheet title={was ? L('إنجاز', 'Win') : L('إنجاز جديد', 'New win')} onClose={closeSheet} footer={
      <>
        <button className="btn primary grow" disabled={!w.title.trim()} onClick={save}>{L('احفظ', 'Save')}</button>
        {was && <button className="btn ghost" onClick={() => { A.deleteWin(was.id); closeSheet(); toast(L('انحذف', 'Deleted'), { undoable: true }); }}><Icon name="trash" size={15} /></button>}
      </>
    }>
      <div className="fu-form">
        <label className="field"><span>{L('وش أنجزت؟', 'What did you achieve?')}</span><input className="input" maxLength={140} value={w.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <div className="fu-f"><span>{L('نوعه', 'Kind')}</span><div className="fu-chips">{WIN_KINDS.map((k) => <button key={k.v} className={w.kind === k.v ? 'on' : ''} onClick={() => set({ kind: k.v })}>{L(...k.t)}</button>)}</div></div>
        <label className="field"><span>{L('الدليل', 'Evidence')}</span><input className="input" dir="auto" value={w.evidence} onChange={(e) => set({ evidence: e.target.value })} placeholder={L('رابط، رقم شهادة، اسم الجهة…', 'A link, certificate ID, the organisation…')} /></label>
        {!(w.evidence || "").trim() && <small className="gy-warn">{L('بدون دليل يبقى إنجاز شخصي، بس أقوى لو أحد يقدر يشوفه.', 'Without evidence it stays personal — stronger if others can see it.')}</small>}
        <label className="field"><span>{L('التاريخ', 'Date')}</span><input className="input" type="date" max={todayKey()} value={w.day} onChange={(e) => set({ day: e.target.value || todayKey() })} /></label>
        {s.future.skills.length > 0 && <div className="fu-f"><span>{L('يثبت مهارات', 'Proves skills')}</span><div className="fu-chips">{s.future.skills.map((k) => { const on = w.skillIds.includes(k.id); return <button key={k.id} className={on ? 'on' : ''} onClick={() => set({ skillIds: on ? w.skillIds.filter((x) => x !== k.id) : [...w.skillIds, k.id] })}>{k.name}</button>; })}</div></div>}
        <label className="field"><span>{L('ملاحظة', 'Note')}</span><input className="input" maxLength={200} value={w.note || ''} onChange={(e) => set({ note: e.target.value })} /></label>
      </div>
    </Sheet>
  );
}

export function FutureStageSheet({ id }: { id?: string }) {
  const s = useApp();
  const was = s.future.stages.find((x) => x.id === id);
  const today = todayKey();
  const [st, setSt] = useState(() => was ? { ...was } : { title: '', focus: '', from: today, to: addDays(today, 180) });
  const set = (x: Partial<typeof st>) => setSt((y) => ({ ...y, ...x }));
  // what moving it touches: stages it now runs into, and skills that wait on skills in it
  const impact = useMemo(() => {
    const out: string[] = [];
    for (const o of s.future.stages) if (o.id !== id && o.from <= st.to && o.to >= st.from) out.push(L(`يتداخل مع «${o.title}» — أخّرها أو قصّر هذي`, `Overlaps “${o.title}” — move it or shorten this one`));
    if (was && st.to > was.to) {
      const inIt = new Set(s.future.skills.filter((k) => k.stageId === id).map((k) => k.id));
      for (const k of s.future.skills.filter((k) => k.stageId !== id && k.prereqs.some((p) => inIt.has(p)))) {
        const ks = s.future.stages.find((x) => x.id === k.stageId);
        if (ks && ks.from <= st.to) out.push(L(`«${k.name}» تعتمد على مهارة في هالمرحلة وتبدأ قبل نهايتها — انقلها أو خلها مع المتطلب`, `“${k.name}” depends on a skill here and starts before it ends — move it or keep them together`));
      }
      out.push(L(`أخّرتها ${diffDays(was.to, st.to)} يوم — المراحل بعدها ما تتحرك لحالها، تقدر تعدّلها وحدة وحدة`, `Moved ${diffDays(was.to, st.to)} days later — later stages don’t move on their own; adjust them one by one`));
    }
    return out;
  }, [s, st, id, was]);
  return (
    <Sheet title={was ? was.title : L('مرحلة جديدة', 'New stage')} onClose={closeSheet} footer={
      <>
        <button className="btn primary grow" disabled={!st.title.trim() || st.to < st.from} onClick={() => { A.saveStage({ ...st, title: st.title.trim() }); closeSheet(); }}>{L('احفظ', 'Save')}</button>
        {was && <button className="btn ghost" onClick={() => { A.deleteStage(was.id); closeSheet(); toast(L('انحذفت — محتواها باقي', 'Deleted — its content stays'), { undoable: true }); }}><Icon name="trash" size={15} /></button>}
      </>
    }>
      <div className="fu-form">
        <label className="field"><span>{L('اسم المرحلة', 'Stage name')}</span><input className="input" maxLength={60} value={st.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="field"><span>{L('تركيزها', 'Its focus')}</span><input className="input" maxLength={160} value={st.focus || ''} onChange={(e) => set({ focus: e.target.value })} /></label>
        <div className="fu-two">
          <label className="field"><span>{L('من', 'From')}</span><input className="input" type="date" value={st.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="field"><span>{L('إلى', 'To')}</span><input className="input" type="date" value={st.to} onChange={(e) => set({ to: e.target.value })} /></label>
        </div>
        {impact.length > 0 && <ul className="fu-impact">{impact.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      </div>
    </Sheet>
  );
}

export function FutureReviewSheet({ kind }: { kind: 'week' | 'month' }) {
  const s = useApp();
  const now = Date.now();
  const today = todayKey(now);
  const from = kind === 'week' ? addDays(today, -6) : addDays(today, -29);
  const f = s.future;
  const mins = f.skills.map((k) => ({ k, m: skillMinutes(k, from, today) })).filter((x) => x.m > 0).sort((a, b) => b.m - a.m);
  const tasks = s.tasks.filter((t) => isFutureTask(t) && t.status === 'done' && t.completedAt && todayKey(t.completedAt) >= from);
  const late = s.tasks.filter((t) => isFutureTask(t) && t.status === 'open' && t.due && t.due < today);
  const wins = f.wins.filter((w) => w.day >= from);
  const r = realism(s, now);
  const wk = thisWeek(s, now);
  const [x, setX] = useState({ went: '', blocked: '', keep: '', stop: '', next: '' });
  const set = (p: Partial<typeof x>) => setX((y) => ({ ...y, ...p }));
  const period = kind === 'week' ? addDays(today, -new Date(now).getDay()) : today.slice(0, 7);
  return (
    <Sheet title={kind === 'week' ? L('مراجعة الأسبوع', 'Weekly review') : L('مراجعة الشهر', 'Monthly review')} onClose={closeSheet} footer={<button className="btn primary grow" onClick={() => { A.saveReview({ kind, period, ...x }); closeSheet(); toast(L('انحفظت المراجعة 👏', 'Review saved 👏')); }}>{L('احفظ المراجعة', 'Save review')}</button>}>
      <div className="fu-form">
        <div className="fu-recap">
          <b>{kind === 'week' ? L('آخر ٧ أيام', 'Last 7 days') : L('آخر ٣٠ يوم', 'Last 30 days')}</b>
          <ul>
            <li>{mins.length ? L(`تدرّبت ${fmtH(mins.reduce((a, y) => a + y.m, 0))}: ${mins.map((y) => `${y.k.name} (${fmtH(y.m)})`).join('، ')}`, `Practised ${fmtH(mins.reduce((a, y) => a + y.m, 0))}: ${mins.map((y) => `${y.k.name} (${fmtH(y.m)})`).join(', ')}`) : L('ما فيه وقت تدريب مسجّل', 'No practice logged')}</li>
            <li>{tasks.length ? L(`خلّصت ${tasks.length} خطوة من مهامك`, `${tasks.length} steps done from your tasks`) : L('ما فيه خطوات مخلّصة من مهامك', 'No steps done from your tasks')}</li>
            {wins.length > 0 && <li>{L(`إنجازات جديدة: ${wins.map((w) => w.title).join('، ')}`, `New wins: ${wins.map((w) => w.title).join(', ')}`)}</li>}
            {late.length > 0 && <li className="warn">{L(`متأخر: ${late.map((t) => t.title).join('، ')}`, `Late: ${late.map((t) => t.title).join(', ')}`)}</li>}
            {kind === 'week' && wk.target > 0 && <li>{L(`من وقتك المخطط: ${Math.round((wk.minutes / wk.target) * 100)}%`, `Of your planned time: ${Math.round((wk.minutes / wk.target) * 100)}%`)}</li>}
            {r.ratio > 1.15 && <li className="warn">{L(`الخطة أكبر من وقتك (تحتاج ~${r.need} س وعندك ~${r.have} س) — فكّر توقف مهارة أو تمدد موعد`, `The plan exceeds your time (~${r.need}h vs ~${r.have}h) — pause a skill or extend a date`)}</li>}
          </ul>
          <small className="faint">{L('التأخير طبيعي — المراجعة عشان تعدّل، مو عشان تحاسب نفسك.', 'Slipping is normal — reviewing is for adjusting, not blaming yourself.')}</small>
        </div>
        <label className="field"><span>{L('وش مشى زين؟', 'What went well?')}</span><input className="input" value={x.went} onChange={(e) => set({ went: e.target.value })} /></label>
        <label className="field"><span>{L('وش عطّلك؟', 'What got in the way?')}</span><input className="input" value={x.blocked} onChange={(e) => set({ blocked: e.target.value })} /></label>
        <div className="fu-two">
          <label className="field"><span>{L('استمر في', 'Keep')}</span><input className="input" value={x.keep} onChange={(e) => set({ keep: e.target.value })} /></label>
          <label className="field"><span>{L('أوقف', 'Stop')}</span><input className="input" value={x.stop} onChange={(e) => set({ stop: e.target.value })} /></label>
        </div>
        <label className="field"><span>{kind === 'week' ? L('أهم شي الأسبوع الجاي', 'Top thing next week') : L('خطة الشهر الجاي', 'Next month’s plan')}</span><input className="input" value={x.next} onChange={(e) => set({ next: e.target.value })} /></label>
        {kind === 'month' && f.skills.length > 0 && <button className="btn sm ghost" onClick={() => go('future/plan')}>{L('حدّث مستويات مهاراتك من «خطتي»', 'Update skill levels under “Plan”')}</button>}
      </div>
    </Sheet>
  );
}

export function FuturePostingSheet({ id }: { id?: string }) {
  const s = useApp();
  const was = s.future.postings.find((p) => p.id === id);
  const [title, setTitle] = useState(was?.title || '');
  const [text, setText] = useState(was?.text || '');
  return (
    <Sheet title={was ? was.title : L('ألصق إعلان', 'Paste an ad')} onClose={closeSheet} footer={
      <>
        <button className="btn primary grow" disabled={!title.trim() || text.trim().length < 30} onClick={() => { A.savePosting({ id, title: title.trim(), text: text.trim() }); closeSheet(); go('future/market'); }}>{L('احفظ', 'Save')}</button>
        {was && <button className="btn ghost" onClick={() => { A.deletePosting(was.id); closeSheet(); toast(L('انحذف', 'Deleted'), { undoable: true }); }}><Icon name="trash" size={15} /></button>}
      </>
    }>
      <div className="fu-form">
        <label className="field"><span>{L('المسمى والجهة', 'Title and company')}</span><input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L('مثلًا: محلل بيانات — شركة …', 'e.g. Data analyst — Company …')} /></label>
        <label className="field"><span>{L('نص الإعلان', 'The ad text')}</span><textarea className="input" rows={8} dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder={L('انسخ المتطلبات والمسؤوليات من الإعلان والصقها هنا', 'Copy the requirements and duties and paste them here')} /></label>
        <small className="faint">{L('النص يبقى على جهازك. ما ينرسل لأي مكان.', 'The text stays on your device. It’s sent nowhere.')}</small>
      </div>
    </Sheet>
  );
}

/** on «اليوم»: the one next step toward your future, quietly */
export function FutureTodayCard() {
  const s = useApp();
  const now = useNow(60_000);
  if (!s.future.vision) return null;
  const top = recommendations(s, now).find((r) => r.id !== 'review' && r.id !== 'month');
  if (!top) return null;
  return (
    <section className="tile fu-today">
      <span className="fu-today-i"><Icon name="target" size={20} /></span>
      <span className="m"><b>{top.title}</b><span>{L('خطوتك للمستقبل', 'Your step toward the future')} · {top.reasons[0]?.text}</span></span>
      <button className="btn sm" onClick={() => (top.action ? runAction(top.action.ref) : go('future'))}>{top.action?.label || L('افتح', 'Open')}</button>
    </section>
  );
}
