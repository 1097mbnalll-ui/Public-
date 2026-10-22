import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Sheet } from './kit';
import { closeSheet, openSheet } from './sheets';
import { go } from './router';
import { getState, useApp } from '../lib/store';
import * as A from '../lib/actions';
import { planDay, type DayPlan } from '../lib/engine/planner';
import { coachFacts, coachSystem, factsKey, factsText, offlineMessage, type CoachFacts } from '../lib/engine/coach';
import { askClaude, hasAiKey } from '../lib/ai';
import { L, lang } from '../lib/i18n';
import { timeAgo } from '../lib/dates';

const LEVEL_COLOR = ['var(--green)', 'var(--accent)', 'var(--amber)', 'var(--red)', 'var(--red)'];
const levelLabel = (l: number) =>
  [L('على المسار', 'On track'), L('بدأت تتأخر', 'Slipping'), L('متأخر', 'Behind'), L('متأخر كثير', 'Well behind'), L('تأخير خطير', 'Seriously behind')][l];

const dailyPrompt = (f: CoachFacts) =>
  L(
    `هذه بياناتي الآن:\n${factsText(f)}\n\nاكتب لي رسالة اليوم: من جملتين إلى أربع، بدون عناوين أو نقاط.`,
    `Here is my data right now:\n${factsText(f)}\n\nWrite today's message: two to four sentences, no headings or bullet points.`,
  );

/** today's coach message, at the top of the Today page */
export function CoachCard({ plan, now }: { plan: DayPlan; now: number }) {
  const s = useApp();
  const cs = s.settings.coach;
  const facts = useMemo(() => coachFacts(s, plan, now), [s, plan, now]);
  const key = factsKey(facts, cs.tone, lang());
  const ai = hasAiKey();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const asked = useRef('');

  useEffect(() => A.setCoachScore(facts.today, facts.score), [facts.today, facts.score]);

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
        <button className="btn sm primary" onClick={() => openSheet({ type: 'coach' })}>
          <Icon name="coach" size={14} /> {L('كلّم المدرب', 'Talk to the coach')}
        </button>
        {!ai && (
          <button className="btn sm ghost" onClick={() => go('me')}>{L('فعّل Claude لرسائل أذكى', 'Turn on Claude for smarter messages')}</button>
        )}
      </div>
    </div>
  );
}

/** chat with the coach — it sees your current plan and history */
export function CoachChat() {
  const s = useApp();
  const cs = s.settings.coach;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const ai = hasAiKey();

  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [s.coach.chat.length, busy]);

  const send = async (q = text) => {
    const v = q.trim();
    if (!v || busy) return;
    setText('');
    setErr('');
    A.addCoachMessage('user', v);
    setBusy(true);
    try {
      // facts are rebuilt at send time so the coach always sees the current state
      const st = getState();
      const f = coachFacts(st, planDay(st), Date.now());
      const system = `${coachSystem(cs.tone, lang(), cs.about)}\n\n${L('بيانات المستخدم الآن', 'The user\'s data right now')}:\n${factsText(f)}\n\n${L(
        'ساعده في أي شيء يطلبه: تقسيم مهمة لخطوات، ترتيب يومه، خطة مذاكرة، صياغة رسالة. كن عمليًا ومختصرًا.',
        'Help with anything they ask: breaking a task into steps, ordering their day, a study plan, drafting a message. Be practical and brief.',
      )}`;
      const reply = await askClaude(system, getState().coach.chat.slice(-20));
      A.addCoachMessage('assistant', reply);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const starters = [
    L('وش أسوي الحين؟', 'What should I do now?'),
    L('قسّم لي أصعب مهمة عندي لخطوات صغيرة', 'Break my hardest task into small steps'),
    L('كيف أمشي على خطة المذاكرة؟', 'How do I keep up with my study plan?'),
  ];

  return (
    <Sheet
      title={L('المدرب', 'Coach')}
      onClose={closeSheet}
      headExtra={s.coach.chat.length > 0 && <button className="btn sm ghost" onClick={A.clearCoachChat}>{L('مسح', 'Clear')}</button>}
      footer={
        ai ? (
          <div className="row grow" style={{ gap: 8 }}>
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
              placeholder={L('اسأل المدرب عن أي شيء…', 'Ask the coach anything…')}
              aria-label={L('رسالتك', 'Your message')}
            />
            <button className="btn primary" onClick={() => send()} disabled={busy || !text.trim()} aria-label={L('إرسال', 'Send')}>
              <Icon name="send" size={16} />
            </button>
          </div>
        ) : undefined
      }
    >
      {!ai ? (
        <div className="col" style={{ gap: 12 }}>
          <div className="notice"><Icon name="info" size={18} /><div>{L('المحادثة تحتاج مفتاح Claude الخاص فيك. أضفه من «أنت ← المدرب الذكي» — يبقى على جهازك فقط.', 'Chat needs your own Claude key. Add it under “You → Smart coach” — it stays on this device only.')}</div></div>
          <button className="btn primary" onClick={() => { closeSheet(); go('me'); }}>{L('افتح الإعدادات', 'Open settings')}</button>
        </div>
      ) : (
        <div className="coach-chat">
          {!s.coach.chat.length && (
            <div className="col" style={{ gap: 8 }}>
              <p className="muted small" style={{ margin: 0 }}>{L('أعرف خطتك وتأخيرك وعاداتك. اسألني أو اختر:', 'I know your plan, your delays and your habits. Ask me, or pick one:')}</p>
              <div className="row wrap" style={{ gap: 6 }}>
                {starters.map((q) => <button key={q} className="chip btnish" onClick={() => send(q)}>{q}</button>)}
              </div>
            </div>
          )}
          {s.coach.chat.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
              <div className="tiny faint">{timeAgo(m.at)}</div>
            </div>
          ))}
          {busy && <div className="bubble assistant faint">{L('يكتب…', 'Typing…')}</div>}
          {err && <div className="tiny" style={{ color: 'var(--red)' }}>{err}</div>}
          <div ref={end} />
        </div>
      )}
    </Sheet>
  );
}
