import { useMemo, useState } from 'react';
import { Sheet } from './kit';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import { parseQuick } from '../lib/parse';
import { addProcedure, addTask } from '../lib/actions';
import { addDays, fmtClock, fmtMinutes, relDay, todayKey } from '../lib/dates';
import { AREA_LABEL } from '../lib/engine/planner';
import type { Area, Priority, Template } from '../lib/types';
import { closeSheet, openSheet } from './sheets';
import { toast } from './toast';
import { go } from './router';
import { L, turn } from '../lib/i18n';

/**
 * One field. Type naturally; what was understood shows as chips you can tap to change.
 * Starting with a template name (e.g. «معاملة …») creates a work procedure with its steps.
 */
export function QuickAdd({ initial = '', initialMode = 'task' }: { initial?: string; initialMode?: 'task' | 'proc' }) {
  const s = useApp();
  const [text, setText] = useState(initial);
  const [area, setArea] = useState<Area | null>(null);
  const [prio, setPrio] = useState<Priority | null>(null);
  const [day, setDay] = useState<string | null | undefined>(undefined); // undefined = from text
  const [asProcManual, setAsProcManual] = useState(initialMode === 'proc');
  const [useTpl, setUseTpl] = useState(true);
  const [more, setMore] = useState(false);
  const today = todayKey();

  const p = useMemo(() => parseQuick(text, s.templates), [text, s.templates]);
  const tpl: Template | undefined = useTpl ? p.template : undefined;
  const asProc = !!tpl || asProcManual;
  const fArea: Area = area || p.area || (asProc ? 'work' : 'life');
  const fPrio: Priority = prio ?? p.priority ?? 1;
  const fDue = day === undefined ? p.due : day || undefined;
  const title = p.title.trim();

  const save = (openAfter = false) => {
    if (!title && !tpl) return;
    if (asProc) {
      const fields = tpl ? structuredClone(tpl.fields) : [];
      if (tpl && fields.length && p.templateRest) fields[0].value = p.templateRest;
      const id = addProcedure(title || tpl!.name, tpl, { priority: fPrio, due: fDue, fields });
      closeSheet();
      if (openAfter || !tpl) go(`work/${id}`);
      else
        toast(
          fPrio === 3 ? L(`🔴 «${title}» عاجل — في قائمة اليوم ولا يتأجل`, `🔴 “${title}” is urgent — in today's list and never postponed`) : fPrio === 2 ? L(`«${title}» مهم — خلّصه اليوم أو بكرة`, `“${title}” is important — finish it today or tomorrow`) : L(`أُضيف الإجراء «${title}» بـ ${tpl.steps.length} خطوات`, `Added procedure “${title}” with ${tpl.steps.length} steps`),
          { buttons: [{ label: L('افتح', "Open"), fn: () => go(`work/${id}`) }], ms: fPrio >= 2 ? 7000 : undefined },
        );
    } else {
      const id = addTask({ title, area: fArea, priority: fPrio, due: fDue, dueTime: p.dueTime, estimate: p.estimate, hard: !!p.hard });
      closeSheet();
      if (openAfter) openSheet({ type: 'task', id });
      else
        toast(
          fPrio === 3 ? L(`🔴 «${title}» عاجلة — أُضيفت لمهام اليوم وسأنبهك بها`, `🔴 “${title}” is urgent — added to today and I'll remind you`) : fPrio === 2 ? L(`«${title}» مهمة — خلّصها اليوم أو بكرة`, `“${title}” is important — finish it today or tomorrow`) : L(`أُضيفت «${title}»`, `Added “${title}”`),
          { buttons: [{ label: L('تفاصيل', "Details"), fn: () => openSheet({ type: 'task', id }) }], undoable: true, ms: fPrio >= 2 ? 7000 : undefined },
        );
    }
  };

  const dayChips = [
    { k: today, l: L('اليوم', "Today") },
    { k: addDays(today, 1), l: L('غدًا', "Tomorrow") },
    { k: addDays(today, 7), l: L('بعد أسبوع', "In a week") },
  ];

  return (
    <Sheet
      title={L("جديد", "New")}
      onClose={closeSheet}
      footer={
        <>
          <button className="btn primary grow" onClick={() => save()} disabled={!title && !tpl}>
            {asProc ? L('أنشئ الإجراء', "Create procedure") : L('أضف', "Add")}
          </button>
          <button className="btn" onClick={() => save(true)} disabled={!title && !tpl}>{L("إضافة وتفاصيل", "Add & details")}</button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <input
          className="input big"
          autoFocus
          placeholder={asProc ? L('اسم الإجراء، مثل: معاملة مؤسسة الأمل', "Procedure name, e.g. Transaction Al-Amal Co.") : L('ماذا تريد أن تنجز؟', "What do you want to get done?")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && save()}
          aria-label={L("نص المهمة", "Task text")}
        />

        {/* what the app understood — tap to change */}
        <div className="parse-chips">
          {fDue ? (
            <button className="chip blue" onClick={() => setDay(null)} title={L("إزالة الموعد", "Remove date")}><Icon name="week" size={13} /> {relDay(fDue)} <Icon name="x" size={11} /></button>
          ) : null}
          {p.dueTime && <span className="chip blue"><Icon name="clock" size={13} /> {fmtClock(p.dueTime)}</span>}
          {p.estimate && !asProc && <span className="chip"><Icon name="hourglass" size={13} /> {fmtMinutes(p.estimate)}</span>}
          {fPrio >= 2 && <button className={`chip ${fPrio === 3 ? 'red' : 'amber'}`} onClick={() => setPrio(1)}>{fPrio === 3 ? L('عاجلة', "Urgent") : L('مهمة', "Important")} <Icon name="x" size={11} /></button>}
          {p.hard && <span className="chip red">{L("لا يتأجل", "Can't be postponed")}</span>}
          {asProc ? (
            <span className="chip work"><Icon name="work" size={13} />{L(" إجراء عمل", " Work procedure")}{tpl ? L(` · ${tpl.steps.length} خطوات`, ` · ${tpl.steps.length} steps`) : ''}</span>
          ) : (
            title && <span className={`chip ${fArea}`}>{AREA_LABEL[fArea]}{p.areaGuessed && !area ? L('؟', "?") : ''}</span>
          )}
        </div>

        {p.template && (
          <div className="notice">
            <Icon name="layers" size={18} />
            <div className="grow small">
              {useTpl ? <>{L("من قالب «", "From template “")}{p.template.name}»: {p.template.steps.map((x) => x.title).join(' ← ')}</> : L('ستُضاف كمهمة عادية بلا خطوات.', "Will be added as a plain task without steps.")}
            </div>
            <button className="btn sm" onClick={() => setUseTpl(!useTpl)}>{useTpl ? L('مهمة عادية', "Plain task") : L('القالب', "Template")}</button>
          </div>
        )}

        {!text && s.templates.length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>{L("أو ابدأ إجراء عمل متكرر", "Or start a recurring work procedure")}</div>
            <div className="hscroll">
              {s.templates.slice().sort((a, b) => b.uses - a.uses).map((t) => (
                <button key={t.id} className="chip btnish" onClick={() => setText(t.name + ' ')}>
                  <Icon name="layers" size={13} /> {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* quick adjustments, one row each */}
        <div className="hscroll">
          {dayChips.map((d) => (
            <button key={d.l} className={`chip btnish ${fDue === d.k ? 'on' : ''}`} onClick={() => setDay(fDue === d.k ? null : d.k)}>{d.l}</button>
          ))}
          <button className={`chip btnish ${fPrio === 2 ? 'on' : ''}`} onClick={() => setPrio(fPrio === 2 ? 1 : 2)}>{L("مهمة", "Important")}</button>
          <button className={`chip btnish ${fPrio === 3 ? 'on' : ''}`} onClick={() => setPrio(fPrio === 3 ? 1 : 3)}>{L("عاجلة", "Urgent")}</button>
          {!p.template && (
            <button className={`chip btnish ${asProcManual ? 'on' : ''}`} onClick={() => setAsProcManual(!asProcManual)}>
              <Icon name="work" size={13} />{L(" إجراء بخطوات", " Procedure with steps")}</button>
          )}
        </div>

        {!asProc && (
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start', paddingInline: 4 }} onClick={() => setMore(!more)}>
            {more ? L('إخفاء', "Hide") : L('المجال والتاريخ بالتحديد', "Exact area and date")} <Icon name="chevron" size={14} style={{ transform: more ? turn(90) : turn(-90) }} />
          </button>
        )}
        {more && !asProc && (
          <div className="col" style={{ gap: 10 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              {(['study', 'work', 'life'] as Area[]).map((a) => (
                <button key={a} className={`chip btnish ${fArea === a ? 'on' : ''}`} onClick={() => setArea(a)}>{AREA_LABEL[a]}</button>
              ))}
            </div>
            <input type="date" className="input" value={fDue || ''} onChange={(e) => setDay(e.target.value || null)} aria-label={L("تاريخ", "Date")} />
          </div>
        )}

        <p className="faint tiny" style={{ margin: 0 }}>{L("اكتب بطبيعتك: «بكرة 5م»، «الخميس»، «بعد 3 أيام»، «30د»، «ساعتين»، «مهم»، «عاجل»، «#عمل».", "Write naturally (Arabic keywords): «بكرة 5م», «الخميس», «بعد 3 أيام», «30د», «ساعتين», «مهم», «عاجل», «#عمل».")}</p>
      </div>
    </Sheet>
  );
}
