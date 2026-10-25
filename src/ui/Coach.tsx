import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { go } from './router';
import { useApp } from '../lib/store';
import { useNow } from './kit';
import { todayKey } from '../lib/dates';
import * as A from '../lib/actions';
import { planDay, type DayPlan } from '../lib/engine/planner';
import { coachFacts, coachSystem, factsKey, factsText, offlineMessage, type CoachFacts } from '../lib/engine/coach';
import { askClaude, hasAiKey } from '../lib/ai';
import { L, lang } from '../lib/i18n';

const LEVEL_COLOR = ['var(--green)', 'var(--accent)', 'var(--amber)', 'var(--red)', 'var(--red)'];
const levelLabel = (l: number) =>
  [L('على المسار', 'On track'), L('بدأت تتأخر', 'Slipping'), L('متأخر', 'Behind'), L('متأخر كثير', 'Well behind'), L('تأخير خطير', 'Seriously behind')][l];

const dailyPrompt = (f: CoachFacts) =>
  L(
    `هذه بياناتي الآن:\n${factsText(f)}\n\nاكتب لي رسالة اليوم: من جملتين إلى أربع، بدون عناوين أو نقاط.`,
    `Here is my data right now:\n${factsText(f)}\n\nWrite today's message: two to four sentences, no headings or bullet points.`,
  );

/** today's coach message, shown at the top of the coach page */
export function CoachCard({ plan, now, inPage }: { plan: DayPlan; now: number; inPage?: boolean }) {
  const s = useApp();
  const cs = s.settings.coach;
  const facts = useMemo(() => coachFacts(s, plan, now), [s, plan, now]);
  const key = factsKey(facts, cs.tone, lang());
  const ai = hasAiKey();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const asked = useRef('');


  const generate = async (force = false) => {
    if (!ai || busy || (!force && asked.current === key)) return;
    asked.current = key;
    setBusy(true);
    setErr('');
    try {
      const text = await askClaude(coachSystem(cs.tone, lang(), cs.about), [{ role: 'user', text: dailyPrompt(facts), at: Date.now() }], 1500);
      A.setCoachLast({ day: facts.today, key, text, level: facts.level, ai: true, at: Date.now() });
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // a fresh AI message when the situation changed (new day, new delays, things finished…)
  useEffect(() => {
    if (ai && s.coach.last?.key !== key) generate();
  }, [key, ai]); // eslint-disable-line react-hooks/exhaustive-deps

  const cached = s.coach.last && s.coach.last.day === facts.today && s.coach.last.ai && ai ? s.coach.last : undefined;
  const text = cached?.text || offlineMessage(facts, cs.tone);
  const lvl = facts.level;
  const color = LEVEL_COLOR[lvl];

  return (
    <div className="coach-card" style={{ ['--lvl' as any]: color }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="coach-av"><Icon name="coach" size={18} /></span>
          <div>
            <div className="coach-k">{L('المدرب', 'Coach')}</div>
            <span className="chip" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, height: 22 }}>{levelLabel(lvl)}</span>
          </div>
        </div>
        {ai && (
          <button className="icon-btn sm" onClick={() => generate(true)} disabled={busy} aria-label={L('رسالة جديدة', 'New message')} title={L('رسالة جديدة', 'New message')}>
            <Icon name="repeat" size={15} className={busy ? 'spin' : ''} />
          </button>
        )}
      </div>
      <p className={`coach-text ${busy && !cached ? 'faint' : ''}`}>{text}</p>
      {err && <div className="tiny" style={{ color: 'var(--red)', marginBottom: 8 }}>{err}</div>}
      <div className="row wrap" style={{ gap: 6 }}>
        {!inPage && (
          <button className="btn sm primary" onClick={() => go('coach')}>
            <Icon name="coach" size={14} /> {L('كلّم المدرب', 'Talk to the coach')}
          </button>
        )}
        {!ai && (
          <button className="btn sm ghost" onClick={() => go('me')}>{L('فعّل Claude لرسائل أذكى', 'Turn on Claude for smarter messages')}</button>
        )}
      </div>
    </div>
  );
}

/**
 * The coach lives behind one floating button (top corner, every page). Its dot shows how
 * the day is going; it also records the day's lateness so the coach can see trends.
 */
export function CoachFab() {
  const s = useApp();
  const now = useNow();
  // planning the whole day is the heaviest work on every change: let typing and taps render first
  const lagged = useDeferredValue(s);
  const facts = useMemo(() => coachFacts(lagged, planDay(lagged, now), now), [lagged, now]);
  useEffect(() => {
    A.setCoachScore(facts.today, facts.score);
  }, [facts.today, facts.score]);
  const fresh = s.settings.coach.enabled && s.coach.last?.day !== todayKey(now);
  return (
    <button className="coach-fab" onClick={() => go('coach')} aria-label={L('المدرب', 'Coach')} title={L('المدرب', 'Coach')}>
      <Icon name="coach" size={22} stroke={2} />
      {s.settings.coach.enabled && <i className={fresh ? 'pulse-dot' : ''} style={{ background: LEVEL_COLOR[facts.level] }} />}
    </button>
  );
}
