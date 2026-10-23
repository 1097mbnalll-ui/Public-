import { useMemo, useState } from 'react';
import { Seg, Sheet } from './kit';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import { parseQuick, parseSteps } from '../lib/parse';
import { addProcedure, addSteps, addTask, addTaskFromTemplate, saveTemplate } from '../lib/actions';
import { addDays, fmtClock, fmtMinutes, relDay, todayKey } from '../lib/dates';
import { AREA_LABEL } from '../lib/engine/planner';
import { kindInfo } from '../lib/engine/procedures';
import { uid } from '../lib/text';
import type { Area, Priority, Template, TemplateStep } from '../lib/types';
import { closeSheet, openSheet } from './sheets';
import { toast } from './toast';
import { go } from './router';
import { L } from '../lib/i18n';

type Mode = 'task' | 'proc';

/**
 * «جديد»: one sheet for tasks and work procedures, in a fixed order —
 * what (name) → how urgent → when → area → steps (optional) → template.
 * Typing naturally still works: «بكرة 5م عاجل #عمل» fills the fields below.
 */
export function QuickAdd({ initial = '', initialMode = 'task' }: { initial?: string; initialMode?: Mode }) {
  const s = useApp();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [modeTouched, setModeTouched] = useState(initialMode === 'proc');
  const [text, setText] = useState(initial);
  const [area, setArea] = useState<Area | null>(null);
  const [prio, setPrio] = useState<Priority | null>(null);
  const [day, setDay] = useState<string | null | undefined>(undefined); // undefined = from text
  const [stepsText, setStepsText] = useState('');
  const [showSteps, setShowSteps] = useState(false);
  const [picked, setPicked] = useState<Template | null>(null);
  const [saveAsTpl, setSaveAsTpl] = useState(false);
  const today = todayKey();

  const p = useMemo(() => parseQuick(text, s.templates), [text, s.templates]);
  // typing a procedure template's name («معاملة …») switches to a procedure unless you chose the type yourself
  const isProc = mode === 'proc' || (!modeTouched && !!p.template && p.template.for !== 'task');
  // a template is either picked from the list or recognised from the text («معاملة …»)
  const typed = p.template && (p.template.for === 'task') === !isProc ? p.template : undefined;
  const tpl = picked || typed;
  const title = (p.title.trim() || (tpl && picked ? tpl.name : '')).trim();
  const fArea: Area = area || p.area || tpl?.area || (isProc ? 'work' : 'life');
  const fPrio: Priority = prio ?? p.priority ?? 1;
  const fDue = day === undefined ? p.due : day || undefined;
  const typedSteps = useMemo(() => parseSteps(stepsText), [stepsText]);
  const steps: TemplateStep[] = typedSteps.length ? typedSteps : tpl?.steps || [];
  const canSave = !!title || !!tpl;

  const templates = s.templates.filter((t) => (t.for === 'task') === !isProc).sort((a, b) => b.uses - a.uses);

  const save = (openAfter = false) => {
    if (!canSave) return;
    const name = title || tpl!.name;
    if (isProc) {
      const fields = tpl ? structuredClone(tpl.fields) : [];
      if (typed && fields.length && p.templateRest) fields[0].value = p.templateRest;
      const id = addProcedure(name, typedSteps.length ? undefined : tpl, { priority: fPrio, due: fDue, fields });
      if (typedSteps.length) {
        // steps typed here replace the template's
        addSteps(id, typedSteps.map((x) => ({ ...x, kind: x.kind || 'action' })));
      }
      if (saveAsTpl && steps.length) saveTemplate({ name, notes: '', fields: [], steps: steps.map((x) => ({ ...x, kind: x.kind || 'action' })) });
      closeSheet();
      if (openAfter || !steps.length) go(`work/${id}`);
      else toast(L(`أُضيف الإجراء «${name}» بـ ${steps.length} خطوات`, `Added procedure “${name}” with ${steps.length} steps`), { buttons: [{ label: L('افتح', 'Open'), fn: () => go(`work/${id}`) }] });
      return;
    }
    const base = { area: fArea, priority: fPrio, due: fDue, dueTime: p.dueTime, estimate: p.estimate ?? tpl?.estimate, hard: !!p.hard };
    const id =
      tpl && !typedSteps.length
        ? addTaskFromTemplate(tpl, { ...base, title: name })
        : addTask({ ...base, title: name, checklist: steps.map((x) => ({ id: uid(), title: x.title, done: false, ...(x.kind && x.kind !== 'action' ? { kind: x.kind } : {}), ...(x.target ? { target: x.target } : {}) })) });
    if (saveAsTpl && steps.length) saveTemplate({ for: 'task', name, area: fArea, estimate: base.estimate, notes: '', fields: [], steps });
    closeSheet();
    if (openAfter) openSheet({ type: 'task', id });
    else
      toast(
        fPrio === 3
          ? L(`🔴 «${name}» عاجلة — أُضيفت لمهام اليوم وسأنبهك بها`, `🔴 “${name}” is urgent — added to today and I'll remind you`)
          : fPrio === 2
            ? L(`«${name}» مهمة — خلّصها اليوم أو بكرة`, `“${name}” is important — finish it today or tomorrow`)
            : steps.length
              ? L(`أُضيفت «${name}» بـ ${steps.length} خطوات`, `Added “${name}” with ${steps.length} steps`)
              : L(`أُضيفت «${name}»`, `Added “${name}”`),
        { buttons: [{ label: L('تفاصيل', 'Details'), fn: () => openSheet({ type: 'task', id }) }], undoable: true, ms: fPrio >= 2 ? 7000 : undefined },
      );
  };

  const dayChips = [
    { k: null as string | null, l: L('بدون', 'None') },
    { k: today, l: L('اليوم', 'Today') },
    { k: addDays(today, 1), l: L('غدًا', 'Tomorrow') },
    { k: addDays(today, 7), l: L('بعد أسبوع', 'In a week') },
  ];

  return (
    <Sheet
      title={L('جديد', 'New')}
      onClose={closeSheet}
      footer={
        <>
          <button className="btn primary grow" onClick={() => save()} disabled={!canSave}>
            {isProc ? L('أنشئ الإجراء', 'Create procedure') : L('أضف المهمة', 'Add task')}
          </button>
          <button className="btn" onClick={() => save(true)} disabled={!canSave}>{L('إضافة وتفاصيل', 'Add & details')}</button>
        </>
      }
    >
      <div className="qa">
        <Seg value={isProc ? 'proc' : 'task'} onChange={(m: Mode) => { setMode(m); setModeTouched(true); setPicked(null); }} options={[{ v: 'task', l: L('مهمة', 'Task') }, { v: 'proc', l: L('إجراء عمل', 'Work procedure') }]} />

        <input
          className="input big"
          autoFocus
          placeholder={isProc ? L('اسم الإجراء، مثل: معاملة مؤسسة الأمل', 'Procedure name, e.g. Transaction Al-Amal Co.') : L('وش تبي تنجز؟', 'What do you want to get done?')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && save()}
          aria-label={L('نص المهمة', 'Task text')}
        />
        {(p.dueTime || (p.estimate && !isProc) || p.hard || typed) && (
          <div className="parse-chips">
            {p.dueTime && <span className="chip blue"><Icon name="clock" size={13} /> {fmtClock(p.dueTime)}</span>}
            {p.estimate && !isProc && <span className="chip"><Icon name="hourglass" size={13} /> {fmtMinutes(p.estimate)}</span>}
            {p.hard && <span className="chip red">{L('لا يتأجل', "Can't be postponed")}</span>}
            {typed && <span className="chip violet"><Icon name="layers" size={13} /> {L(`من قالب «${typed.name}»`, `From template “${typed.name}”`)}</span>}
          </div>
        )}

        <div className="qa-row">
          <span className="qa-k">{L('الأولوية', 'Priority')}</span>
          <Seg value={fPrio} onChange={(v: Priority) => setPrio(v)} options={[{ v: 1 as Priority, l: L('عادية', 'Normal') }, { v: 2 as Priority, l: L('مهمة', 'Important') }, { v: 3 as Priority, l: L('عاجلة', 'Urgent') }]} />
        </div>

        <div className="qa-row">
          <span className="qa-k">{L('الموعد', 'Due')}</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {dayChips.map((d) => (
              <button key={d.l} className={`chip btnish ${(fDue || null) === d.k ? 'on' : ''}`} onClick={() => setDay(d.k)}>{d.l}</button>
            ))}
            <input type="date" className="input qa-date" value={fDue || ''} onChange={(e) => setDay(e.target.value || null)} aria-label={L('تاريخ', 'Date')} />
          </div>
        </div>
        {fDue && !dayChips.some((d) => d.k === fDue) && <div className="faint tiny" style={{ marginTop: -6 }}>{relDay(fDue)}</div>}

        {!isProc && (
          <div className="qa-row">
            <span className="qa-k">{L('المجال', 'Area')}</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {(['study', 'work', 'life'] as Area[]).map((a) => (
                <button key={a} className={`chip btnish ${fArea === a ? 'on' : ''}`} onClick={() => setArea(a)}>{AREA_LABEL[a]}</button>
              ))}
            </div>
          </div>
        )}

        {/* steps: optional; each line is a step, its type is recognised from the words */}
        <div className="qa-steps">
          {!showSteps && !steps.length ? (
            <button className="btn sm ghost" style={{ paddingInline: 4 }} onClick={() => setShowSteps(true)}>
              <Icon name="plus" size={14} /> {isProc ? L('أضف الخطوات', 'Add the steps') : L('قسّمها لخطوات (اختياري)', 'Split into steps (optional)')}
            </button>
          ) : (
            <>
              <div className="qa-k" style={{ marginBottom: 6 }}>{L('الخطوات', 'Steps')}{steps.length ? ` (${steps.length})` : ''}</div>
              <textarea
                className="textarea"
                value={stepsText}
                onChange={(e) => setStepsText(e.target.value)}
                placeholder={tpl?.steps.length ? tpl.steps.map((x) => x.title).join('\n') : L('خطوة في كل سطر، مثل:\nاطبع الملف\nاحفظه في ملف المشتريات\nأرسله للمدير', 'One step per line, e.g.:\nPrint the file\nFile it in purchases\nSend it to the manager')}
                style={{ minHeight: 90 }}
              />
              {steps.length > 0 && (
                <div className="qa-preview">
                  {steps.map((x, i) => (
                    <div key={i} className="row small" style={{ gap: 8 }}>
                      <span className="faint num" style={{ width: 14 }}>{i + 1}</span>
                      <span className="grow ellipsis">{x.title}</span>
                      {x.kind && x.kind !== 'action' && <span className="chip amber"><Icon name={kindInfo(x.kind).icon} size={11} /> {kindInfo(x.kind).label}</span>}
                    </div>
                  ))}
                  <div className="faint tiny">{L('النوع (طباعة، إرسال، حفظ…) يُعرف من الكلمات وهو اختياري — تقدر تغيّره من تفاصيل المهمة.', 'The type (print, send, file…) is recognised from the words and is optional — change it in the task details.')}</div>
                </div>
              )}
              {steps.length > 0 && !picked && (
                <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={saveAsTpl} onChange={(e) => setSaveAsTpl(e.target.checked)} />
                  {L('احفظها كقالب جاهز للمرات الجاية', 'Save as a ready template for next time')}
                </label>
              )}
            </>
          )}
        </div>

        {templates.length > 0 && (
          <div>
            <div className="qa-k" style={{ marginBottom: 6 }}>{L('من قالب', 'From a template')}</div>
            <div className="hscroll">
              {templates.map((t) => (
                <button key={t.id} className={`chip btnish ${picked?.id === t.id ? 'on' : ''}`} onClick={() => setPicked(picked?.id === t.id ? null : t)}>
                  <Icon name="layers" size={13} /> {t.name}{t.steps.length ? <span className="faint"> · {t.steps.length}</span> : null}
                </button>
              ))}
              {!isProc && (
                <button className="chip btnish" onClick={() => openSheet({ type: 'template', forTask: true })}><Icon name="plus" size={13} /> {L('قالب جديد', 'New template')}</button>
              )}
            </div>
          </div>
        )}
        {!templates.length && !isProc && (
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start', paddingInline: 4 }} onClick={() => openSheet({ type: 'template', forTask: true })}>
            <Icon name="layers" size={14} /> {L('أنشئ قالب مهمة جاهز', 'Create a ready task template')}
          </button>
        )}

        <p className="faint tiny" style={{ margin: 0 }}>{L('تقدر تكتب بطبيعتك: «بكرة 5م»، «الخميس»، «30د»، «عاجل»، «#عمل».', 'Write naturally (Arabic keywords): «بكرة 5م», «الخميس», «30د», «عاجل», «#عمل».')}</p>
      </div>
    </Sheet>
  );
}
