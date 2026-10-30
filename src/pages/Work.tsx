import { useMemo, useState } from 'react';
import { Bar, Check, Collapse, Empty, Group, Row, Seg } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { fmtDate, fmtDateTime, relDay, timeAgo, todayKey } from '../lib/dates';
import { kindInfo, lastActivity, nextStep, procProgress, procStage, procSummary } from '../lib/engine/procedures';
import { PRIORITY_LABEL } from '../lib/engine/planner';
import { matches } from '../lib/text';
import { parseSteps } from '../lib/parse';
import type { Priority, Procedure, Step, StepKind } from '../lib/types';
import { openSheet } from '../ui/sheets';
import { go, useRoute } from '../ui/router';
import { toggleStepUI } from '../ui/ops';
import { toast } from '../ui/toast';
import { ReminderField } from '../ui/ReminderField';
import { shareText, StepKindSelect } from '../ui/WorkSheets';
import { PageTop } from '../ui/PageTop';
import { TaskRow } from './Tasks';
import { L } from '../lib/i18n';

export function Work() {
  const r = useRoute();
  if (r.id) return <ProcedureDetail key={r.id} id={r.id} />;
  return <WorkList />;
}

/** quiet → amber → red as a procedure sits untouched */
function staleColor(p: Procedure): React.CSSProperties | undefined {
  if (p.completedAt || p.archived) return undefined;
  const days = (Date.now() - lastActivity(p)) / 86_400_000;
  const waiting = procStage(p) === 'waiting';
  if (days >= (waiting ? 4 : 5)) return { color: 'var(--red)', fontWeight: 600 };
  if (days >= (waiting ? 2 : 2)) return { color: 'var(--amber)' };
  return undefined;
}

function stepDoneLabel(kind?: StepKind) {
  return kind === 'send' ? L('أرسلته', 'Sent it') : kind === 'reply' ? L('وصل الرد', 'Reply received') : L('تم', 'Done');
}

/** one procedure as a calm card: what it is, what's next, how far along — and one button */
function ProcCard({ p }: { p: Procedure }) {
  const next = nextStep(p);
  const lead = p.fields.find((f) => f.value.trim());
  const today = todayKey();
  const late = p.due && !p.completedAt && p.due < today;
  const done = p.steps.filter((x) => x.done).length;
  const open = !p.completedAt && !p.archived;
  return (
    <div className={`proc-card tap ${open && p.priority === 3 ? 'urgent' : open && p.priority === 2 ? 'important' : ''}`} onClick={() => go(`work/${p.id}`)}>
      <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="pc-t">{p.title}</div>
          {lead && <div className="pc-lead">{lead.value}</div>}
        </div>
        {open && p.priority === 3 && <span className="chip red">{L('عاجل', 'Urgent')}</span>}
        {open && p.priority === 2 && <span className="chip amber">{L('مهم', 'Important')}</span>}
        {p.completedAt && <span className="chip green">{L('مكتمل', 'Done')}</span>}
      </div>

      {next ? (
        <div className="pc-next">
          <span className={`pc-ic ${next.kind === 'reply' ? 'wait' : ''}`}><Icon name={kindInfo(next.kind).icon} size={15} /></span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="faint">{next.kind === 'reply' ? L('بانتظار: ', 'Waiting: ') : L('التالي: ', 'Next: ')}</span>
            <b>{next.title}</b>
            {next.target && !next.title.includes(next.target) && <span className="faint"> · {next.target}</span>}
          </span>
        </div>
      ) : (
        !p.completedAt && <div className="pc-next faint">{L('بلا خطوات بعد — افتحه وأضف خطواته', 'No steps yet — open it and add them')}</div>
      )}

      <div className="row between" style={{ gap: 10 }}>
        <div className="pc-meta">
          {p.steps.length > 0 && (
            <span className="pc-bar"><i style={{ width: `${(done / p.steps.length) * 100}%` }} /></span>
          )}
          {p.steps.length > 0 && <span className="num">{done}/{p.steps.length}</span>}
          {p.due && open && <span style={late ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{relDay(p.due)}</span>}
          {open && <span style={staleColor(p)}>{timeAgo(lastActivity(p))}</span>}
          {p.completedAt && <span>{timeAgo(p.completedAt)}</span>}
        </div>
        {next && open && (
          <button className="btn sm primary" onClick={(e) => { e.stopPropagation(); toggleStepUI(p.id, next.id); }} title={L(`تم: ${next.title}`, `Done: ${next.title}`)}>
            <Icon name="check" size={14} /> {stepDoneLabel(next.kind)}
          </button>
        )}
      </div>
    </div>
  );
}

type View = 'open' | 'waiting' | 'people' | 'done' | 'templates';

function Section({ title, count, tone, children }: { title: string; count?: number; tone?: 'red' | 'amber'; children: React.ReactNode }) {
  return (
    <section className="proc-sec">
      <div className={`group-title ${tone ? `tone-${tone}` : ''}`}><span>{title}{count != null ? ` (${count})` : ''}</span></div>
      <div className="proc-list">{children}</div>
    </section>
  );
}

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
  const templates = s.templates.filter((t) => t.for !== 'task').sort((a, b) => b.uses - a.uses);

  // urgent → today, never postponed; important → today or tomorrow; the rest, longest-idle first
  const urgent = active.filter((p) => p.priority === 3);
  const important = active.filter((p) => p.priority === 2);
  const rest = active.filter((p) => p.priority <= 1).sort((a, b) => lastActivity(a) - lastActivity(b));

  return (
    <div>
      <PageTop
        title={L("العمل", "Work")}
        sub={open.length ? L(`${open.length} إجراءات مفتوحة${waiting.length ? ` · ${waiting.length} بانتظار رد` : ''}`, `${open.length} open procedures${waiting.length ? ` · ${waiting.length} awaiting reply` : ''}`) : L('تابع كل إجراء خطوة بخطوة حتى لا تضيع خطوة', "Follow each procedure step by step so nothing gets lost")}
        actions={
          <>
            <button className="btn sm primary" onClick={() => openSheet({ type: 'quick', mode: 'proc' })}><Icon name="plus" size={15} />{L(" إجراء", " Procedure")}</button>
          </>
        }
      />

      <div className="col" style={{ gap: 12, marginBottom: 18 }}>
        <Seg
          value={view === 'templates' ? 'open' : view}
          onChange={setView}
          options={[
            { v: 'open', l: L(`الحالية${active.length ? ` ${active.length}` : ''}`, `Current${active.length ? ` ${active.length}` : ''}`) },
            { v: 'waiting', l: L(`بانتظار رد${waiting.length ? ` ${waiting.length}` : ''}`, `Awaiting reply${waiting.length ? ` ${waiting.length}` : ''}`) },
            { v: 'people', l: L('الجهات', "People") },
            { v: 'done', l: L('المنتهية', "Finished") },
          ]}
        />
        {(q || s.procedures.length > 6) && view !== 'people' && view !== 'templates' && <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("ابحث: شركة، شخص، رقم فاتورة، ملاحظة…", "Search: company, person, invoice no., note…")} />}
      </div>

      {view === 'open' && (
        <div className="stack">
          {urgent.length > 0 && <Section title={L('عاجل — اليوم ولا يتأجل', 'Urgent — today, never postponed')} count={urgent.length} tone="red">{urgent.map((p) => <ProcCard key={p.id} p={p} />)}</Section>}
          {important.length > 0 && <Section title={L('مهم — اليوم أو بكرة', 'Important — today or tomorrow')} count={important.length} tone="amber">{important.map((p) => <ProcCard key={p.id} p={p} />)}</Section>}
          {rest.length > 0 && <Section title={urgent.length || important.length ? L('باقي الإجراءات', 'Other procedures') : L('الإجراءات', 'Procedures')} count={rest.length}>{rest.map((p) => <ProcCard key={p.id} p={p} />)}</Section>}
          {!active.length && (
            <div className="card">
              <Empty icon="work" title={q ? L('لا نتائج', "No results") : L('لا إجراءات قيد العمل', "No procedures in progress")}>
                {!q && L('أضف إجراءً بخطواته (طباعة، حفظ، تصديق، إرسال…) وسيظهر هنا مرتبًا حسب الأولوية.', "Add a procedure with its steps (print, file, certify, send…) and it shows here, ordered by priority.")}
              </Empty>
            </div>
          )}
          {workTasks.length > 0 && !q && (
            <Group title={L(`مهام عمل (${workTasks.length})`, `Work tasks (${workTasks.length})`)}>
              {workTasks.slice(0, 8).map((t) => <TaskRow key={t.id} t={t} />)}
            </Group>
          )}
          {!q && (
            <section>
              <div className="group-title">
                <span>{L('ابدأ من قالب', 'Start from a template')}</span>
                <button onClick={() => setView('templates')}>{L('إدارة القوالب', 'Manage templates')}</button>
              </div>
              <div className="hscroll">
                {templates.map((t) => (
                  <button key={t.id} className="chip btnish" onClick={() => openSheet({ type: 'quick', text: t.name + ' ', mode: 'proc' })}>
                    <Icon name="layers" size={13} /> {t.name}
                  </button>
                ))}
                <button className="chip btnish" onClick={() => openSheet({ type: 'template' })}><Icon name="plus" size={13} /> {L('قالب جديد', 'New template')}</button>
              </div>
            </section>
          )}
        </div>
      )}

      {view === 'waiting' &&
        (waiting.length ? (
          <div className="proc-list">{waiting.map((p) => <ProcCard key={p.id} p={p} />)}</div>
        ) : (
          <div className="card"><Empty icon="hourglass" title={L("لا شيء بانتظار رد", "Nothing awaiting a reply")}>{L("عندما تصل لخطوة «انتظار رد» ينتقل الإجراء هنا، وأذكّرك بالمتابعة إن تأخر.", "When a procedure reaches an “Await reply” step it moves here, and I remind you to follow up if it's late.")}</Empty></div>
        ))}

      {view === 'done' &&
        (finished.length ? (
          <div className="proc-list">{finished.map((p) => <ProcCard key={p.id} p={p} />)}</div>
        ) : (
          <div className="card"><Empty icon="check" title={L("لا إجراءات منتهية بعد", "No finished procedures yet")} /></div>
        ))}

      {view === 'people' && <People procs={open} />}
      {view === 'templates' && (
        <>
          <button className="btn sm ghost" style={{ marginBottom: 10, paddingInline: 4 }} onClick={() => setView('open')}><Icon name="back" size={14} /> {L('رجوع', 'Back')}</button>
          <Templates />
        </>
      )}
    </div>
  );
}

/** everything pending per person / group / place: "what is waiting on نجيب?" */
function People({ procs }: { procs: Procedure[] }) {
  type Item = { p: Procedure; st: Step; actionable: boolean; after?: string };
  const groups = new Map<string, Item[]>();
  for (const p of procs) {
    const nxt = nextStep(p);
    for (const [i, st] of p.steps.entries()) {
      if (st.done) continue;
      const key = (st.target || '').trim();
      if (!key) continue;
      const actionable = st === nxt;
      const before = p.steps.slice(0, i).reverse().find((x) => !x.done);
      (groups.get(key) || groups.set(key, []).get(key)!).push({ p, st, actionable, after: actionable ? undefined : before?.title });
    }
  }
  const list = [...groups.entries()].sort((a, b) => b[1].filter((x) => x.actionable).length - a[1].filter((x) => x.actionable).length || b[1].length - a[1].length);
  const copy = async (name: string, items: Item[]) => {
    const text = `${name}:\n` + items.map((x) => `- ${x.p.title}${x.p.fields.find((f) => f.value.trim()) ? ` (${x.p.fields.find((f) => f.value.trim())!.value})` : ''} — ${x.st.title}`).join('\n');
    const r = await shareText(name, text);
    if (r === 'copied') toast(L('نُسخت القائمة', "List copied"));
  };
  if (!list.length)
    return (
      <div className="card">
        <Empty icon="user" title={L("لا شيء معلّق على جهة بعينها", "Nothing pending on a specific person")}>{L("عندما تكتب اسم شخص أو قروب أو مكان في خطوة (مثل «إرسال» أو «حفظ»)، ستجد هنا كل ما ينتظره في مكان واحد.", "When you write a person, group or place in a step (like “Send” or “File”), you'll find everything waiting on them here in one place.")}</Empty>
      </div>
    );
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>{L("كل خطوة معلّقة مجمّعة حسب الشخص أو المجموعة أو المكان. الخطوات المعتمة تنتظر خطوة قبلها.", "Every pending step grouped by person, group or place. Dimmed steps are waiting on an earlier step.")}</p>
      {list.map(([name, items]) => {
        const ready = items.filter((x) => x.actionable).length;
        return (
          <Group
            key={name}
            title={<span className="row" style={{ gap: 6 }}><Icon name="user" size={14} /> {name} <span className="faint">({ready ? L(`${ready} جاهزة`, `${ready} ready`) : L(`${items.length} قادمة`, `${items.length} upcoming`)})</span></span>}
            action={<button onClick={() => copy(name, items)}>{L("انسخ القائمة", "Copy list")}</button>}
          >
            {items.map(({ p, st, actionable, after }) => (
              <div key={p.id + st.id} className="r tap" style={actionable ? undefined : { opacity: 0.55 }} onClick={() => go(`work/${p.id}`)}>
                <span className="ic"><Icon name={kindInfo(st.kind).icon} size={15} /></span>
                <span className="main-t">
                  <div className="lbl">{st.title}</div>
                  <div className="sub">
                    {p.title}
                    {p.fields.find((f) => f.value.trim()) ? ` · ${p.fields.find((f) => f.value.trim())!.value}` : ''}
                    {after ? L(` · بعد: ${after}`, ` · after: ${after}`) : ''}
                  </div>
                </span>
                {actionable && !p.archived && (
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); toggleStepUI(p.id, st.id); }}>
                    <Icon name="check" size={14} /> {st.kind === 'send' ? L('أرسلته', "Sent it") : st.kind === 'reply' ? L('وصل الرد', "Reply received") : L('تم', "Done")}
                  </button>
                )}
              </div>
            ))}
          </Group>
        );
      })}
    </div>
  );
}

function Templates() {
  const s = useApp();
  const list = s.templates.filter((t) => t.for !== 'task');
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>{L("القالب = إجراء متكرر بخطواته الجاهزة. اكتب اسمه في بداية الإضافة السريعة، مثل «معاملة مؤسسة الأمل».", "A template is a recurring procedure with ready-made steps. Type its name at the start of quick add, e.g. “Transaction Al-Amal Co.”.")}</p>
      <Group action={<button onClick={() => openSheet({ type: 'template' })}>{L("+ قالب جديد", "+ New template")}</button>} title={L(`${list.length} قوالب`, `${list.length} templates`)}>
        {list.map((t) => (
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState('');
  const bulkSteps = useMemo(() => parseSteps(bulk), [bulk]);

  if (!p)
    return (
      <div>
        <PageTop title={L("غير موجود", "Not found")} back={{ label: L('العمل', "Work"), to: 'work' }} />
        <div className="card"><Empty icon="work" title={L("الإجراء غير موجود", "Procedure not found")}>{L("ربما حُذف.", "It may have been deleted.")}</Empty></div>
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
        back={{ label: L('العمل', "Work"), to: 'work' }}
        title={<input className="input bare" style={{ fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', padding: 0 }} value={p.title} onChange={(e) => up({ title: e.target.value })} aria-label={L("العنوان", "Title")} />}
        sub={
          <>
            {stage === 'done' ? L('مكتمل', "Completed") : stage === 'waiting' ? L('بانتظار رد', "Awaiting reply") : stage === 'partial' ? L('منجز جزئيًا', "Partly done") : L('لم يبدأ', "Not started")} · {done}{L(" من ", " of ")}{p.steps.length}{L(" خطوات", " steps")}{p.archived ? L(' · مؤرشف', " · archived") : ''}
          </>
        }
      />

      <div className="two-col">
        <div className="stack" style={{ minWidth: 0 }}>
          <Bar value={procProgress(p)} color={stage === 'done' ? 'var(--green)' : 'var(--work)'} />

          {next && !editing && (
            <div className="next">
              <span className="k">{L("الخطوة التالية · ", "Next step · ")}{kindInfo(next.kind).label}</span>
              <div className="t">{next.title}</div>
              {next.target && !next.title.includes(next.target) && <div className="muted small">{next.target}</div>}
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <button className="btn primary" onClick={() => toggleStepUI(p.id, next.id)}>
                  <Icon name="check" size={16} /> {next.kind === 'send' ? L('أرسلته', "Sent it") : next.kind === 'reply' ? L('وصل الرد', "Reply received") : L('تمت', "Done")}
                </button>
                {next.kind === 'reply' && (
                  <button className="btn" onClick={() => { A.addLog(p.id, L(`تابعت${next.target ? ` مع ${next.target}` : ''} (بانتظار الرد)`, `Followed up${next.target ? ` with ${next.target}` : ''} (awaiting reply)`)); toast(L('سُجلت المتابعة', "Follow-up logged")); }}>{L("سجّل متابعة", "Log follow-up")}</button>
                )}
              </div>
            </div>
          )}

          <Group
            title={L("الخطوات", "Steps")}
            action={<button onClick={() => setEditing(!editing)}>{editing ? L('تم', "Done") : L('تعديل', "Edit")}</button>}
          >
            {p.steps.map((st, i) =>
              editing ? (
                <div key={st.id} className="r" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <StepKindSelect compact value={st.kind} onChange={(k) => A.updateStep(p.id, st.id, { kind: k || 'action' })} />
                  <input className="input grow" style={{ minWidth: 140, height: 36 }} value={st.title} onChange={(e) => A.updateStep(p.id, st.id, { title: e.target.value })} aria-label={L("الخطوة", "Step")} />
                  <input className="input" style={{ width: 140, height: 36 }} value={st.target || ''} onChange={(e) => A.updateStep(p.id, st.id, { target: e.target.value || undefined })} placeholder={st.kind === 'file' ? L('مكان الحفظ', "Where it's filed") : L('الشخص / الجهة', "Person / party")} aria-label={L("الجهة", "Party")} list="masar-targets" />
                  <div className="row" style={{ gap: 2 }}>
                    <button className="icon-btn sm" onClick={() => A.moveStep(p.id, st.id, -1)} disabled={i === 0} aria-label={L("لأعلى", "Move up")}><Icon name="up" size={14} /></button>
                    <button className="icon-btn sm" onClick={() => A.moveStep(p.id, st.id, 1)} disabled={i === p.steps.length - 1} aria-label={L("لأسفل", "Move down")}><Icon name="down" size={14} /></button>
                    <button className="icon-btn sm" onClick={() => { A.removeStep(p.id, st.id); toast(L('حُذفت الخطوة', "Step deleted"), { undoable: true }); }} aria-label={L("حذف", "Delete")}><Icon name="trash" size={14} /></button>
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
                      {st.doneAt && L(` · ${st.kind === 'send' ? 'أكدت الإرسال' : 'تم'} ${fmtDateTime(st.doneAt)}`, ` · ${st.kind === 'send' ? 'Confirmed sent' : 'Done'} ${fmtDateTime(st.doneAt)}`)}
                      {st.note && ` · ${st.note}`}
                    </div>
                  </div>
                </div>
              ),
            )}
            {(editing || !p.steps.length) && (
              <div className="r" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <button className="btn sm ghost" style={{ alignSelf: 'flex-start', paddingInline: 4 }} onClick={() => setBulkOpen(!bulkOpen)}>
                  <Icon name="layers" size={14} /> {bulkOpen ? L('إخفاء', "Hide") : L('اكتب عدة خطوات دفعة واحدة', "Type several steps at once")}
                </button>
                {bulkOpen && (
                  <>
                    <textarea
                      className="textarea"
                      value={bulk}
                      onChange={(e) => setBulk(e.target.value)}
                      placeholder={L('مثال — خطوة في كل سطر أو افصل بفاصلة:\nطباعة الملف\nحفظ في ملف مشتريات\nإرسال إلى نجيب', "Example — one step per line or separated by commas:\nPrint the file\nFile in the purchases folder\nSend to the manager")}
                    />
                    {bulkSteps.length > 0 && (
                      <div className="col" style={{ gap: 4 }}>
                        {bulkSteps.map((x, i) => (
                          <div key={i} className="row small" style={{ gap: 6 }}>
                            <span className="chip amber"><Icon name={kindInfo(x.kind).icon} size={12} /> {kindInfo(x.kind).label}</span>
                            <span className="grow ellipsis">{x.title}</span>
                            {x.target && <span className="faint tiny">{x.target}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <button className="btn sm primary" style={{ alignSelf: 'flex-start' }} disabled={!bulkSteps.length} onClick={() => { A.addSteps(p.id, bulkSteps.map((x) => ({ ...x, kind: x.kind || 'action' }))); setBulk(''); setBulkOpen(false); toast(L(`أُضيفت ${bulkSteps.length} خطوات`, `Added ${bulkSteps.length} steps`), { undoable: true }); }}>
                      <Icon name="plus" size={14} />{L(" أضف ", " Add ")}{bulkSteps.length ? L(`${bulkSteps.length} خطوات`, `${bulkSteps.length} steps`) : ''}
                    </button>
                  </>
                )}
              </div>
            )}
            {(editing || !p.steps.length) && (
              <div className="r" style={{ flexWrap: 'wrap', gap: 8 }}>
                <StepKindSelect compact value={newKind} onChange={(k) => setNewKind(k || 'action')} />
                <input className="input grow" style={{ minWidth: 140, height: 36 }} value={newStep} onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStep()} placeholder={L("خطوة جديدة…", "New step…")} />
                <input className="input" style={{ width: 140, height: 36 }} value={newTarget} onChange={(e) => setNewTarget(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStep()} placeholder={L("الجهة (اختياري)", "Party (optional)")} list="masar-targets" />
                <button className="btn sm" onClick={addStep} disabled={!newStep.trim()}><Icon name="plus" size={15} />{L(" أضف", " Add")}</button>
              </div>
            )}
          </Group>
          <p className="faint tiny" style={{ margin: '-14px 6px 0' }}>{L("خطوات «إرسال» تطلب تأكيدك، لأن الموقع لا يرسل شيئًا بنفسه — السجل يوثّق ما أكدته فقط.", "“Send” steps ask for your confirmation because the site never sends anything itself — the log records only what you confirmed.")}</p>

          <Group title={L("التفاصيل", "Details")} action={<button onClick={() => up({ fields: [...p.fields, { key: L('حقل جديد', "New field"), value: '' }] })}>{L("+ حقل", "+ Field")}</button>}>
            {p.fields.map((f, i) => (
              <div key={i} className="r" style={{ gap: 8 }}>
                <input className="input bare" style={{ width: 110, padding: 0, color: 'var(--muted)', fontSize: 14 }} value={f.key} onChange={(e) => up({ fields: p.fields.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} aria-label={L("اسم الحقل", "Field name")} />
                <input className="input bare grow" style={{ padding: 0 }} value={f.value} placeholder="—" onChange={(e) => up({ fields: p.fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} aria-label={f.key} />
                <button className="icon-btn sm" onClick={() => up({ fields: p.fields.filter((_, j) => j !== i) })} aria-label={L("حذف الحقل", "Delete field")}><Icon name="x" size={13} /></button>
              </div>
            ))}
            <div className="r">
              <textarea className="textarea input bare" style={{ minHeight: 60, padding: 0 }} value={p.notes} onChange={(e) => up({ notes: e.target.value })} placeholder={L("ملاحظات…", "Notes…")} />
            </div>
          </Group>
        </div>

        <div className="stack" style={{ minWidth: 0 }}>
          <Group title={L("المتابعة", "Follow-up")}>
            <div className="r">
              <span className="main-t"><div className="lbl">{L("الموعد", "Due")}</div></span>
              <input type="date" className="input" style={{ width: 'auto', height: 34 }} value={p.due || ''} onChange={(e) => up({ due: e.target.value || undefined })} />
            </div>
            <div className="r" style={{ flexWrap: 'wrap' }}>
              <span className="main-t"><div className="lbl">{L("الأولوية", "Priority")}</div></span>
              <Seg value={p.priority} onChange={(v: Priority) => up({ priority: v })} options={([0, 1, 2, 3] as Priority[]).map((x) => ({ v: x, l: PRIORITY_LABEL[x] }))} />
            </div>
            <div className="r" style={{ minHeight: 0, paddingBlock: 8 }}>
              <span className="tiny" style={{ color: p.priority === 3 ? 'var(--red)' : p.priority === 2 ? 'var(--amber)' : 'var(--faint)' }}>
                {PRIORITY_RULE[p.priority]}
              </span>
            </div>
            <div className="r"><div className="grow"><ReminderField value={p.reminder} onChange={(r) => up({ reminder: r })} title={p.title} /></div></div>
          </Group>

          <section>
            <div className="group-title"><span>{L("السجل", "Log")}</span><span className="faint" style={{ fontWeight: 500 }}>{L("أُنشئ ", "Created ")}{fmtDate(todayKey(p.createdAt), false)}</span></div>
            <div className="card">
              <div className="row" style={{ gap: 6, marginBottom: 12 }}>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { A.addLog(p.id, note.trim()); setNote(''); } }} placeholder={L("أضف ملاحظة للسجل…", "Add a note to the log…")} />
                <button className="btn sm" disabled={!note.trim()} onClick={() => { A.addLog(p.id, note.trim()); setNote(''); }}>{L("إضافة", "Add")}</button>
              </div>
              {p.log.length > 4 ? (
                <>
                  <LogList log={p.log.slice(-4)} />
                  <Collapse title={L("السجل الكامل", "Full log")} count={p.log.length}><LogList log={p.log.slice(0, -4)} /></Collapse>
                </>
              ) : (
                <LogList log={p.log} />
              )}
            </div>
          </section>

          <Group>
            <Row icon="share" label={L("مشاركة / نسخ الملخص", "Share / copy summary")} onClick={async () => { const r = await shareText(p.title, procSummary(p)); if (r === 'copied') toast(L('نُسخ الملخص', "Summary copied")); }} />
            <Row icon="play" label={L("ابدأ مؤقت عمل", "Start work timer")} onClick={() => A.startTimer({ kind: 'procedure', refId: p.id, label: p.title })} />
            <Row icon="layers" label={L("احفظه كقالب", "Save as template")} sub={L("لإعادة استخدام نفس الخطوات", "To reuse the same steps")} onClick={() => openSheet({ type: 'template', fromProc: p.id })} />
            <Row icon="copy" label={L("نسخة جديدة بنفس الخطوات", "New copy with the same steps")} onClick={() => { const nid = A.duplicateProcedure(p.id); go(`work/${nid}`); toast(L('أُنشئت نسخة جديدة', "New copy created")); }} />
            <Row icon="archive" label={p.archived ? L('إخراج من الأرشيف', "Restore from archive") : L('أرشفة', "Archive")} onClick={() => { A.archiveProcedure(p.id, !p.archived); if (!p.archived) { go('work'); toast(L('نُقل للأرشيف', "Moved to archive"), { undoable: true }); } }} />
            <Row icon="trash" danger label={L("حذف الإجراء", "Delete procedure")} onClick={() => { if (confirm(L('حذف الإجراء وسجله نهائيًا؟', "Delete the procedure and its log permanently?"))) { A.deleteProcedure(p.id); go('work'); toast(L('حُذف الإجراء', "Procedure deleted"), { undoable: true }); } }} />
          </Group>
        </div>
      </div>
    </div>
  );
}

const PRIORITY_RULE: Record<Priority, string> = {
  get 3() { return L('عاجل: يدخل قائمة اليوم دائمًا ولا يتأجل أبدًا، وأنبهك به يوميًا حتى ينتهي.', "Urgent: always in today's list, never postponed, and I remind you daily until it's done."); },
  get 2() { return L('مهم: اليوم أو بكرة. من اليوم الثاني لا يتأجل مرة أخرى.', "Important: today or tomorrow. From the second day it can't be postponed again."); },
  get 1() { return L('عادي: يتأجل تلقائيًا إلى الغد عندما يزدحم يومك.', "Normal: postponed to tomorrow automatically when your day is full."); },
  get 0() { return L('منخفض: أول ما يتأجل عند الازدحام.', "Low: the first to be postponed when it's busy."); },
};

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
