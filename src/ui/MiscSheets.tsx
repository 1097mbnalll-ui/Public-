import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, Check, Sheet } from './kit';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { fmtDate, fmtMinutes, relDay } from '../lib/dates';
import { matches } from '../lib/text';
import { planDay, suggestDeferrals, AREA_LABEL } from '../lib/engine/planner';
import { closeSheet, openSheet } from './sheets';
import { toast } from './toast';
import { go } from './router';
import { completeTaskUI, exportUI } from './ops';
import type { Area } from '../lib/types';
import { L } from '../lib/i18n';
import { shortcutList } from './shortcuts';

export function ReplanSheet() {
  const s = useApp();
  const plan = useMemo(() => planDay(s), [s]);
  const suggested = useMemo(() => suggestDeferrals(plan, s), [plan, s]);
  const [sel, setSel] = useState<string[]>(suggested.map((i) => i.id));
  const movable = plan.items.filter((i) => (i.kind === 'task' || i.kind === 'procedure') && i.level !== 'urgent');
  const selMinutes = movable.filter((i) => sel.includes(i.id)).reduce((a, i) => a + i.minutes, 0);
  const after = plan.load - selMinutes;

  return (
    <Sheet
      title={L("إعادة ترتيب اليوم", "Rearrange today")}
      onClose={closeSheet}
      footer={
        <>
          <button
            className="btn primary grow"
            disabled={!sel.length}
            onClick={() => {
              A.deferMany(sel);
              closeSheet();
              toast(L(`نُقلت ${sel.length} إلى الغد`, `Moved ${sel.length} to tomorrow`), { undoable: true });
            }}
          >{L("انقل المحدد إلى الغد", "Move selected to tomorrow")}</button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="glass">
          <div className="row between small">
            <span className="muted">{L("المتبقي من وقتك اليوم", "Time left today")}</span>
            <b className="num">{fmtMinutes(plan.remaining)}</b>
          </div>
          <div className="row between small" style={{ marginTop: 4 }}>
            <span className="muted">{L("الخطة بعد النقل", "Plan after moving")}</span>
            <b className="num" style={{ color: after > plan.remaining ? 'var(--red)' : 'var(--green)' }}>{fmtMinutes(after)}</b>
          </div>
          <div style={{ marginTop: 10 }}>
            <Bar value={plan.remaining ? after / plan.remaining : 1} color={after > plan.remaining ? 'var(--red)' : 'var(--green)'} />
          </div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>{L("اخترت لك الأقل أهمية أولًا. العاجل لا يظهر هنا أبدًا، ولا أقترح ما لا يحتمل التأجيل. المذاكرة المقترحة تبقى لأنها محسوبة على موعد اختبارك.", "Least important first. Urgent items never appear here, and I don't suggest anything that can't be postponed. Suggested study stays because it's tied to your exam date.")}</p>
        <div className="list">
          {movable.map((i) => {
            const on = sel.includes(i.id);
            return (
              <div key={i.id} className="item tap" onClick={() => setSel(on ? sel.filter((x) => x !== i.id) : [...sel, i.id])}>
                <Check square on={on} onClick={() => setSel(on ? sel.filter((x) => x !== i.id) : [...sel, i.id])} label={L("اختيار", "Select")} />
                <div className="grow">
                  <div className="title">{i.title}</div>
                  <div className="meta">
                    <span className="chip">{fmtMinutes(i.minutes)}</span>
                    {i.reasons.slice(0, 2).map((r) => <span key={r} className="reason">{r}</span>)}
                  </div>
                </div>
              </div>
            );
          })}
          {!movable.length && <div className="item muted">{L("لا توجد مهام يمكن نقلها.", "No tasks can be moved.")}</div>}
        </div>
      </div>
    </Sheet>
  );
}

interface PItem {
  key: string;
  icon: string;
  title: string;
  sub?: string;
  run: () => void;
}

export function ShortcutsSheet() {
  const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  return (
    <Sheet title={L('اختصارات لوحة المفاتيح', 'Keyboard shortcuts')} onClose={closeSheet}>
      {touch && <p className="muted small">{L('تعمل مع لوحة مفاتيح موصولة بالجهاز.', 'These work with a keyboard connected to the device.')}</p>}
      <div className="list">
        {shortcutList().map((k) => (
          <div key={k.label} className="item small">
            <span className="grow">{k.label}</span>
            <span className="row" style={{ gap: 4 }} dir="ltr">{k.keys.map((x) => <span key={x} className="kbd">{x}</span>)}</span>
          </div>
        ))}
      </div>
      <p className="faint tiny">{L('تعمل الحروف على لوحة المفاتيح العربية أيضًا: N هي «ى» و/ هي «ظ».', 'Letters work on an Arabic keyboard too: N is «ى» and / is «ظ».')}</p>
    </Sheet>
  );
}

export function Palette() {
  const s = useApp();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<PItem[]>(() => {
    const cmds: PItem[] = [
      { key: 'c-add', icon: 'plus', title: L('إضافة مهمة', "Add task"), run: () => openSheet({ type: 'quick' }) },
      { key: 'c-proc', icon: 'work', title: L('إجراء عمل جديد', "New work procedure"), run: () => openSheet({ type: 'quick', mode: 'proc' }) },
      { key: 'c-study', icon: 'study', title: L('تسجيل مذاكرة', "Log study"), run: () => openSheet({ type: 'study-log' }) },
      { key: 'c-exam', icon: 'flag', title: L('إضافة اختبار', "Add exam"), run: () => openSheet({ type: 'exam' }) },
      { key: 'c-today', icon: 'today', title: L('اليوم', "Today"), run: () => go('today') },
      { key: 'c-week', icon: 'week', title: L('الأسبوع', "Week"), run: () => go('week') },
      { key: 'c-ins', icon: 'insights', title: L('ما تعلمته عنك', "What I've learned about you"), run: () => go('me/insights') },
      { key: 'c-set', icon: 'settings', title: L('الإعدادات', "Settings"), run: () => go('me') },
      { key: 'c-tt', icon: 'cal', title: L('جدولي', "My timetable"), run: () => go('schedule') },
      { key: 'c-sync', icon: 'repeat', title: L('المزامنة بين أجهزتك', "Sync across devices"), run: () => openSheet({ type: 'sync' }) },
      { key: 'c-move', icon: 'share', title: L('نقل بياناتي لجهاز آخر', "Move my data to another device"), run: () => openSheet({ type: 'transfer' }) },
      { key: 'c-keys', icon: 'question', title: L('اختصارات لوحة المفاتيح', "Keyboard shortcuts"), sub: '?', run: () => openSheet({ type: 'shortcuts' }) },
      { key: 'c-exp', icon: 'download', title: L('تنزيل نسخة احتياطية', "Download backup"), run: exportUI },
    ];
    if (!q.trim()) return cmds;
    const out: PItem[] = [];
    for (const t of s.tasks) {
      if (matches(`${t.title} ${t.notes} ${t.checklist.map((c) => c.title).join(' ')} ${t.waitingOn || ''}`, q))
        out.push({ key: t.id, icon: t.status === 'open' ? 'tasks' : 'check', title: t.title, sub: L(`${AREA_LABEL[t.area]}${t.due ? ' · ' + relDay(t.due) : ''}${t.status !== 'open' ? ' · منجزة' : ''}`, `${AREA_LABEL[t.area]}${t.due ? ' · ' + relDay(t.due) : ''}${t.status !== 'open' ? ' · done' : ''}`), run: () => openSheet({ type: 'task', id: t.id }) });
    }
    for (const p of s.procedures) {
      const hay = `${p.title} ${p.notes} ${p.fields.map((f) => f.key + ' ' + f.value).join(' ')} ${p.steps.map((x) => x.title + ' ' + (x.target || '') + ' ' + (x.note || '')).join(' ')} ${p.log.map((l) => l.text).join(' ')}`;
      if (matches(hay, q)) out.push({ key: p.id, icon: 'work', title: p.title, sub: L(`إجراء${p.completedAt ? ' مكتمل' : ''}${p.archived ? ' · أرشيف' : ''} · ${fmtDate(new Date(p.createdAt).toISOString().slice(0, 10), false)}`, `Procedure${p.completedAt ? ' completed' : ''}${p.archived ? ' · archived' : ''} · ${fmtDate(new Date(p.createdAt).toISOString().slice(0, 10), false)}`), run: () => go(`work/${p.id}`) });
    }
    for (const c of s.courses) if (matches(c.name, q)) out.push({ key: c.id, icon: 'study', title: c.name, sub: L('مادة', "Course"), run: () => go(`study/${c.id}`) });
    for (const u of s.units) {
      if (!matches(u.title, q)) continue;
      const c = s.courses.find((x) => x.id === u.courseId);
      out.push({ key: u.id, icon: 'study', title: u.title, sub: c?.name, run: () => go(`study/${u.courseId}`) });
    }
    for (const t of s.templates) if (matches(t.name, q)) out.push({ key: t.id, icon: 'layers', title: t.name, sub: L('قالب', "Template"), run: () => openSheet({ type: 'quick', text: t.name + ' ', mode: 'task' }) });
    for (const g of s.goals) if (matches(g.title, q)) out.push({ key: g.id, icon: 'target', title: g.title, sub: L('هدف', "Goal"), run: () => openSheet({ type: 'goal', id: g.id }) });
    return [...out.slice(0, 40), ...cmds.filter((c) => matches(c.title, q))];
  }, [q, s]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const run = (i: PItem) => {
    closeSheet();
    setTimeout(i.run, 0);
  };

  return (
    <Sheet title={L("بحث", "Search")} onClose={closeSheet}>
      <input
        className="input big"
        autoFocus
        placeholder={L("ابحث في المهام، الإجراءات، الشركات، الأسماء، المواد…", "Search tasks, procedures, companies, names, courses…")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(Math.min(items.length - 1, idx + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(Math.max(0, idx - 1)); }
          if (e.key === 'Enter' && items[idx]) run(items[idx]);
        }}
      />
      <div ref={listRef} style={{ marginTop: 10 }}>
        {items.map((i, n) => (
          <div key={i.key} className={`palette-item ${n === idx ? 'sel' : ''}`} onClick={() => run(i)} onMouseEnter={() => setIdx(n)}>
            <Icon name={i.icon} size={18} className="faint" />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="ellipsis">{i.title}</div>
              {i.sub && <div className="faint tiny ellipsis">{i.sub}</div>}
            </div>
          </div>
        ))}
        {q && !items.length && <div className="empty small">{L("لا نتائج لـ «", "No results for “")}{q}»</div>}
      </div>
    </Sheet>
  );
}

export function GoalSheet({ id }: { id: string }) {
  const s = useApp();
  const g = s.goals.find((x) => x.id === id);
  const [lines, setLines] = useState('');
  if (!g) return null;
  const tasks = s.tasks.filter((t) => t.goalId === id && t.status !== 'dropped');
  const done = tasks.filter((t) => t.status === 'done').length;
  const addSteps = () => {
    const ls = lines.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const l of ls) A.addTask({ title: l, area: g.area, goalId: id });
    setLines('');
    if (ls.length) toast(L(`أُضيفت ${ls.length} خطوات — ستظهر في خطتك حسب أولويتها`, `Added ${ls.length} steps — they'll enter your plan by priority`));
  };
  return (
    <Sheet
      wide
      title={L("هدف", "Goal")}
      onClose={closeSheet}
      footer={
        <>
          <button className="btn" onClick={() => { A.updateGoal(id, { doneAt: g.doneAt ? undefined : Date.now() }); }}>
            {g.doneAt ? L('إعادة فتح', "Reopen") : L('تحقق الهدف', "Goal achieved")}
          </button>
          <span className="grow" />
          <button className="icon-btn" onClick={() => { A.deleteGoal(id); closeSheet(); toast(L('حُذف الهدف', "Goal deleted"), { undoable: true }); }} aria-label={L("حذف", "Delete")}>
            <Icon name="trash" size={18} />
          </button>
        </>
      }
    >
      <div className="fields">
        <input className="input bare" style={{ fontSize: 21, fontWeight: 650 }} value={g.title} onChange={(e) => A.updateGoal(id, { title: e.target.value })} />
        <div className="fields two">
          <div className="field">
            <label>{L("المجال", "Area")}</label>
            <select className="select" value={g.area} onChange={(e) => A.updateGoal(id, { area: e.target.value as Area })}>
              {(['study', 'work', 'life'] as Area[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{L("الموعد المستهدف", "Target date")}</label>
            <input type="date" className="input" value={g.target || ''} onChange={(e) => A.updateGoal(id, { target: e.target.value || undefined })} />
          </div>
        </div>
        <div className="field">
          <label>{L("لماذا هذا الهدف مهم؟", "Why does this goal matter?")}</label>
          <input className="input" value={g.why} onChange={(e) => A.updateGoal(id, { why: e.target.value })} placeholder={L("يذكرك عندما يقل الحماس", "Reminds you when motivation drops")} />
        </div>
        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="label">{L("الخطوات (", "Steps (")}{done}/{tasks.length})</span>
          </div>
          <Bar value={tasks.length ? done / tasks.length : 0} />
          <div className="list" style={{ marginTop: 10 }}>
            {tasks.map((t) => (
              <div key={t.id} className={`item tap ${t.status === 'done' ? 'done' : ''}`} onClick={() => openSheet({ type: 'task', id: t.id })}>
                <Check on={t.status === 'done'} onClick={() => (t.status === 'done' ? A.reopenTask(t.id) : completeTaskUI(t.id))} />
                <div className="grow title">{t.title}</div>
                {t.due && <span className="chip">{relDay(t.due)}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{L("قسّم الهدف لخطوات صغيرة (خطوة في كل سطر)", "Split the goal into small steps (one per line)")}</label>
          <textarea className="textarea" value={lines} onChange={(e) => setLines(e.target.value)} placeholder={L('مثال:\nأحدد موضوع البحث\nأجمع 5 مراجع\nأكتب المقدمة', "Example:\nPick the research topic\nCollect 5 references\nWrite the introduction")} />
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={addSteps} disabled={!lines.trim()}>
            <Icon name="plus" size={15} />{L(" أضف الخطوات", " Add steps")}</button>
          <div className="faint tiny">{L("نصيحة: اجعل كل خطوة شيئًا تستطيع إنهاءه في جلسة واحدة (أقل من ساعتين).", "Tip: make each step something you can finish in one session (under two hours).")}</div>
        </div>
      </div>
    </Sheet>
  );
}
