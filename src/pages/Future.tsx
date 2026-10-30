import { useEffect, useMemo, useState } from 'react';
import { Collapse, Empty, Seg, Sheet, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { PageTop } from '../ui/PageTop';
import { closeSheet, openSheet } from '../ui/sheets';
import { toast } from '../ui/toast';
import { go, useRoute } from '../ui/router';
import { getState, useApp } from '../lib/store';
import * as A from '../lib/actions';
import { daysWord, timeAgo, todayKey } from '../lib/dates';
import {
  activeSkills, allTasks, BENCH_EVERY, calibration, change, curve, FIELDS, fieldPrompt, levelOf, pctOf, readFieldTasks, scoreOf, selfData, SKILLS, skillMeta, skillName, taskById, taskFor, today,
  type Point,
} from '../lib/engine/train';
import type { AppState, DrillAttempt, DrillTask, Mark, SkillId } from '../lib/types';
import { L, lang } from '../lib/i18n';
import { uid } from '../lib/text';
import { canRecord, getClip, saveClip, startRecording } from '../lib/voice';
import { readAsk, readBack, reviewLink, backLink, shareLink, type ReviewAsk } from '../lib/review';

// «صقل»: fifteen minutes a day on a real task. You answer, compare with an expert's answer, mark
// yourself on clear points (or let someone else mark you), and fix the one thing you missed the next
// day. Every 28 days a measurement task of fixed difficulty draws the curve that says if you improved.

const DAY = 86_400_000;
const WD = () => L('ح ن ث ر خ ج س', 'S M T W T F S').split(' ');
// numbers with a sign or % keep their shape inside Arabic text
const pct = (n: number) => `\u2066${n}%\u2069`;
const signed = (n: number) => `\u2066${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}\u2069`;
const short = (id: SkillId) => L(...skillMeta(id).short);
const MARKS: { v: Mark; l: () => string; cls: string }[] = [
  { v: 0, l: () => L('لا', 'No'), cls: 'no' },
  { v: 1, l: () => L('نص نص', 'Partly'), cls: 'part' },
  { v: 2, l: () => L('نعم', 'Yes'), cls: 'yes' },
];

const fieldLabel = (s: AppState) => {
  const f = FIELDS.find((x) => x.v === s.train.setup?.field);
  const b = f?.branches?.find((x) => x.v === s.train.setup?.branch);
  return [f ? L(...f.t) : '', b && b.v !== 'undecided' ? L(...b.t) : ''].filter(Boolean).join(' · ');
};

/** days until the next monthly measurement in any skill you've started; null before the first task */
function nextBench(s: AppState, now: number): number | null {
  let best: number | null = null;
  for (const k of activeSkills(s)) {
    const mine = s.train.attempts.filter((a) => a.skill === k && !a.retry);
    if (!mine.length) continue;
    const benches = mine.filter((a) => a.benchmark).map((a) => a.at);
    const since = benches.length ? Math.max(...benches) : Math.min(...mine.map((a) => a.at));
    const d = Math.max(0, Math.ceil((since + BENCH_EVERY * DAY - now) / DAY));
    best = best == null ? d : Math.min(best, d);
  }
  return best;
}

function Bars({ level }: { level: number }) {
  const n = Math.max(3, level);
  return (
    <span className="sq-bars" aria-label={L(`مستوى ${level}`, `Level ${level}`)}>
      {Array.from({ length: n }, (_, i) => <i key={i} className={i < level ? 'on' : ''} />)}
    </span>
  );
}

// ---------------- the page and its routes ----------------

export function Future() {
  const id = useRoute().id;
  if (id === 'do') return <TaskRun />;
  if (id === 'log') return <TrainLog />;
  if (id && SKILLS.some((x) => x.id === id)) return <SkillPage skill={id as SkillId} />;
  return <TrainHome />;
}

function TrainHome() {
  const s = useApp();
  const now = useNow(60_000);
  const plan = today(s, now);
  const nb = nextBench(s, now);
  const fieldTasks = allTasks(s).some((t) => t.skill === 'field' && !t.benchmark);
  const trainedDays = new Set(s.train.attempts.filter((a) => !a.retry && now - a.at < 28 * DAY).map((a) => todayKey(a.at))).size;
  return (
    <div className="sq">
      <PageTop
        title={L('صقل', 'Sharpen')}
        sub={s.train.attempts.length ? L(`15 دقيقة كل يوم · تدربت ${trainedDays} من آخر 28 يوم`, `15 min a day · trained ${trainedDays} of the last 28 days`) : L('15 دقيقة كل يوم على مهمة حقيقية، وتقيس تطورك كل شهر', '15 minutes a day on a real task, measured every month')}
      />

      {plan && <TodayHero plan={plan} />}

      <section className="sq-sec">
        <div className="sq-sec-h">
          <h2>{L('مهاراتك', 'Your skills')}</h2>
          {nb != null && <span>{nb === 0 ? L('فيه اختبار قياس اليوم', 'A measurement is due') : L(`القياس الجاي بعد ${daysWord(nb)}`, `Next measurement in ${nb} days`)}</span>}
        </div>
        <div className="sq-list">
          {SKILLS.map((k) => {
            if (k.id === 'field' && !fieldTasks)
              return (
                <button key={k.id} className="sq-row" onClick={() => openSheet({ type: 'fu-add' })}>
                  <b>{L('تخصصك', 'Your field')}{fieldLabel(s) ? ` · ${fieldLabel(s)}` : ''}</b>
                  <span className="sq-add"><Icon name="plus" size={14} /> {L('أضف مهام', 'Add tasks')}</span>
                </button>
              );
            const ch = change(s, k.id);
            const diff = ch ? ch.to - ch.from : null;
            return (
              <button key={k.id} className="sq-row" onClick={() => go(`future/${k.id}`)}>
                <b>{k.id === 'field' ? `${L('تخصصك', 'Your field')}${fieldLabel(s) ? ` · ${fieldLabel(s)}` : ''}` : short(k.id)}</b>
                {k.id === 'field' && <span className="sq-ai">{L('بالذكاء الاصطناعي', 'AI-made')}</span>}
                <Bars level={levelOf(s, k.id)} />
                <span className={`sq-ch ${diff == null ? '' : diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`}>{diff == null ? '—' : signed(diff)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="sq-pills">
        {s.train.attempts.length > 0 && <button className="td-pill" onClick={() => go('future/log')}>{L('السجل', 'History')}</button>}
        <button className="td-pill" onClick={() => openSheet({ type: 'fu-setup' })}>{L('الأيام والتذكير', 'Days & reminder')}</button>
      </div>
    </div>
  );
}

/** the big card: today's task, or what you did today */
function TodayHero({ plan }: { plan: NonNullable<ReturnType<typeof today>> }) {
  const s = useApp();
  if (plan.done) {
    const sc = scoreOf(plan.task, plan.done);
    return (
      <>
        <button className="sq-done" onClick={() => openSheet({ type: 'fu-item', id: plan.done!.id })}>
          <span className="sq-done-i"><Icon name="check" size={18} /></span>
          <span className="m"><small>{L('خلصت مهمة اليوم', 'Today’s task is done')}</small><b>{plan.task.title}</b></span>
          {sc && <b className="num">{pct(sc.best)}</b>}
        </button>
        {plan.redo && <RedoRow redo={plan.redo} />}
      </>
    );
  }
  const t = plan.task;
  return (
    <>
      <section className={`sq-hero ${plan.bench ? 'bench' : ''}`}>
        <small>{plan.bench ? L('اختبار القياس الشهري', 'Monthly measurement') : L('مهمة اليوم', 'Today’s task')} · {skillName(plan.skill)} · {L(`مستوى ${t.level}`, `Level ${t.level}`)}</small>
        <h2>{t.title}</h2>
        <p>{t.ask}</p>
        <div className="sq-hero-a">
          <button className="sq-go" onClick={() => go('future/do')}>{L(`ابدأ · ${t.minutes} د`, `Start · ${t.minutes} min`)}</button>
          {!plan.bench && activeSkills(s).length > 1 && (
            <button className="sq-swap" aria-label={L('مهارة ثانية', 'Another skill')} onClick={() => openSheet({ type: 'fu-swap' })}><Icon name="repeat" size={18} /></button>
          )}
        </div>
      </section>
      {plan.redo && <RedoRow redo={plan.redo} />}
    </>
  );
}

function RedoRow({ redo }: { redo: NonNullable<NonNullable<ReturnType<typeof today>>['redo']> }) {
  return (
    <button className="sq-redo" onClick={() => go('future/do?redo=1')}>
      <span className="m"><small>{L('تعديل سريع · 5 د', 'Quick fix · 5 min')} · {redo.task.title}</small><b>{redo.criterion.text}</b></span>
      <Icon name="chevron" size={16} className="chev-end" />
    </button>
  );
}

// ---------------- doing a task ----------------

/** what you were writing, kept while you move around the app */
let draft: { key: string; start: number; answer: string; mode: DrillTask['kind'] } | null = null;

function TaskRun() {
  const s = useApp();
  const route = useRoute();
  const now = useNow(1000);
  // the task is fixed when the screen opens, so saving it doesn't swap it for tomorrow's
  const [setup] = useState(() => {
    const st = getState();
    const plan = today(st);
    if (route.query.get('redo') === '1' && plan?.redo) return { task: plan.redo.task, redo: plan.redo };
    const t = route.query.get('t');
    const task = t ? taskById(st, t) : plan && !plan.done ? plan.task : undefined;
    return { task, redo: undefined };
  });
  const { task, redo } = setup;
  const key = `${task?.id}:${redo ? 'redo' : ''}`;
  const [start] = useState(() => (draft?.key === key ? draft.start : Date.now()));
  const [answer, setAnswer] = useState(() => (draft?.key === key ? draft.answer : ''));
  const [mode, setMode] = useState<DrillTask['kind']>(() => (draft?.key === key ? draft.mode : task?.kind || 'text'));
  const [voice, setVoice] = useState<Blob | null>(null);
  const [stage, setStage] = useState<'do' | 'mark' | 'done'>('do');
  const [secs, setSecs] = useState(0);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [saved, setSaved] = useState<{ id: string; before: number } | null>(null);
  useEffect(() => {
    if (stage === 'do' && task) draft = { key, start, answer, mode };
  }, [key, start, answer, mode, stage, task]);

  if (!task) {
    return (
      <div className="sq">
        <PageTop title={L('صقل', 'Sharpen')} back={{ label: L('صقل', 'Sharpen'), to: 'future' }} />
        <Empty icon="check" title={L('خلصت مهمة اليوم', 'Today’s task is done')}>{L('ارجع بكرة لمهمة جديدة.', 'Come back tomorrow for a new one.')}</Empty>
      </div>
    );
  }

  const minutes = redo ? 5 : task.minutes;
  const left = minutes * 60 - Math.round((now - start) / 1000);
  const clock = `${left < 0 ? '+' : ''}${Math.floor(Math.abs(left) / 60)}:${String(Math.abs(left) % 60).padStart(2, '0')}`;
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const criteria = redo ? [redo.criterion] : task.criteria;
  const ready = mode === 'voice' ? !!voice : mode === 'offline' ? true : !!answer.trim();
  const dir = task.en ? 'ltr' : 'auto';

  const finish = () => {
    setSecs(Math.max(30, Math.round((Date.now() - start) / 1000)));
    setStage('mark');
    window.scrollTo({ top: 0 });
  };
  const save = async () => {
    const id = uid();
    const before = levelOf(s, task.skill);
    let voiceId: string | undefined;
    if (mode === 'voice' && voice) {
      voiceId = id;
      await saveClip(id, voice);
    }
    A.saveAttempt({
      id,
      taskId: task.id,
      skill: task.skill,
      level: task.level,
      at: Date.now(),
      secs,
      ...(answer.trim() ? { answer: answer.trim() } : {}),
      ...(voiceId ? { voiceId } : {}),
      self: marks,
      ...(task.benchmark && !redo ? { benchmark: true } : {}),
      ...(redo ? { retry: { of: redo.attempt.id, criterion: redo.criterion.id } } : {}),
    });
    draft = null;
    setSaved({ id, before });
    setStage('done');
    window.scrollTo({ top: 0 });
  };

  if (stage === 'done' && saved) return <ResultView attemptId={saved.id} before={saved.before} />;

  if (stage === 'mark') {
    return (
      <div className="sq sq-run">
        <div className="sq-top">
          <button className="icon-btn" aria-label={L('رجوع', 'Back')} onClick={() => setStage('do')}><Icon name="back" /></button>
          <h1>{L('قارن وقيّم نفسك', 'Compare and mark yourself')}</h1>
        </div>
        <section className="sq-exemplar">
          <small>{L('إجابة الخبير', 'The expert’s answer')}</small>
          <p dir={dir}>{task.exemplar}</p>
          {task.why.length > 0 && (
            <Collapse title={L(`ليش هي قوية؟ ${task.why.length} أسباب`, `Why it works (${task.why.length})`)}>
              <ul className="sq-why">{task.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </Collapse>
          )}
        </section>
        {answer.trim() && (
          <Collapse title={L('إجابتك', 'Your answer')}>
            <p className="sq-ans" dir={dir}>{answer}</p>
          </Collapse>
        )}
        {redo && <p className="sq-note">{L('قبل: ', 'Before: ')}{MARKS[redo.attempt.self[redo.criterion.id] ?? 0].l()}</p>}
        <div className="sq-sec-h">
          <h2>{L('إجابتك حققت…؟', 'Did your answer…?')}</h2>
          <span>{L('قيّم بصدق، محد يشوفها غيرك', 'Be honest — only you see it')}</span>
        </div>
        <MarkList criteria={criteria} marks={marks} onMark={(c, v) => setMarks({ ...marks, [c]: v })} />
        <button className="sq-cta" disabled={criteria.some((c) => marks[c.id] == null)} onClick={save}>{L('شوف النتيجة', 'See the result')}</button>
      </div>
    );
  }

  return (
    <div className="sq sq-run">
      <div className="sq-top">
        <button className="icon-btn" aria-label={L('رجوع', 'Back')} onClick={() => go('future')}><Icon name="back" /></button>
        <span className={`sq-clock num ${left < 0 ? 'over' : ''}`}><Icon name="clock" size={15} /> {clock}</span>
      </div>
      <div className="sq-head">
        <small>{task.benchmark && !redo ? L('اختبار القياس', 'Measurement') : redo ? L('تعديل سريع', 'Quick fix') : L(`مستوى ${task.level}`, `Level ${task.level}`)} · {skillName(task.skill)}{task.source === 'ai' ? L(' · من الذكاء الاصطناعي', ' · AI-made') : ''}</small>
        <h1>{task.title}</h1>
      </div>
      {redo ? (
        <>
          <p className="sq-ask">{L('أعد كتابة إجابتك بحيث تحقق هالنقطة — بدون ما تشوف إجابة الخبير:', 'Rewrite your answer so it meets this point — without looking at the expert’s answer:')}</p>
          <p className="sq-crit">{redo.criterion.text}</p>
          {redo.attempt.answer && <Collapse title={L('إجابتك الأولى', 'Your first answer')}><p className="sq-ans" dir={dir}>{redo.attempt.answer}</p></Collapse>}
        </>
      ) : (
        <>
          <p className="sq-sit">{task.situation}</p>
          <p className="sq-ask">{task.ask}</p>
          <Collapse title={L(`وش اللي بيتقيّم؟ (${task.criteria.length} نقاط)`, `What’s marked? (${task.criteria.length})`)}>
            <ul className="sq-why">{task.criteria.map((c) => <li key={c.id}>{c.text}</li>)}</ul>
          </Collapse>
        </>
      )}
      {!redo && (
        <Seg
          label={L('طريقة الإجابة', 'How you answer')}
          value={mode}
          onChange={setMode}
          options={[
            { v: 'text', l: L('كتابة', 'Write') },
            ...(canRecord() ? [{ v: 'voice' as const, l: L('صوت', 'Voice') }] : []),
            { v: 'offline', l: L('سويتها برّا', 'Done outside') },
          ]}
        />
      )}
      {mode === 'voice' && !redo ? (
        <VoiceAnswer blob={voice} onBlob={setVoice} />
      ) : (
        <label className="sq-write">
          <span className="sr-only">{L('إجابتك', 'Your answer')}</span>
          <textarea
            className="textarea"
            dir={dir}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={6000}
            placeholder={mode === 'offline' ? L('اختياري: وش سويت باختصار؟', 'Optional: what did you do, briefly?') : task.en ? 'Write your answer here…' : L('اكتب إجابتك هنا…', 'Write your answer here…')}
          />
          {mode === 'text' && <small className="num">{L(`${words} كلمة`, `${words} words`)}</small>}
        </label>
      )}
      <button className="sq-cta" disabled={!ready} onClick={finish}>{L('خلصت — قارن بإجابة الخبير', 'Done — compare with the expert')}</button>
    </div>
  );
}

function MarkList({ criteria, marks, onMark }: { criteria: { id: string; text: string }[]; marks: Record<string, Mark>; onMark: (c: string, v: Mark) => void }) {
  return (
    <div className="sq-marks">
      {criteria.map((c) => (
        <div key={c.id} className="sq-mark">
          <span>{c.text}</span>
          <div role="radiogroup" aria-label={c.text}>
            {MARKS.map((m) => (
              <button key={m.v} role="radio" aria-checked={marks[c.id] === m.v} className={marks[c.id] === m.v ? `on ${m.cls}` : ''} onClick={() => onMark(c.id, m.v)}>{m.l()}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VoiceAnswer({ blob, onBlob }: { blob: Blob | null; onBlob: (b: Blob | null) => void }) {
  const [rec, setRec] = useState<{ stop: () => Promise<Blob>; cancel: () => void } | null>(null);
  const [t0, setT0] = useState(0);
  const now = useNow(1000);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : ''), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => rec?.cancel(), [rec]);
  const start = async () => {
    try {
      const r = await startRecording();
      setRec(r);
      setT0(Date.now());
      onBlob(null);
    } catch {
      toast(L('ما قدرت أوصل للمايك — اسمح له من إعدادات المتصفح أو الجوال', 'Couldn’t reach the microphone — allow it in settings'));
    }
  };
  const stop = async () => {
    if (!rec) return;
    const b = await rec.stop();
    setRec(null);
    onBlob(b);
  };
  const sec = Math.round((now - t0) / 1000);
  return (
    <div className="sq-voice">
      {rec ? (
        <button className="sq-rec on" onClick={stop}><span className="pulse" /> {L('وقّف التسجيل', 'Stop')} · <span className="num">{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}</span></button>
      ) : (
        <button className="sq-rec" onClick={start}><Icon name="mic" size={18} /> {blob ? L('سجّل من جديد', 'Record again') : L('ابدأ التسجيل', 'Start recording')}</button>
      )}
      {url && !rec && <audio controls src={url} />}
      <small className="faint">{L('التسجيل يبقى على جهازك بس.', 'The recording stays on this device.')}</small>
    </div>
  );
}

// ---------------- the result ----------------

function ResultView({ attemptId, before }: { attemptId: string; before: number }) {
  const s = useApp();
  const a = s.train.attempts.find((x) => x.id === attemptId);
  const task = a && taskById(s, a.taskId);
  if (!a || !task) return null;
  const after = levelOf(s, a.skill);
  if (a.retry) {
    const prev = s.train.attempts.find((x) => x.id === a.retry!.of);
    const c = task.criteria.find((x) => x.id === a.retry!.criterion);
    const was = prev ? (prev.peers[0]?.scores || prev.self)[a.retry.criterion] ?? 0 : 0;
    const now = a.self[a.retry.criterion] ?? 0;
    return (
      <div className="sq sq-run sq-result">
        <div className="sq-score">
          <small>{c?.text}</small>
          <b>{MARKS[was].l()} ← {MARKS[now].l()}</b>
          {now > was && <span className="up">{L('تحسنت في هالنقطة', 'You improved on this point')}</span>}
        </div>
        <button className="sq-cta ghost" onClick={() => go('future')}>{L('تم', 'Done')}</button>
      </div>
    );
  }
  const sc = scoreOf(task, a)!;
  const others = s.train.attempts
    .filter((x) => x.skill === a.skill && x.id !== a.id && !x.retry)
    .map((x) => scoreOf(taskById(s, x.taskId), x)?.best)
    .filter((x): x is number => x != null);
  const avg = others.length ? Math.round(others.reduce((p, q) => p + q, 0) / others.length) : null;
  const fix = task.criteria.find((c) => a.self[c.id] === 0) || task.criteria.find((c) => a.self[c.id] === 1);
  return (
    <div className="sq sq-run sq-result">
      <div className="sq-score">
        <small>{task.title}</small>
        <b className="num">{pct(sc.best)}</b>
        {a.benchmark ? (
          <span>{L('انحفظ في منحنى المهارة', 'Saved to the skill’s curve')}</span>
        ) : avg != null && sc.best !== avg ? (
          <span className={sc.best > avg ? 'up' : 'down'}>{sc.best > avg ? L(`أعلى من متوسطك بـ ${sc.best - avg}`, `${sc.best - avg} above your average`) : L(`أقل من متوسطك بـ ${avg - sc.best}`, `${avg - sc.best} below your average`)}</span>
        ) : null}
        {after !== before && <span className={after > before ? 'up' : 'down'}>{after > before ? L(`طلعت للمستوى ${after}`, `Up to level ${after}`) : L(`نزلنا للمستوى ${after} عشان تثبّت الأساس`, `Back to level ${after} to firm up the basics`)}</span>}
      </div>
      {fix ? (
        <section className="sq-fix">
          <small>{L('الشي الوحيد اللي تصلحه', 'The one thing to fix')}</small>
          <b>{fix.text}</b>
          {!a.benchmark && <p>{L('بكرة يطلع لك تعديل سريع (5 د) على هالنقطة بالذات.', 'Tomorrow you get a quick 5-minute fix on exactly this.')}</p>}
          <Collapse title={L('إجابة الخبير', 'The expert’s answer')}><p className="sq-ans" dir={task.en ? 'ltr' : 'auto'}>{task.exemplar}</p></Collapse>
        </section>
      ) : (
        <section className="sq-fix"><b>{L('حققت كل النقاط. خلّ أحد يقيّمها عشان تتأكد.', 'Every point met. Let someone else mark it to be sure.')}</b></section>
      )}
      {a.answer && <AskReviewButton a={a} task={task} />}
      <button className="sq-cta ghost" onClick={() => go('future')}>{L('تم لليوم', 'Done for today')}</button>
    </div>
  );
}

async function askReview(s: AppState, a: DrillAttempt, task: DrillTask) {
  const ask: ReviewAsk = { v: 1, a: a.id, ...(s.settings.name ? { from: s.settings.name } : {}), t: { title: task.title, situation: task.situation, ask: task.ask, criteria: task.criteria, exemplar: task.exemplar, ...(task.en ? { en: true } : {}) }, ans: a.answer || '' };
  const url = await reviewLink(ask);
  const r = await shareLink(url, L('تقدر تقيّم إجابتي؟ ياخذ دقيقتين، وتشوف المعايير وإجابة خبير:', 'Could you mark my answer? Two minutes, with the criteria and an expert’s answer:'));
  if (r === 'copied') toast(L('انسخ الرابط — أرسله لصديق أو دكتور', 'Link copied — send it to a friend or teacher'));
  if (r === 'failed') toast(L('ما قدرت أشارك الرابط', 'Couldn’t share the link'));
}

function AskReviewButton({ a, task }: { a: DrillAttempt; task: DrillTask }) {
  const s = useApp();
  return (
    <button className="sq-big" onClick={() => askReview(s, a, task)}>
      <span className="m"><b>{L('خلّ أحد يقيّمها', 'Let someone mark it')}</b><small>{L('رابط لصديق أو دكتور · رأيه أدق من رأيك', 'A link for a friend or teacher · more accurate than your own')}</small></span>
      <Icon name="share" size={18} />
    </button>
  );
}

// ---------------- one skill ----------------

function Chart({ points }: { points: Point[] }) {
  const pts = points.slice(-8);
  const W = 320;
  const H = 140;
  const x = (i: number) => (pts.length === 1 ? W / 2 : W - 24 - (i * (W - 48)) / (pts.length - 1));
  const y = (p: number) => H - 22 - (p / 100) * (H - 48);
  const month = (at: number) => new Date(at).toLocaleDateString(lang() === 'en' ? 'en' : 'ar-SA-u-ca-gregory-nu-latn', { month: 'short' });
  return (
    <svg className="sq-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={pts.map((p) => `${month(p.at)} ${p.pct}%`).join('، ')}>
      <line x1="0" x2={W} y1={H - 22} y2={H - 22} className="base" />
      {pts.length > 1 && <polyline points={pts.map((p, i) => `${x(i)},${y(p.pct)}`).join(' ')} className="line" />}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.pct)} r={i === pts.length - 1 ? 6 : 4.5} className={`pt ${p.source}`} />
          <text x={x(i)} y={y(p.pct) - 11} textAnchor="middle" className={i === pts.length - 1 ? 'v last' : 'v'}>{p.pct}</text>
          <text x={x(i)} y={H - 5} textAnchor="middle" className="m">{month(p.at)}</text>
        </g>
      ))}
    </svg>
  );
}

function SkillPage({ skill }: { skill: SkillId }) {
  const s = useApp();
  const now = useNow(60_000);
  const meta = skillMeta(skill);
  const cv = curve(s, skill);
  const ch = change(s, skill);
  const cal = calibration(s);
  const sd = skill === 'self' ? selfData(s, now) : null;
  const list = s.train.attempts.filter((a) => a.skill === skill).sort((a, b) => b.at - a.at).slice(0, 12);
  const next = taskFor(s, skill, now);
  const nb = (() => {
    const mine = s.train.attempts.filter((a) => a.skill === skill && !a.retry);
    if (!mine.length) return null;
    const since = cv.bench.length ? cv.bench[cv.bench.length - 1].at : Math.min(...mine.map((a) => a.at));
    return Math.max(0, Math.ceil((since + BENCH_EVERY * DAY - now) / DAY));
  })();
  return (
    <div className="sq">
      <PageTop title={skill === 'field' && fieldLabel(s) ? fieldLabel(s) : L(...meta.t)} sub={L(...meta.what)} back={{ label: L('صقل', 'Sharpen'), to: 'future' }} />

      <section className="sq-card">
        <div className="sq-sec-h">
          <h2>{cv.bench.length ? L('اختبارات القياس', 'Measurements') : L('تمارينك', 'Your practice')}</h2>
          {ch && <span className={ch.to >= ch.from ? 'up' : 'down'}>{signed(ch.to - ch.from)} {L('من أول قياس', 'since the first')}</span>}
        </div>
        {cv.bench.length >= 2 || (!cv.bench.length && cv.practice.length >= 2) ? (
          <Chart points={cv.bench.length ? cv.bench : cv.practice} />
        ) : (
          <p className="sq-note">{nb == null ? L('سوّ أول مهمة، وبعد 28 يوم يجيك أول اختبار قياس. من ثاني قياس يبان منحنى تطورك هنا.', 'Do a first task; 28 days later comes the first measurement. From the second one, your curve shows here.') : L(`اختبار القياس الجاي بعد ${daysWord(nb)}. من ثاني قياس يبان منحنى تطورك هنا.`, `Next measurement in ${nb} days. Your curve shows from the second one.`)}</p>
        )}
      </section>

      <div className="sq-stats">
        <div><b className="num">{levelOf(s, skill)}</b><span>{L('مستواك الحين', 'Your level')}</span></div>
        {sd ? (
          <div><b className="num">{sd.training != null ? pct(sd.training) : '—'}</b><span>{L('التزمت بأيام تدريبك', 'Training days kept')}</span></div>
        ) : (
          <div><b className="num">{cal ? signed(cal.gap) : '—'}</b><span>{cal ? (cal.gap > 0 ? L('تقييمك أعلى من غيرك', 'You mark higher than others') : cal.gap < 0 ? L('تقييمك أقل من غيرك', 'You mark lower than others') : L('تقييمك مثل غيرك', 'You mark like others')) : L('قيّمها مع أحد عشان تعرف دقتك', 'Get marked by someone to see your accuracy')}</span></div>
        )}
        {sd && <div><b className="num">{sd.onTime != null ? pct(sd.onTime) : '—'}</b><span>{L('مهام خلصت بوقتها', 'Tasks done on time')}</span></div>}
      </div>

      {next && <button className="sq-big" onClick={() => go(`future/do?t=${encodeURIComponent(next.id)}`)}><span className="m"><b>{L('تدرّب عليها الحين', 'Practise it now')}</b><small>{next.title} · {next.minutes} {L('د', 'min')}</small></span><Icon name="chevron" size={16} className="chev-end" /></button>}
      {skill === 'field' && <button className="sq-big" onClick={() => openSheet({ type: 'fu-add' })}><span className="m"><b>{L('مهام تخصصك', 'Your field’s tasks')}</b><small>{L('تضيفها من أي ذكاء اصطناعي', 'Add them from any AI')}</small></span><Icon name="chevron" size={16} className="chev-end" /></button>}

      {list.length > 0 && (
        <section className="sq-sec">
          <div className="sq-sec-h"><h2>{L('آخر المهام', 'Recent tasks')}</h2></div>
          <AttemptRows list={list} />
        </section>
      )}
    </div>
  );
}

function AttemptRows({ list, showSkill }: { list: DrillAttempt[]; showSkill?: boolean }) {
  const s = useApp();
  return (
    <div className="sq-att">
      {list.map((a) => {
        const t = taskById(s, a.taskId);
        const sc = scoreOf(t, a);
        const tag = a.retry ? L('تعديل', 'Fix') : a.peers.length ? L(`قيّمها ${a.peers[0].name}`, `Marked by ${a.peers[0].name}`) : '';
        return (
          <button key={a.id} onClick={() => openSheet({ type: 'fu-item', id: a.id })}>
            <span className="m"><b>{t?.title || L('مهمة محذوفة', 'Deleted task')}</b><small>{[showSkill ? short(a.skill) : '', tag, timeAgo(a.at)].filter(Boolean).join(' · ')}</small></span>
            {a.retry ? <b>{MARKS[a.self[a.retry.criterion] ?? 0].l()}</b> : sc ? <b className="num">{pct(sc.best)}</b> : null}
          </button>
        );
      })}
    </div>
  );
}

function TrainLog() {
  const s = useApp();
  const list = [...s.train.attempts].sort((a, b) => b.at - a.at);
  return (
    <div className="sq">
      <PageTop title={L('السجل', 'History')} sub={L(`${list.length} مهمة`, `${list.length} tasks`)} back={{ label: L('صقل', 'Sharpen'), to: 'future' }} />
      {list.length ? <AttemptRows list={list} showSkill /> : <Empty icon="check" title={L('ما فيه مهام للحين', 'No tasks yet')} />}
    </div>
  );
}

// ---------------- sheets ----------------

/** one attempt: your answer, your marks and others', ask for a review, or mark it here */
export function FutureItemSheet({ id }: { id: string }) {
  const s = useApp();
  const a = s.train.attempts.find((x) => x.id === id);
  const task = a && taskById(s, a.taskId);
  const [audio, setAudio] = useState('');
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    let url = '';
    if (a?.voiceId) getClip(a.voiceId).then((b) => { if (b) setAudio((url = URL.createObjectURL(b))); });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [a?.voiceId]);
  if (!a || !task) return <Sheet title={L('صقل', 'Sharpen')} onClose={closeSheet}><p className="muted">{L('المهمة انحذفت.', 'This task was deleted.')}</p></Sheet>;
  const sc = scoreOf(task, a);
  const crits = a.retry ? task.criteria.filter((c) => c.id === a.retry!.criterion) : task.criteria;
  return (
    <Sheet title={task.title} onClose={closeSheet} footer={
      <>
        {a.answer && !a.retry && <button className="btn primary grow" onClick={() => askReview(s, a, task)}><Icon name="share" size={15} /> {L('خلّ أحد يقيّمها', 'Ask for a review')}</button>}
        <button className="btn ghost" aria-label={L('احذف', 'Delete')} onClick={() => { A.deleteAttempt(a.id); closeSheet(); toast(L('انحذفت', 'Deleted'), { undoable: true }); }}><Icon name="trash" size={15} /></button>
      </>
    }>
      <div className="fields sq-sheet">
        <small className="faint">{skillName(a.skill)} · {timeAgo(a.at)}{sc ? ` · ${pct(sc.best)}${sc.source === 'peer' ? L(' (من تقييم غيرك)', ' (by others)') : ''}` : ''}</small>
        {audio && <audio controls src={audio} />}
        {a.answer && <p className="sq-ans" dir={task.en ? 'ltr' : 'auto'}>{a.answer}</p>}
        <div className="sq-crits">
          {crits.map((c) => (
            <div key={c.id}>
              <span>{c.text}</span>
              <span className="sq-chips">
                <i className={MARKS[a.self[c.id] ?? 0].cls}>{L('أنت', 'You')}: {MARKS[a.self[c.id] ?? 0].l()}</i>
                {a.peers.map((p) => <i key={p.id} className={MARKS[p.scores[c.id] ?? 0].cls}>{p.name}: {MARKS[p.scores[c.id] ?? 0].l()}</i>)}
              </span>
            </div>
          ))}
        </div>
        {a.peers.filter((p) => p.note).map((p) => <p key={p.id} className="sq-peer-note"><b>{p.name}:</b> {p.note}</p>)}
        <Collapse title={L('إجابة الخبير', 'The expert’s answer')}><p className="sq-ans" dir={task.en ? 'ltr' : 'auto'}>{task.exemplar}</p></Collapse>
        {!a.retry && (reviewing ? (
          <ReviewForm criteria={task.criteria} onDone={(r) => { A.addPeerReview(a.id, r); setReviewing(false); toast(L('انضاف التقييم', 'Review added')); }} />
        ) : (
          <button className="btn sm" onClick={() => setReviewing(true)}>{L('أحد عندك؟ خلّه يقيّمها على جوالك', 'Someone with you? Let them mark it here')}</button>
        ))}
      </div>
    </Sheet>
  );
}

function ReviewForm({ criteria, onDone, cta }: { criteria: { id: string; text: string }[]; onDone: (r: { name: string; scores: Record<string, Mark>; note?: string }) => void; cta?: string }) {
  const [name, setName] = useState('');
  const [scores, setScores] = useState<Record<string, Mark>>({});
  const [note, setNote] = useState('');
  const ok = name.trim() && criteria.every((c) => scores[c.id] != null);
  return (
    <div className="sq-review">
      <MarkList criteria={criteria} marks={scores} onMark={(c, v) => setScores({ ...scores, [c]: v })} />
      <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} placeholder={L('ملاحظة تساعده يتحسن (اختياري)', 'A note to help them improve (optional)')} />
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={L('اسمك', 'Your name')} aria-label={L('اسمك', 'Your name')} />
      <button className="btn primary" disabled={!ok} onClick={() => onDone({ name: name.trim(), scores, ...(note.trim() ? { note: note.trim() } : {}) })}>{cta || L('احفظ التقييم', 'Save the review')}</button>
    </div>
  );
}

export function FutureSetupSheet() {
  const s = useApp();
  const old = s.train.setup;
  const [field, setField] = useState(old?.field || '');
  const [branch, setBranch] = useState(old?.branch || '');
  const [days, setDays] = useState<number[]>(old?.days || [0, 1, 2, 3, 4]);
  const [time, setTime] = useState(old?.time ?? '20:00');
  const f = FIELDS.find((x) => x.v === field);
  const save = () => {
    A.setupTrain({ ...(field ? { field } : {}), ...(branch ? { branch } : {}), days: days.length ? days : [0, 1, 2, 3, 4, 5, 6], ...(time ? { time } : {}) });
    closeSheet();
    toast(L('انحفظ', 'Saved'));
  };
  return (
    <Sheet title={L('صقل: أيامك وتخصصك', 'Sharpen: days & field')} onClose={closeSheet} footer={<button className="btn primary grow" onClick={save}>{L('احفظ', 'Save')}</button>}>
      <div className="fields">
        <label className="field">
          <span>{L('أي أيام تتدرب؟', 'Which days?')}</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {WD().map((d, i) => (
              <button key={i} className={`chip btnish ${days.includes(i) ? 'on' : ''}`} aria-pressed={days.includes(i)} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())}>{d}</button>
            ))}
          </div>
        </label>
        <label className="field">
          <span>{L('ذكّرني الساعة', 'Remind me at')}</span>
          <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 160 }} />
          <small className="faint">{L('امسحه إذا ما تبي تذكير.', 'Clear it for no reminder.')}</small>
        </label>
        <label className="field">
          <span>{L('تخصصك (لمهام تخصصك)', 'Your field (for field tasks)')}</span>
          <select className="select" value={field} onChange={(e) => { setField(e.target.value); setBranch(''); }}>
            <option value="">{L('— بدون —', '— none —')}</option>
            {FIELDS.map((x) => <option key={x.v} value={x.v}>{L(...x.t)}</option>)}
          </select>
        </label>
        {f?.branches && (
          <label className="field">
            <span>{L('الفرع', 'Branch')}</span>
            <select className="select" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">{L('— اختر —', '— pick —')}</option>
              {f.branches.map((x) => <option key={x.v} value={x.v}>{L(...x.t)}</option>)}
            </select>
          </label>
        )}
      </div>
    </Sheet>
  );
}

/** tasks for your field: copy an instruction into any AI, paste its reply back */
export function FutureAddSheet() {
  const s = useApp();
  const [name, setName] = useState(fieldLabel(s));
  const [reply, setReply] = useState('');
  const custom = s.train.custom.filter((t) => t.skill === 'field');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fieldPrompt(name.trim()));
      toast(L('انسخ الطلب — الصقه في ChatGPT أو Claude أو أي ذكاء اصطناعي', 'Copied — paste it into any AI chat'));
    } catch {
      toast(L('ما قدرت أنسخ', 'Couldn’t copy'));
    }
  };
  const add = () => {
    try {
      const tasks = readFieldTasks(reply, uid);
      A.addFieldTasks(tasks);
      setReply('');
      toast(L(`انضافت ${tasks.length} مهام`, `${tasks.length} tasks added`));
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <Sheet title={L('مهام تخصصك', 'Your field’s tasks')} onClose={closeSheet}>
      <div className="fields">
        <p className="muted small">{L('ما نقدر نكتب مهام دقيقة لكل تخصص، فنخلي ذكاء اصطناعي يكتبها بنفس شكل مهامنا. تطلع عليها علامة «بالذكاء الاصطناعي» — راجعها.', 'We can’t hand-write tasks for every field, so an AI writes them in our format. They’re marked “AI-made” — check them.')}</p>
        <label className="field">
          <span>{L('1 · تخصصك بالتحديد', '1 · Your field, specifically')}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={L('مثلاً: هندسة ميكانيكية — تصميم', 'e.g. Mechanical engineering — design')} />
        </label>
        <button className="btn" disabled={!name.trim()} onClick={copy}><Icon name="copy" size={15} /> {L('انسخ الطلب للذكاء الاصطناعي', 'Copy the request for the AI')}</button>
        <label className="field">
          <span>{L('2 · الصق رده هنا', '2 · Paste its reply here')}</span>
          <textarea className="textarea" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="```json …" dir="ltr" />
        </label>
        <button className="btn primary" disabled={!reply.trim()} onClick={add}>{L('أضف المهام', 'Add the tasks')}</button>
        {custom.length > 0 && (
          <Collapse title={L('مهامك الحالية', 'Your tasks')} count={custom.length}>
            <div className="sq-att">
              {custom.map((t) => (
                <div key={t.id} className="sq-att-row">
                  <span className="m"><b>{t.title}</b><small>{L(`مستوى ${t.level}`, `Level ${t.level}`)}</small></span>
                  <button className="icon-btn sm" aria-label={L('احذف', 'Delete')} onClick={() => A.deleteFieldTask(t.id)}><Icon name="trash" size={15} /></button>
                </div>
              ))}
            </div>
          </Collapse>
        )}
      </div>
    </Sheet>
  );
}

export function FutureSwapSheet() {
  const s = useApp();
  const cur = today(s)?.skill;
  return (
    <Sheet title={L('مهارة ثانية اليوم', 'Another skill today')} onClose={closeSheet}>
      <div className="sq-list">
        {activeSkills(s).filter((k) => k !== cur).map((k) => (
          <button key={k} className="sq-row" onClick={() => { A.swapTrainToday(k); closeSheet(); }}>
            <b>{short(k)}</b>
            <Bars level={levelOf(s, k)} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------- someone else's review, by link ----------------

/** the reviewer's page: opened from a link, on any browser */
export function ReviewPage() {
  const d = useRoute().query.get('d') || '';
  const [ask, setAsk] = useState<ReviewAsk | null | 'bad'>(null);
  const [back, setBack] = useState('');
  useEffect(() => { readAsk(d).then(setAsk, () => setAsk('bad')); }, [d]);
  if (ask === null) return null;
  if (ask === 'bad') return <div className="sq"><PageTop title={L('تقييم', 'Review')} /><Empty icon="alert" title={L('الرابط ناقص أو تالف', 'This link is incomplete')}>{L('اطلب منه يرسله مرة ثانية.', 'Ask them to send it again.')}</Empty></div>;
  const dir = ask.t.en ? 'ltr' : 'auto';
  return (
    <div className="sq">
      <PageTop title={L('قيّم إجابة', 'Mark an answer')} sub={ask.from ? L(`${ask.from} يطلب رأيك — دقيقتين`, `${ask.from} asks for your view — two minutes`) : L('يطلب رأيك — دقيقتين', 'Asking for your view — two minutes')} />
      <section className="sq-card">
        <small className="faint">{L('المهمة', 'The task')}</small>
        <h2 className="sq-h">{ask.t.title}</h2>
        <p className="sq-sit">{ask.t.situation}</p>
        <p className="sq-ask">{ask.t.ask}</p>
      </section>
      <section className="sq-card">
        <small className="faint">{L('إجابته', 'Their answer')}</small>
        <p className="sq-ans" dir={dir}>{ask.ans}</p>
      </section>
      <Collapse title={L('إجابة خبير (للمقارنة)', 'An expert’s answer (to compare)')}><p className="sq-ans" dir={dir}>{ask.t.exemplar}</p></Collapse>
      {back ? (
        <section className="sq-fix">
          <b>{L('شكرًا! باقي خطوة: أرسل له التقييم', 'Thanks! One step left: send it back')}</b>
          <button className="sq-cta" onClick={async () => { const r = await shareLink(back, L('هذا تقييمي لإجابتك:', 'Here is my review of your answer:')); if (r === 'copied') toast(L('انسخ الرابط — أرسله له', 'Link copied — send it to them')); }}>{L('أرسل التقييم', 'Send the review')}</button>
        </section>
      ) : (
        <>
          <div className="sq-sec-h"><h2>{L('إجابته حققت…؟', 'Did the answer…?')}</h2></div>
          <ReviewForm criteria={ask.t.criteria} cta={L('جهّز التقييم', 'Prepare the review')} onDone={async (r) => setBack(await backLink({ v: 1, a: ask.a, ...r }))} />
        </>
      )}
    </div>
  );
}

/** a review coming back: add it to the attempt it belongs to */
export function ReviewBackPage() {
  const s = useApp();
  const d = useRoute().query.get('d') || '';
  const [back, setBack] = useState<Awaited<ReturnType<typeof readBack>> | null | 'bad'>(null);
  useEffect(() => { readBack(d).then(setBack, () => setBack('bad')); }, [d]);
  if (back === null) return null;
  const a = back !== 'bad' ? s.train.attempts.find((x) => x.id === back.a) : undefined;
  const task = a && taskById(s, a.taskId);
  if (back === 'bad' || !a || !task) {
    return <div className="sq"><PageTop title={L('تقييم', 'Review')} back={{ label: L('صقل', 'Sharpen'), to: 'future' }} /><Empty icon="alert" title={back === 'bad' ? L('الرابط ناقص أو تالف', 'This link is incomplete') : L('ما لقيت هالمهمة على هالجهاز', 'This task isn’t on this device')}>{L('افتح الرابط على الجهاز اللي سويت عليه المهمة.', 'Open the link on the device where you did the task.')}</Empty></div>;
  }
  const dup = a.peers.some((p) => p.name === back.name && JSON.stringify(p.scores) === JSON.stringify(back.scores));
  return (
    <div className="sq">
      <PageTop title={L('وصلك تقييم', 'A review arrived')} back={{ label: L('صقل', 'Sharpen'), to: 'future' }} />
      <section className="sq-score">
        <small>{back.name} · {task.title}</small>
        <b className="num">{pct(pctOf(task, back.scores))}</b>
      </section>
      {back.note && <p className="sq-peer-note">{back.note}</p>}
      {dup ? (
        <button className="sq-cta ghost" onClick={() => go('future')}>{L('انضاف قبل — ارجع لصقل', 'Already added — back to Sharpen')}</button>
      ) : (
        <button className="sq-cta" onClick={() => { A.addPeerReview(a.id, back); toast(L('انضاف التقييم', 'Review added')); openSheet({ type: 'fu-item', id: a.id }); go('future'); }}>{L('أضف التقييم', 'Add the review')}</button>
      )}
    </div>
  );
}

// ---------------- on «اليوم» ----------------

/** one line: today's task and a start button; on the days you train, once you've started */
export function FutureTodayCard() {
  const s = useApp();
  const now = useNow(60_000);
  if (!s.train.setup && !s.train.attempts.length) return null;
  const plan = today(s, now);
  if (!plan) return null;
  const days = s.train.setup?.days;
  if (!plan.done && days?.length && !days.includes(new Date(now).getDay())) return null;
  if (plan.done) {
    const sc = scoreOf(plan.task, plan.done);
    return (
      <button className="sq-today done" onClick={() => go('future')}>
        <span className="m"><small>{L('صقل', 'Sharpen')} ✓</small><b>{plan.task.title}{sc ? ` · ${pct(sc.best)}` : ''}</b></span>
      </button>
    );
  }
  return (
    <section className="sq-today">
      <span className="m"><small>{plan.bench ? L('صقل · اختبار القياس', 'Sharpen · measurement') : L(`صقل · ${plan.task.minutes} د`, `Sharpen · ${plan.task.minutes} min`)}</small><b>{plan.task.title}</b></span>
      <button className="sq-go sm" onClick={() => go('future/do')}>{L('ابدأ', 'Start')}</button>
    </section>
  );
}
