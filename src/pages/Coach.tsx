import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { PageTop } from '../ui/PageTop';
import { go } from '../ui/router';
import { toast } from '../ui/toast';
import { getState, useApp } from '../lib/store';
import * as A from '../lib/actions';
import { coachSystem } from '../lib/engine/coach';
import { answer, assistantContext, deferrable, detectIntent } from '../lib/engine/assistant';
import { planDay } from '../lib/engine/planner';
import { askClaude, hasAiKey } from '../lib/ai';
import { timeAgo } from '../lib/dates';
import type { CoachAction } from '../lib/types';
import { L, lang } from '../lib/i18n';

const ASSIST_RULES = () =>
  L(
    'أنت مساعده الشخصي: جاوب عن أي سؤال عن يومه ومهامه ومذاكرته وأدائه من البيانات فقط. «وش أأجل؟» = من canWait فقط، وذكّره بما لا يتأجل. «ملخص» = نقاط قصيرة. «رأيك في أدائي» = تقييم صريح بأرقام performance. تقسيم المهام والتخطيط وصياغة الرسائل مسموح. اختصر، واستخدم نقاط عند القوائم.',
    'You are their personal assistant: answer any question about their day, tasks, study and performance from the data only. "What can I postpone?" = only from canWait, and remind them what must not move. "Summary" = short bullets. "How am I doing?" = a frank verdict using the performance numbers. Breaking tasks down, planning and drafting messages are welcome. Be brief; use bullets for lists.',
  );

/** a personal assistant you can talk to: what's on, summaries, what can wait, how you're doing */
export function CoachPage() {
  const s = useApp();
  const cs = s.settings.coach;
  const ai = hasAiKey();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [s.coach.chat.length, busy]);

  const send = async (q = text) => {
    const v = q.trim();
    if (!v || busy) return;
    setText('');
    A.addCoachMessage('user', v);
    const intent = detectIntent(v);
    const st = getState();
    // buttons are always computed locally, so «أجّلها» moves exactly what the rules allow
    const local = answer(intent, st, cs.tone);
    if (!ai) return A.addCoachMessage('assistant', local.text, local.actions);
    setBusy(true);
    try {
      const system = `${coachSystem(cs.tone, lang(), cs.about)}\n\n${ASSIST_RULES()}\n\n${L('بيانات المستخدم الآن', "The user's data right now")}:\n${assistantContext(st)}`;
      const reply = await askClaude(system, getState().coach.chat.slice(-20));
      const actions = intent === 'defer' ? local.actions : undefined;
      A.addCoachMessage('assistant', reply, actions);
    } catch (e: any) {
      // no connection / bad key: still answer from the data
      A.addCoachMessage('assistant', `${local.text}\n\n— ${e?.message || e}`, local.actions);
    } finally {
      setBusy(false);
    }
  };

  const act = (i: number, a: CoachAction) => {
    if (a.kind === 'go') return go(a.path || 'today');
    const st = getState();
    // only move what is still movable right now
    const allowed = new Set(deferrable(st, planDay(st)).map((x) => x.id));
    const ids = (a.ids || []).filter((id) => allowed.has(id));
    if (!ids.length) return toast(L('ما فيه شيء يتأجل الحين.', 'Nothing can be postponed right now.'));
    A.deferMany(ids);
    A.markCoachActionUsed(i);
    toast(L(`أجّلت ${ids.length} لبكرة`, `Moved ${ids.length} to tomorrow`), { undoable: true });
  };

  const starters = [
    L('وش عندي اليوم؟', 'What do I have today?'),
    L('عطني ملخص', 'Give me a summary'),
    L('وش أأجل؟', 'What can I postpone?'),
    L('وش رأيك في أدائي؟', 'How am I doing?'),
    L('وش أسوي الحين؟', 'What should I do now?'),
  ];

  return (
    <div className="coach-page">
      <PageTop
        title={L('مدربك', 'Your coach')}
        sub={ai ? L('يعرف يومك ومهامك ومذاكرتك وأداءك — اسأله أي شيء.', 'Knows your day, tasks, study and performance — ask anything.') : L('يجاوب من بياناتك. أضف مفتاح Claude من «أنت» ليفهم أي سؤال.', 'Answers from your data. Add a Claude key under “You” so it understands any question.')}
        actions={s.coach.chat.length > 0 && <button className="btn sm ghost" onClick={A.clearCoachChat}>{L('محادثة جديدة', 'New chat')}</button>}
      />

      <div className="coach-chat">
        {!s.coach.chat.length && (
          <div className="coach-hello">
            <span className="coach-av big"><Icon name="coach" size={26} /></span>
            <div className="muted">{L('هلا! وش تبي تعرف؟', 'Hi! What would you like to know?')}</div>
          </div>
        )}
        {s.coach.chat.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
            {m.actions && m.actions.length > 0 && (
              <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                {m.actions.map((a, n) => (
                  <button key={n} className={`btn sm ${a.kind === 'defer' ? 'primary' : ''}`} disabled={a.kind === 'defer' && m.used} onClick={() => act(i, a)}>
                    {a.kind === 'defer' && m.used ? L('تم التأجيل ✓', 'Postponed ✓') : a.label}
                  </button>
                ))}
              </div>
            )}
            <div className="tiny faint">{timeAgo(m.at)}</div>
          </div>
        ))}
        {busy && <div className="bubble assistant faint">{L('يكتب…', 'Typing…')}</div>}
        <div ref={end} />
      </div>

      <div className="coach-compose">
        <div className="hscroll" style={{ marginBottom: 8 }}>
          {starters.map((q) => (
            <button key={q} className="chip btnish" onClick={() => send(q)} disabled={busy}>{q}</button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
            placeholder={L('اسأل مدربك…', 'Ask your coach…')}
            aria-label={L('رسالتك', 'Your message')}
          />
          <button className="btn primary" onClick={() => send()} disabled={busy || !text.trim()} aria-label={L('إرسال', 'Send')}>
            <Icon name="send" size={16} />
          </button>
        </div>
        {!ai && (
          <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => go('me')}>
            {L('فعّل Claude ليجاوب أي سؤال', 'Turn on Claude to answer anything')}
          </button>
        )}
      </div>
    </div>
  );
}
