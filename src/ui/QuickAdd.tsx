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
      else toast(`أُضيف الإجراء «${title}» بـ ${tpl.steps.length} خطوات`, { buttons: [{ label: 'افتح', fn: () => go(`work/${id}`) }] });
    } else {
      const id = addTask({ title, area: fArea, priority: fPrio, due: fDue, dueTime: p.dueTime, estimate: p.estimate, hard: !!p.hard });
      closeSheet();
      if (openAfter) openSheet({ type: 'task', id });
      else
        toast(
          fPrio === 3 ? `🔴 «${title}» عاجلة — أُضيفت لمهام اليوم وسأنبهك بها` : fPrio === 2 ? `«${title}» مهمة — خلّصها اليوم أو بكرة` : `أُضيفت «${title}»`,
          { buttons: [{ label: 'تفاصيل', fn: () => openSheet({ type: 'task', id }) }], undoable: true, ms: fPrio >= 2 ? 7000 : undefined },
        );
    }
  };

  const dayChips = [
    { k: today, l: 'اليوم' },
    { k: addDays(today, 1), l: 'غدًا' },
    { k: addDays(today, 7), l: 'بعد أسبوع' },
  ];

  return (
    <Sheet
      title="جديد"
      onClose={closeSheet}
      footer={
        <>
          <button className="btn primary grow" onClick={() => save()} disabled={!title && !tpl}>
            {asProc ? 'أنشئ الإجراء' : 'أضف'}
          </button>
          <button className="btn" onClick={() => save(true)} disabled={!title && !tpl}>إضافة وتفاصيل</button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <input
          className="input big"
          autoFocus
          placeholder={asProc ? 'اسم الإجراء، مثل: معاملة مؤسسة الأمل' : 'ماذا تريد أن تنجز؟'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && save()}
          aria-label="نص المهمة"
        />

        {/* what the app understood — tap to change */}
        <div className="parse-chips">
          {fDue ? (
            <button className="chip blue" onClick={() => setDay(null)} title="إزالة الموعد"><Icon name="week" size={13} /> {relDay(fDue)} <Icon name="x" size={11} /></button>
          ) : null}
          {p.dueTime && <span className="chip blue"><Icon name="clock" size={13} /> {fmtClock(p.dueTime)}</span>}
          {p.estimate && !asProc && <span className="chip"><Icon name="hourglass" size={13} /> {fmtMinutes(p.estimate)}</span>}
          {fPrio >= 2 && <button className={`chip ${fPrio === 3 ? 'red' : 'amber'}`} onClick={() => setPrio(1)}>{fPrio === 3 ? 'عاجلة' : 'مهمة'} <Icon name="x" size={11} /></button>}
          {p.hard && <span className="chip red">لا يتأجل</span>}
          {asProc ? (
            <span className="chip work"><Icon name="work" size={13} /> إجراء عمل{tpl ? ` · ${tpl.steps.length} خطوات` : ''}</span>
          ) : (
            title && <span className={`chip ${fArea}`}>{AREA_LABEL[fArea]}{p.areaGuessed && !area ? '؟' : ''}</span>
          )}
        </div>

        {p.template && (
          <div className="notice">
            <Icon name="layers" size={18} />
            <div className="grow small">
              {useTpl ? <>من قالب «{p.template.name}»: {p.template.steps.map((x) => x.title).join(' ← ')}</> : 'ستُضاف كمهمة عادية بلا خطوات.'}
            </div>
            <button className="btn sm" onClick={() => setUseTpl(!useTpl)}>{useTpl ? 'مهمة عادية' : 'القالب'}</button>
          </div>
        )}

        {!text && s.templates.length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>أو ابدأ إجراء عمل متكرر</div>
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
          <button className={`chip btnish ${fPrio === 2 ? 'on' : ''}`} onClick={() => setPrio(fPrio === 2 ? 1 : 2)}>مهمة</button>
          <button className={`chip btnish ${fPrio === 3 ? 'on' : ''}`} onClick={() => setPrio(fPrio === 3 ? 1 : 3)}>عاجلة</button>
          {!p.template && (
            <button className={`chip btnish ${asProcManual ? 'on' : ''}`} onClick={() => setAsProcManual(!asProcManual)}>
              <Icon name="work" size={13} /> إجراء بخطوات
            </button>
          )}
        </div>

        {!asProc && (
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start', paddingInline: 4 }} onClick={() => setMore(!more)}>
            {more ? 'إخفاء' : 'المجال والتاريخ بالتحديد'} <Icon name="chevron" size={14} style={{ transform: more ? 'rotate(90deg)' : 'rotate(-90deg)' }} />
          </button>
        )}
        {more && !asProc && (
          <div className="col" style={{ gap: 10 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              {(['study', 'work', 'life'] as Area[]).map((a) => (
                <button key={a} className={`chip btnish ${fArea === a ? 'on' : ''}`} onClick={() => setArea(a)}>{AREA_LABEL[a]}</button>
              ))}
            </div>
            <input type="date" className="input" value={fDue || ''} onChange={(e) => setDay(e.target.value || null)} aria-label="تاريخ" />
          </div>
        )}

        <p className="faint tiny" style={{ margin: 0 }}>
          اكتب بطبيعتك: «بكرة 5م»، «الخميس»، «بعد 3 أيام»، «30د»، «ساعتين»، «مهم»، «عاجل»، «#عمل».
        </p>
      </div>
    </Sheet>
  );
}
