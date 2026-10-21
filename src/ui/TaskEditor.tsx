import { useState } from 'react';
import { Check, Collapse, NumInput, Seg, Sheet, Switch } from './kit';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { addDays, atTime, fmtDateTime, fmtMinutes, todayKey } from '../lib/dates';
import { AREA_LABEL, PRIORITY_LABEL } from '../lib/engine/planner';
import { calibration, taskTime } from '../lib/engine/learning';
import type { Area, Priority, Task } from '../lib/types';
import { uid } from '../lib/text';
import { closeSheet } from './sheets';
import { ReminderField } from './ReminderField';
import { completeTaskUI } from './ops';
import { toast } from './toast';

export function TaskEditor({ id }: { id: string }) {
  const s = useApp();
  const t = s.tasks.find((x) => x.id === id);
  const [newItem, setNewItem] = useState('');
  if (!t) return null;
  const up = (patch: Partial<Task>) => A.updateTask(id, patch);
  const today = todayKey();
  const cal = calibration(s, t.area);
  const time = taskTime(s, t, cal);
  const open = t.status === 'open';

  const addItem = () => {
    const v = newItem.trim();
    if (!v) return;
    up({ checklist: [...t.checklist, { id: uid(), title: v, done: false }] });
    setNewItem('');
  };

  return (
    <Sheet
      wide
      title={open ? 'المهمة' : t.status === 'done' ? 'مهمة منجزة' : 'مهمة ملغاة'}
      onClose={closeSheet}
      footer={
        open ? (
          <>
            <button className="btn primary" onClick={() => { completeTaskUI(id); closeSheet(); }}>
              <Icon name="check" size={17} /> أنجزت
            </button>
            <button className="btn" onClick={() => { A.startTimer({ kind: 'task', refId: id, label: t.title }); closeSheet(); }}>
              <Icon name="play" size={15} /> ابدأ مؤقت
            </button>
            <span className="grow" />
            <button className="btn ghost" onClick={() => { A.dropTask(id); closeSheet(); toast('أُلغيت المهمة', { undoable: true }); }}>
              إلغاء
            </button>
            <button className="icon-btn" onClick={() => { A.deleteTask(id); closeSheet(); toast('حُذفت المهمة', { undoable: true }); }} aria-label="حذف">
              <Icon name="trash" size={18} />
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => A.reopenTask(id)}>إعادة فتح</button>
            <span className="grow" />
            <button className="icon-btn" onClick={() => { A.deleteTask(id); closeSheet(); toast('حُذفت المهمة', { undoable: true }); }} aria-label="حذف">
              <Icon name="trash" size={18} />
            </button>
          </>
        )
      }
    >
      <div className="fields">
        <input className="input bare" style={{ fontSize: 21, fontWeight: 650 }} value={t.title} onChange={(e) => up({ title: e.target.value })} aria-label="العنوان" />

        <div className="row wrap">
          <Seg value={t.area} onChange={(v: Area) => up({ area: v })} options={(['study', 'work', 'life'] as Area[]).map((a) => ({ v: a, l: AREA_LABEL[a] }))} />
          <Seg value={t.priority} onChange={(v: Priority) => up({ priority: v })} options={([0, 1, 2, 3] as Priority[]).map((p) => ({ v: p, l: PRIORITY_LABEL[p] }))} />
        </div>

        <div className="fields two">
          <div className="field">
            <label>الموعد النهائي</label>
            <input type="date" className="input" value={t.due || ''} onChange={(e) => up({ due: e.target.value || undefined })} />
          </div>
          <div className="field">
            <label>الساعة (اختياري)</label>
            <input type="time" className="input" value={t.dueTime || ''} onChange={(e) => up({ dueTime: e.target.value || undefined })} />
          </div>
        </div>
        <div className="row between">
          <div>
            <div style={{ fontWeight: 500 }}>لا يحتمل التأجيل</div>
            <div className="faint tiny">لن أقترح نقلها عند ازدحام اليوم.</div>
          </div>
          <Switch on={t.hard} onChange={(v) => up({ hard: v })} label="لا يحتمل التأجيل" />
        </div>

        <div className="field">
          <label>كم تحتاج من الوقت؟</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {[15, 30, 45, 60, 90, 120, 180].map((m) => (
              <button key={m} className={`chip btnish ${t.estimate === m ? 'on' : ''}`} onClick={() => up({ estimate: m })}>
                {fmtMinutes(m)}
              </button>
            ))}
            <div style={{ width: 110 }}>
              <NumInput value={t.estimate} onChange={(v) => up({ estimate: v })} placeholder="دقائق" suffix="د" />
            </div>
          </div>
          <div className="faint tiny">
            {t.estimate
              ? cal.n >= 3 && Math.abs(cal.factor - 1) > 0.1
                ? `من ${cal.n} مهام سابقة: تأخذ عادةً ×${cal.factor.toFixed(1)} من تقديرك، لذلك أحسبها ${fmtMinutes(time.minutes + t.spent)}.`
                : 'سأقارن تقديرك بالوقت الفعلي لأتعلم دقة تقديراتك.'
              : `بدون تقدير أفترض ${fmtMinutes(time.minutes)} (متوسط مهامك المنجزة أو 30 د افتراضيًا).`}
            {t.spent > 0 && ` سجّلت ${fmtMinutes(t.spent)} حتى الآن.`}
          </div>
        </div>

        <div className="field">
          <label>متى ستعمل عليها؟</label>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className={`chip btnish ${t.plannedFor === today ? 'on' : ''}`} onClick={() => up({ plannedFor: t.plannedFor === today ? undefined : today })}>اليوم</button>
            <button className={`chip btnish ${t.plannedFor === addDays(today, 1) ? 'on' : ''}`} onClick={() => up({ plannedFor: addDays(today, 1) })}>غدًا</button>
            <input type="date" className="input" style={{ width: 'auto', height: 32, padding: '0 10px' }} value={t.plannedFor || ''} onChange={(e) => up({ plannedFor: e.target.value || undefined })} aria-label="يوم العمل" />
            {!t.plannedFor && <span className="faint tiny">أو اتركها والخطة تختار حسب الأولوية</span>}
          </div>
        </div>

        <div className="field">
          <label>الخطوات {t.checklist.length > 0 && `(${t.checklist.filter((c) => c.done).length}/${t.checklist.length})`}</label>
          <div className="list">
            {t.checklist.map((c) => (
              <div className="item" key={c.id} style={{ padding: '9px 12px' }}>
                <Check square on={c.done} onClick={() => up({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} />
                <input className="input bare grow" style={{ padding: 0 }} value={c.title} onChange={(e) => up({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)) })} />
                <button className="icon-btn sm" onClick={() => up({ checklist: t.checklist.filter((x) => x.id !== c.id) })} aria-label="حذف">
                  <Icon name="x" size={15} />
                </button>
              </div>
            ))}
            <div className="item" style={{ padding: '6px 12px' }}>
              <Icon name="plus" size={18} className="faint" />
              <input className="input bare grow" placeholder="قسّمها لخطوات صغيرة…" value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} />
            </div>
          </div>
        </div>

        <Collapse title="المزيد: الانتظار، التكرار، التذكير، الملاحظات" defaultOpen={!!(t.waitingOn || t.recurrence || t.reminder || t.notes || t.goalId)}>
          <div className="fields">
        <div className="field">
          <label>بانتظار أحد؟</label>
          <input className="input" placeholder="مثال: رد الدكتور، توقيع المدير…" value={t.waitingOn || ''} onChange={(e) => up({ waitingOn: e.target.value || undefined })} />
          <div className="faint tiny">المهام المعلقة لا تدخل خطة اليوم، وأذكّرك بمتابعتها.</div>
        </div>

        <div className="fields two">
          <div className="field">
            <label>ضمن هدف</label>
            <select className="select" value={t.goalId || ''} onChange={(e) => up({ goalId: e.target.value || undefined })}>
              <option value="">—</option>
              {s.goals.filter((g) => !g.doneAt).map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>تتكرر</label>
            <select
              className="select"
              value={t.recurrence ? `${t.recurrence.every}-${t.recurrence.unit}` : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return up({ recurrence: undefined });
                const [n, u] = v.split('-');
                up({ recurrence: { every: +n, unit: u as 'day' }, due: t.due || today });
              }}
            >
              <option value="">لا</option>
              <option value="1-day">يوميًا</option>
              <option value="1-week">أسبوعيًا</option>
              <option value="2-week">كل أسبوعين</option>
              <option value="1-month">شهريًا</option>
            </select>
          </div>
        </div>

        <ReminderField value={t.reminder} onChange={(r) => up({ reminder: r })} title={t.title} dueAt={t.due && t.dueTime ? atTime(t.due, t.dueTime) : undefined} />

        <div className="field">
          <label>ملاحظات</label>
          <textarea className="textarea" value={t.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="تفاصيل، روابط، أرقام…" />
        </div>

          </div>
        </Collapse>

        <div className="faint tiny">
          أُنشئت {fmtDateTime(t.createdAt)}
          {t.deferrals > 0 && ` · أُجّلت ${t.deferrals} مرة`}
          {t.completedAt && ` · ${t.status === 'done' ? 'أُنجزت' : 'أُغلقت'} ${fmtDateTime(t.completedAt)}`}
        </div>
      </div>
    </Sheet>
  );
}
