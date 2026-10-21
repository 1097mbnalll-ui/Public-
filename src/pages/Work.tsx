import { useMemo, useState } from 'react';
import { Bar, Check, Collapse, Empty, Group, Row, Seg } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { fmtDate, fmtDateTime, relDay, timeAgo, todayKey } from '../lib/dates';
import { STEP_KINDS, kindInfo, lastActivity, nextStep, procProgress, procStage, procSummary } from '../lib/engine/procedures';
import { PRIORITY_LABEL } from '../lib/engine/planner';
import { matches } from '../lib/text';
import type { Priority, Procedure, StepKind } from '../lib/types';
import { openSheet } from '../ui/sheets';
import { go, useRoute } from '../ui/router';
import { toggleStepUI } from '../ui/ops';
import { toast } from '../ui/toast';
import { ReminderField } from '../ui/ReminderField';
import { shareText, StepKindSelect } from '../ui/WorkSheets';
import { PageTop } from '../ui/PageTop';
import { TaskRow } from './Tasks';

export function Work() {
  const r = useRoute();
  if (r.id) return <ProcedureDetail key={r.id} id={r.id} />;
  return <WorkList />;
}

function StepsDots({ p }: { p: Procedure }) {
  const next = nextStep(p);
  return (
    <div className="steps-dots" aria-hidden>
      {p.steps.map((s) => <i key={s.id} className={s.done ? 'on' : s === next ? 'next' : ''} />)}
    </div>
  );
}

function ProcRow({ p }: { p: Procedure }) {
  const next = nextStep(p);
  const lead = p.fields.find((f) => f.value.trim());
  const today = todayKey();
  const late = p.due && !p.completedAt && p.due < today;
  return (
    <div className="r tap" onClick={() => go(`work/${p.id}`)} style={{ alignItems: 'flex-start' }}>
      <div className="main-t">
        <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div className="lbl">{p.title}</div>
          <StepsDots p={p} />
        </div>
        <div className="sub">
          {next ? (
            <span style={{ color: next.kind === 'reply' ? 'var(--violet)' : 'var(--amber)' }}>
              التالي: {next.title}
            </span>
          ) : p.completedAt ? (
            <span style={{ color: 'var(--green)' }}>مكتمل {timeAgo(p.completedAt)}</span>
          ) : (
            'بلا خطوات بعد'
          )}
          {lead && ` · ${lead.value}`}
          {p.due && !p.completedAt && <span style={late ? { color: 'var(--red)' } : undefined}> · {relDay(p.due)}</span>}
          {!p.completedAt && ` · ${timeAgo(lastActivity(p))}`}
        </div>
      </div>
      {next && !p.archived && (
        <button className="btn sm" style={{ alignSelf: 'center' }} onClick={(e) => { e.stopPropagation(); toggleStepUI(p.id, next.id); }} title={`تم: ${next.title}`}>
          <Icon name="check" size={14} /> تم
        </button>
      )}
    </div>
  );
}

type View = 'open' | 'waiting' | 'done' | 'templates';

function WorkList() {
  const s = useApp();
  const [view, setView] = useState<View>('open');
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      s.procedures.filter(
        (p) => !q || matches(`${p.title} ${p.notes} ${p.fields.map((f) => f.value).join(' ')} ${p.steps.map((x) => `${x.title} ${x.target || ''} ${x.note || ''}`).join(' ')} ${p.log.map((l) => l.text).join(' ')}`, q),
      ),
    [s.procedures, q],
  );
  const open = list.filter((p) => !p.archived && !p.completedAt);
  const waiting = open.filter((p) => procStage(p) === 'waiting');
  const active = open.filter((p) => procStage(p) !== 'waiting');
  const finished = list.filter((p) => p.completedAt || p.archived).sort((a, b) => (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt));
  const workTasks = s.tasks.filter((t) => t.status === 'open' && t.area === 'work');

  // what each open procedure is waiting on next — the "where is it stuck?" view
  const byKind = STEP_KINDS.filter((k) => k.kind !== 'reply')
    .map((k) => ({ k, items: active.filter((p) => nextStep(p)?.kind === k.kind) }))
    .filter((g) => g.items.length);
  const noSteps = active.filter((p) => !nextStep(p));

  return (
    <div>
      <PageTop
        title="العمل"
        sub={open.length ? `${open.length} إجراءات مفتوحة${waiting.length ? ` · ${waiting.length} بانتظار رد` : ''}` : 'تابع كل إجراء خطوة بخطوة حتى لا تضيع خطوة'}
        actions={<button className="btn sm primary" onClick={() => openSheet({ type: 'quick', mode: 'proc' })}><Icon name="plus" size={15} /> إجراء</button>}
      />

      <div className="col" style={{ gap: 12, marginBottom: 20 }}>
        <Seg
          value={view}
          onChange={setView}
          options={[
            { v: 'open', l: `قيد العمل${active.length ? ` ${active.length}` : ''}` },
            { v: 'waiting', l: `بانتظار رد${waiting.length ? ` ${waiting.length}` : ''}` },
            { v: 'done', l: 'المنتهية' },
            { v: 'templates', l: 'القوالب' },
          ]}
        />
        {view !== 'templates' && <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث: شركة، شخص، رقم فاتورة، ملاحظة…" />}
      </div>

      {view === 'open' && (
        <div className="stack">
          {s.templates.length > 0 && !q && (
            <div>
              <div className="group-title"><span>ابدأ إجراء متكرر</span></div>
              <div className="hscroll">
                {s.templates.slice().sort((a, b) => b.uses - a.uses).map((t) => (
                  <button key={t.id} className="chip btnish" onClick={() => openSheet({ type: 'quick', text: t.name + ' ' })}>
                    <Icon name="layers" size={13} /> {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {byKind.map(({ k, items }) => (
            <Group key={k.kind} title={<span className="row" style={{ gap: 6 }}><Icon name={k.icon} size={14} /> {k.waiting} ({items.length})</span>}>
              {items.map((p) => <ProcRow key={p.id} p={p} />)}
            </Group>
          ))}
          {noSteps.length > 0 && <Group title="بلا خطوات">{noSteps.map((p) => <ProcRow key={p.id} p={p} />)}</Group>}
          {!byKind.length && !noSteps.length && (
            <div className="card">
              <Empty icon="work" title={q ? 'لا نتائج' : 'لا إجراءات قيد العمل'}>
                {!q && 'أضف إجراءً بخطواته (طباعة، حفظ، تصديق، إرسال…) وسيظهر هنا مجمّعًا حسب ما ينتظره.'}
              </Empty>
            </div>
          )}
          {workTasks.length > 0 && !q && (
            <Group title={`مهام عمل بلا خطوات (${workTasks.length})`}>
              {workTasks.slice(0, 8).map((t) => <TaskRow key={t.id} t={t} />)}
            </Group>
          )}
        </div>
      )}

      {view === 'waiting' &&
        (waiting.length ? (
          <Group>{waiting.map((p) => <ProcRow key={p.id} p={p} />)}</Group>
        ) : (
          <div className="card"><Empty icon="hourglass" title="لا شيء بانتظار رد">عندما تصل لخطوة «انتظار رد» ينتقل الإجراء هنا، وأذكّرك بالمتابعة إن تأخر.</Empty></div>
        ))}

      {view === 'done' &&
        (finished.length ? (
          <Group>{finished.map((p) => <ProcRow key={p.id} p={p} />)}</Group>
        ) : (
          <div className="card"><Empty icon="check" title="لا إجراءات منتهية بعد" /></div>
        ))}

      {view === 'templates' && <Templates />}
    </div>
  );
}

function Templates() {
  const s = useApp();
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>القالب = إجراء متكرر بخطواته الجاهزة. اكتب اسمه في بداية الإضافة السريعة، مثل «معاملة مؤسسة الأمل».</p>
      <Group action={<button onClick={() => openSheet({ type: 'template' })}>+ قالب جديد</button>} title={`${s.templates.length} قوالب`}>
        {s.templates.map((t) => (
          <Row
            key={t.id}
            icon="layers"
            label={t.name}
            sub={t.steps.map((x) => x.title).join(' ← ')}
            value={t.uses ? `${t.uses}×` : undefined}
            chevron
            onClick={() => openSheet({ type: 'template', id: t.id })}
          />
        ))}
      </Group>
    </div>
  );
}

function ProcedureDetail({ id }: { id: string }) {
  const s = useApp();
  const p = s.procedures.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [newStep, setNewStep] = useState('');
  const [newKind, setNewKind] = useState<StepKind>('action');
  const [newTarget, setNewTarget] = useState('');
  const [note, setNote] = useState('');

  if (!p)
    return (
      <div>
        <PageTop title="غير موجود" back={{ label: 'العمل', to: 'work' }} />
        <div className="card"><Empty icon="work" title="الإجراء غير موجود">ربما حُذف.</Empty></div>
      </div>
    );

  const up = (patch: Partial<Procedure>) => A.updateProcedure(p.id, patch);
  const addStep = () => {
    if (!newStep.trim()) return;
    A.addStep(p.id, { title: newStep.trim(), kind: newKind, target: newTarget.trim() || undefined });
    setNewStep('');
    setNewTarget('');
  };
  const stage = procStage(p);
  const next = nextStep(p);
  const done = p.steps.filter((x) => x.done).length;

  return (
    <div>
      <PageTop
        back={{ label: 'العمل', to: 'work' }}
        title={<input className="input bare" style={{ fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', padding: 0 }} value={p.title} onChange={(e) => up({ title: e.target.value })} aria-label="العنوان" />}
        sub={
          <>
            {stage === 'done' ? 'مكتمل' : stage === 'waiting' ? 'بانتظار رد' : stage === 'partial' ? 'منجز جزئيًا' : 'لم يبدأ'} · {done} من {p.steps.length} خطوات
            {p.archived ? ' · مؤرشف' : ''}
          </>
        }
      />

      <div className="two-col">
        <div className="stack" style={{ minWidth: 0 }}>
          <Bar value={procProgress(p)} color={stage === 'done' ? 'var(--green)' : 'var(--work)'} />

          {next && !editing && (
            <div className="next">
              <span className="k">الخطوة التالية · {kindInfo(next.kind).label}</span>
              <div className="t">{next.title}</div>
              {next.target && !next.title.includes(next.target) && <div className="muted small">{next.target}</div>}
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <button className="btn primary" onClick={() => toggleStepUI(p.id, next.id)}>
                  <Icon name="check" size={16} /> {next.kind === 'send' ? 'أرسلته' : next.kind === 'reply' ? 'وصل الرد' : 'تمت'}
                </button>
                {next.kind === 'reply' && (
                  <button className="btn" onClick={() => { A.addLog(p.id, `تابعت${next.target ? ` مع ${next.target}` : ''} (بانتظار الرد)`); toast('سُجلت المتابعة'); }}>سجّل متابعة</button>
                )}
              </div>
            </div>
          )}

          <Group
            title="الخطوات"
            action={<button onClick={() => setEditing(!editing)}>{editing ? 'تم' : 'تعديل'}</button>}
          >
            {p.steps.map((st, i) =>
              editing ? (
                <div key={st.id} className="r" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <StepKindSelect compact value={st.kind} onChange={(k) => A.updateStep(p.id, st.id, { kind: k })} />
                  <input className="input grow" style={{ minWidth: 140, height: 36 }} value={st.title} onChange={(e) => A.updateStep(p.id, st.id, { title: e.target.value })} aria-label="الخطوة" />
                  <input className="input" style={{ width: 140, height: 36 }} value={st.target || ''} onChange={(e) => A.updateStep(p.id, st.id, { target: e.target.value || undefined })} placeholder={st.kind === 'file' ? 'مكان الحفظ' : 'الشخص / الجهة'} aria-label="الجهة" />
                  <div className="row" style={{ gap: 2 }}>
                    <button className="icon-btn sm" onClick={() => A.moveStep(p.id, st.id, -1)} disabled={i === 0} aria-label="لأعلى"><Icon name="up" size={14} /></button>
                    <button className="icon-btn sm" onClick={() => A.moveStep(p.id, st.id, 1)} disabled={i === p.steps.length - 1} aria-label="لأسفل"><Icon name="down" size={14} /></button>
                    <button className="icon-btn sm" onClick={() => { A.removeStep(p.id, st.id); toast('حُذفت الخطوة', { undoable: true }); }} aria-label="حذف"><Icon name="trash" size={14} /></button>
                  </div>
                </div>
              ) : (
                <div key={st.id} className={`r ${st.done ? 'done' : ''}`}>
                  <Check on={st.done} onClick={() => toggleStepUI(p.id, st.id)} />
                  <div className="main-t">
                    <div className="lbl">{st.title}</div>
                    <div className="sub">
                      <Icon name={kindInfo(st.kind).icon} size={11} /> {kindInfo(st.kind).label}
                      {st.target && !st.title.includes(st.target) ? ` · ${st.target}` : ''}
                      {st.doneAt && ` · ${st.kind === 'send' ? 'أكدت الإرسال' : 'تم'} ${fmtDateTime(st.doneAt)}`}
                      {st.note && ` · ${st.note}`}
                    </div>
                  </div>
                </div>
              ),
            )}
            {(editing || !p.steps.length) && (
              <div className="r" style={{ flexWrap: 'wrap', gap: 8 }}>
                <StepKindSelect compact value={newKind} onChange={setNewKind} />
                <input className="input grow" style={{ minWidth: 140, height: 36 }} value={newStep} onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStep()} placeholder="خطوة جديدة…" />
                <input className="input" style={{ width: 140, height: 36 }} value={newTarget} onChange={(e) => setNewTarget(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStep()} placeholder="الجهة (اختياري)" />
                <button className="btn sm" onClick={addStep} disabled={!newStep.trim()}><Icon name="plus" size={15} /> أضف</button>
              </div>
            )}
          </Group>
          <p className="faint tiny" style={{ margin: '-14px 6px 0' }}>خطوات «إرسال» تطلب تأكيدك، لأن الموقع لا يرسل شيئًا بنفسه — السجل يوثّق ما أكدته فقط.</p>

          <Group title="التفاصيل" action={<button onClick={() => up({ fields: [...p.fields, { key: 'حقل جديد', value: '' }] })}>+ حقل</button>}>
            {p.fields.map((f, i) => (
              <div key={i} className="r" style={{ gap: 8 }}>
                <input className="input bare" style={{ width: 110, padding: 0, color: 'var(--muted)', fontSize: 14 }} value={f.key} onChange={(e) => up({ fields: p.fields.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} aria-label="اسم الحقل" />
                <input className="input bare grow" style={{ padding: 0 }} value={f.value} placeholder="—" onChange={(e) => up({ fields: p.fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} aria-label={f.key} />
                <button className="icon-btn sm" onClick={() => up({ fields: p.fields.filter((_, j) => j !== i) })} aria-label="حذف الحقل"><Icon name="x" size={13} /></button>
              </div>
            ))}
            <div className="r">
              <textarea className="textarea input bare" style={{ minHeight: 60, padding: 0 }} value={p.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="ملاحظات…" />
            </div>
          </Group>
        </div>

        <div className="stack" style={{ minWidth: 0 }}>
          <Group title="المتابعة">
            <div className="r">
              <span className="main-t"><div className="lbl">الموعد</div></span>
              <input type="date" className="input" style={{ width: 'auto', height: 34 }} value={p.due || ''} onChange={(e) => up({ due: e.target.value || undefined })} />
            </div>
            <div className="r" style={{ flexWrap: 'wrap' }}>
              <span className="main-t"><div className="lbl">الأولوية</div></span>
              <Seg value={p.priority} onChange={(v: Priority) => up({ priority: v })} options={([0, 1, 2, 3] as Priority[]).map((x) => ({ v: x, l: PRIORITY_LABEL[x] }))} />
            </div>
            <div className="r"><div className="grow"><ReminderField value={p.reminder} onChange={(r) => up({ reminder: r })} title={p.title} /></div></div>
          </Group>

          <section>
            <div className="group-title"><span>السجل</span><span className="faint" style={{ fontWeight: 500 }}>أُنشئ {fmtDate(todayKey(p.createdAt), false)}</span></div>
            <div className="card">
              <div className="row" style={{ gap: 6, marginBottom: 12 }}>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { A.addLog(p.id, note.trim()); setNote(''); } }} placeholder="أضف ملاحظة للسجل…" />
                <button className="btn sm" disabled={!note.trim()} onClick={() => { A.addLog(p.id, note.trim()); setNote(''); }}>إضافة</button>
              </div>
              {p.log.length > 4 ? (
                <>
                  <LogList log={p.log.slice(-4)} />
                  <Collapse title="السجل الكامل" count={p.log.length}><LogList log={p.log.slice(0, -4)} /></Collapse>
                </>
              ) : (
                <LogList log={p.log} />
              )}
            </div>
          </section>

          <Group>
            <Row icon="share" label="مشاركة / نسخ الملخص" onClick={async () => { const r = await shareText(p.title, procSummary(p)); if (r === 'copied') toast('نُسخ الملخص'); }} />
            <Row icon="play" label="ابدأ مؤقت عمل" onClick={() => A.startTimer({ kind: 'procedure', refId: p.id, label: p.title })} />
            <Row icon="layers" label="احفظه كقالب" sub="لإعادة استخدام نفس الخطوات" onClick={() => openSheet({ type: 'template', fromProc: p.id })} />
            <Row icon="copy" label="نسخة جديدة بنفس الخطوات" onClick={() => { const nid = A.duplicateProcedure(p.id); go(`work/${nid}`); toast('أُنشئت نسخة جديدة'); }} />
            <Row icon="archive" label={p.archived ? 'إخراج من الأرشيف' : 'أرشفة'} onClick={() => { A.archiveProcedure(p.id, !p.archived); if (!p.archived) { go('work'); toast('نُقل للأرشيف', { undoable: true }); } }} />
            <Row icon="trash" danger label="حذف الإجراء" onClick={() => { if (confirm('حذف الإجراء وسجله نهائيًا؟')) { A.deleteProcedure(p.id); go('work'); toast('حُذف الإجراء', { undoable: true }); } }} />
          </Group>
        </div>
      </div>
    </div>
  );
}

function LogList({ log }: { log: Procedure['log'] }) {
  return (
    <div className="timeline">
      {[...log].reverse().map((l, i) => (
        <div key={i} className="ev">
          <div>{l.text}</div>
          <div className="faint tiny">{fmtDateTime(l.at)}</div>
        </div>
      ))}
    </div>
  );
}
