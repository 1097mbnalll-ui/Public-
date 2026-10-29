import { useState } from 'react';
import { Seg, Sheet, Switch, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { PageTop } from '../ui/PageTop';
import { closeSheet, openSheet } from '../ui/sheets';
import { toast } from '../ui/toast';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { fmtMinutes, todayKey } from '../lib/dates';
import { cvText, eta, FIELDS, itemDone, nextStep, progress, SECTIONS, secName, stepsDone, suggestions, toItem, today, week } from '../lib/engine/cv';
import type { AppState, CvItem, CvPlan, CvSection } from '../lib/types';
import { L, lang } from '../lib/i18n';
import { uid } from '../lib/text';

// «مستقبلي» = the CV you want on a target day (graduation, or any date). Done items show full,
// missing ones dashed. Each item is a few small steps; on the days you pick, the next one shows up
// in «اليوم». Built for any field — common items everyone needs, plus a few for yours.

const WD = () => L('ح ن ث ر خ ج س', 'S M T W T F S').split(' ');
const WD_LONG = () => L('الأحد الإثنين الثلاثاء الأربعاء الخميس الجمعة السبت', 'Sunday Monday Tuesday Wednesday Thursday Friday Saturday').split(' ');
/** «يونيو 2029» */
const monthYear = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(lang() === 'en' ? 'en' : 'ar-SA-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric' });
const fieldName = (cv: CvPlan) => {
  const f = FIELDS.find((x) => x.v === cv.field);
  const b = f?.branches?.find((x) => x.v === cv.branch);
  return [f ? L(...f.t) : '', b && b.v !== 'undecided' ? L(...b.t) : ''].filter(Boolean).join(' · ');
};

export function Future() {
  const s = useApp();
  const cv = s.future.cv;
  return (
    <div>
      <PageTop
        title={L('مستقبلي', 'My future')}
        sub={cv ? L(`سيرتك ${cv.kind === 'student' ? 'يوم التخرج' : 'المستهدفة'} · ${monthYear(cv.target)}`, `Your CV ${cv.kind === 'student' ? 'on graduation day' : 'target'} · ${monthYear(cv.target)}`) : L('ابنِ السيرة اللي تبيها، خطوة صغيرة بكل مرة.', 'Build the CV you want, one small step at a time.')}
        actions={cv ? <button className="icon-btn" onClick={() => openSheet({ type: 'fu-setup' })} aria-label={L('الإعدادات', 'Settings')}><Icon name="settings" /></button> : undefined}
      />
      {cv ? <CvPage /> : <Welcome />}
    </div>
  );
}

function Welcome() {
  return (
    <section className="cv-welcome">
      <div className="cv-paper ghost" aria-hidden>
        <b>{L('اسمك', 'Your name')}</b>
        <i /><i className="s" />
        {[0, 1, 2].map((k) => <div key={k}><em /><i /><i className="s" /></div>)}
      </div>
      <h2>{L('وش تبي تكون مكتوب في سيرتك يوم تتخرج؟', 'What do you want on your CV the day you graduate?')}</h2>
      <ul>
        <li><b>{L('سيرة جاهزة لمجالك', 'A ready CV for your field')}</b><span>{L('اللغة، الأدوات، الخبرة، المشاريع… تعدّلها مثل ما تبي.', 'Language, tools, experience, projects… edit it as you like.')}</span></li>
        <li><b>{L('كل بند خطوات صغيرة', 'Each item, small steps')}</b><span>{L('٢٠–٤٥ دقيقة للخطوة، مو مشاريع ضخمة.', '20–45 minutes a step, not huge projects.')}</span></li>
        <li><b>{L('تظهر لك في «اليوم»', 'They show up in «Today»')}</b><span>{L('بالأيام اللي تختارها، مع تذكير لو تبي.', 'On the days you choose, with a reminder if you like.')}</span></li>
      </ul>
      <button className="btn primary cv-go" onClick={() => openSheet({ type: 'fu-setup' })}><Icon name="target" size={16} /> {L('ابدأ سيرتي', 'Start my CV')}</button>
      <p className="faint small">{L('يشتغل على جهازك وبدون نت.', 'Works on your device, offline.')}</p>
    </section>
  );
}

// ---------------- the page ----------------

function CvPage() {
  const s = useApp();
  const now = useNow(60_000);
  const cv = s.future.cv!;
  const items = s.future.cvItems || [];
  const pr = progress(items);
  const t = today(s, now)!;
  const wk = week(s, now);
  const e = eta(s, now);
  const nx = nextStep(items);
  const nextDay = (() => {
    const d = new Date(now).getDay();
    for (let i = 1; i <= 7; i++) if (cv.days.includes((d + i) % 7)) return WD_LONG()[(d + i) % 7];
    return '';
  })();
  const old = s.future.skills.length + s.future.projects.length + s.future.wins.length;

  return (
    <div className="cv">
      <section className="cv-top">
        <div className="cv-ring" style={{ ['--p' as string]: pr.pct }} role="img" aria-label={L(`${pr.done} من ${pr.total} جاهزة`, `${pr.done} of ${pr.total} ready`)}>
          <b className="num">{pr.done}<small>/{pr.total}</small></b>
        </div>
        <div className="m">
          <b>{pr.done ? L(`${pr.done} من ${pr.total} بنود جاهزة`, `${pr.done} of ${pr.total} items ready`) : L(`سيرتك فيها ${pr.total} بند`, `${pr.total} items on your CV`)}</b>
          <span>{L(`هالأسبوع: ${wk.done} من ${wk.planned} خطوات`, `This week: ${wk.done} of ${wk.planned} steps`)}</span>
          {e.left > 0 && <span className={e.onTime ? 'ok' : 'late'}>{e.onTime ? L(`بوتيرتك تخلص كلها تقريبًا ${monthYear(e.day)}`, `At your pace, all done around ${monthYear(e.day)}`) : L(`بوتيرتك تخلص ${monthYear(e.day)} — بعد هدفك. زد يوم بالأسبوع أو شيل بند.`, `At your pace you finish ${monthYear(e.day)} — after your goal. Add a day a week or drop an item.`)}</span>}
        </div>
      </section>

      {nx ? (
        <section className="cv-next">
          <span className="k">{t.doneToday.length ? L('سويت خطوة اليوم ✓ — الجاية', 'Today’s step done ✓ — next') : t.isDay && !t.skipped ? L('خطوتك اليوم', 'Your step today') : L(`خطوتك الجاية${nextDay ? ` · ${nextDay}` : ''}`, `Your next step${nextDay ? ` · ${nextDay}` : ''}`)}</span>
          <h3>{nx.step.title}</h3>
          <button className="cv-next-of" onClick={() => openSheet({ type: 'fu-item', id: nx.item.id })}>{nx.item.title} · {L(`خطوة ${stepsDone(nx.item) + 1} من ${nx.item.steps.length}`, `step ${stepsDone(nx.item) + 1} of ${nx.item.steps.length}`)} · {fmtMinutes(nx.step.min)}</button>
          <div className="a">
            <button className="btn primary" onClick={() => { A.toggleCvStep(nx.item.id, nx.step.id); toast(L('✓ خطوة أقرب لسيرتك', '✓ One step closer'), { undoable: true }); }}><Icon name="check" size={15} /> {L('خلصتها', 'Done')}</button>
            {t.show && <button className="btn ghost" onClick={() => A.skipCvToday()}>{L('مو اليوم', 'Not today')}</button>}
          </div>
        </section>
      ) : items.length ? (
        <section className="cv-next done"><span className="k">{L('خلّصت كل البنود 🎉', 'Every item done 🎉')}</span><h3>{L('أضف بند جديد أو انسخ سيرتك.', 'Add a new item or copy your CV.')}</h3></section>
      ) : null}

      <article className="cv-paper" aria-label={L('سيرتك', 'Your CV')}>
        <header>
          <b>{s.settings.name || L('اسمك', 'Your name')}</b>
          <span>{fieldName(cv)}{cv.kind === 'student' ? L(` · تخرج ${monthYear(cv.target)}`, ` · graduating ${monthYear(cv.target)}`) : ''}</span>
        </header>
        {SECTIONS.map((sec) => {
          const list = items.filter((x) => x.sec === sec.v);
          if (!list.length) return null;
          return (
            <section key={sec.v}>
              <h4>{L(...sec.t)}</h4>
              {list.map((x) => {
                const done = itemDone(x);
                const n = stepsDone(x);
                return (
                  <button key={x.id} className={`cv-item ${done ? 'done' : n ? 'doing' : 'todo'}`} onClick={() => openSheet({ type: 'fu-item', id: x.id })}>
                    <span className="m">
                      <b>{x.title}</b>
                      {x.target && <span>{x.target}</span>}
                      {done && x.evidence && <span className="ev"><Icon name="link" size={12} /> {x.evidence}</span>}
                    </span>
                    <span className="st">{done ? <Icon name="check" size={16} /> : n ? <em className="num">{n}/{x.steps.length}</em> : <em>{L('لسا', 'not yet')}</em>}</span>
                  </button>
                );
              })}
            </section>
          );
        })}
        <footer>
          <button className="btn sm" onClick={() => openSheet({ type: 'fu-add' })}><Icon name="plus" size={14} /> {L('أضف بند', 'Add item')}</button>
          {pr.done > 0 && <button className="btn sm ghost" onClick={() => copyCv(s)}><Icon name="copy" size={14} /> {L('انسخ الجاهز', 'Copy what’s ready')}</button>}
        </footer>
      </article>

      {old > 0 && (
        <section className="notice">
          <Icon name="info" size={18} />
          <div>
            {L(`عندك ${old === 1 ? 'عنصر واحد' : `${old} عناصر`} من النسخة القديمة لـ«مستقبلي» (مهارات ومشاريع وإنجازات). تقدر تنقلها لسيرتك.`, `You have ${old} things from the old «Future» (skills, projects, wins). Move them into your CV.`)}
            <div style={{ marginTop: 8 }}><button className="btn sm" onClick={() => moveOld(s)}>{L('انقلها لسيرتي', 'Move them in')}</button></div>
          </div>
        </section>
      )}
    </div>
  );
}

async function copyCv(s: AppState) {
  try {
    await navigator.clipboard.writeText(cvText(s));
    toast(L('نُسخت البنود الجاهزة — الصقها في سيرتك', 'Copied the ready items — paste them into your CV'));
  } catch {
    toast(L('ما قدرت أنسخ', 'Couldn’t copy'));
  }
}

/** the old «مستقبلي» (skills, projects, wins) as CV items, so nothing is lost */
function moveOld(s: AppState) {
  const t = Date.now();
  const f = s.future;
  const items: CvItem[] = [
    ...f.skills.map((k): CvItem => ({ id: uid(), sec: k.cat === 'lang' ? 'lang' : 'tools', title: k.name, ...(k.evidence ? { evidence: k.evidence, doneAt: k.step === 'proven' ? t : undefined } : {}), steps: [{ id: uid(), title: L('حدد أول خطوة', 'Set a first step'), min: 20 }], createdAt: t })),
    ...f.projects.map((p): CvItem => ({ id: uid(), sec: 'proj', title: p.title, ...(p.goal ? { target: p.goal } : {}), ...(p.links[0] ? { evidence: p.links[0] } : {}), ...(p.status === 'done' ? { doneAt: t } : {}), steps: p.steps.map((x) => ({ id: uid(), title: x.title, min: 30, ...(x.done ? { doneAt: t } : {}) })), createdAt: t })),
    ...f.wins.map((w): CvItem => ({ id: uid(), sec: w.kind === 'cert' ? 'cert' : w.kind === 'experience' || w.kind === 'work' ? 'exp' : w.kind === 'project' ? 'proj' : 'activity', title: w.title, ...(w.evidence ? { evidence: w.evidence } : {}), steps: [], doneAt: t, createdAt: t })),
  ];
  A.addCvItems(items);
  A.clearOldFuture();
  toast(L(`انتقلت ${items.length} عناصر لسيرتك`, `Moved ${items.length} things into your CV`), { undoable: true });
}

// ---------------- setup ----------------

export function FutureSetupSheet() {
  const s = useApp();
  const was = s.future.cv;
  const y = new Date().getFullYear();
  const [field, setField] = useState(was?.field || '');
  const [branch, setBranch] = useState(was?.branch || '');
  const [kind, setKind] = useState<'student' | 'other'>(was?.kind || 'student');
  const [target, setTarget] = useState(was?.target || `${y + 3}-06-30`);
  const [days, setDays] = useState<number[]>(was?.days || [0, 2, 4]);
  const minutes = was?.minutes || 30;
  const rem = was?.remindId ? s.reminds.find((r) => r.id === was.remindId) : undefined;
  const [remindOn, setRemindOn] = useState(!!rem || !was);
  const [remindAt, setRemindAt] = useState(rem ? `${String(new Date(rem.at).getHours()).padStart(2, '0')}:${String(new Date(rem.at).getMinutes()).padStart(2, '0')}` : '21:00');
  const f = FIELDS.find((x) => x.v === field);
  const ok = !!field && (!f?.branches || !!branch) && days.length > 0 && target > todayKey();
  const save = () => {
    A.saveCvPlan({ field, ...(branch ? { branch } : {}), kind, target, days, minutes, ...(was?.skipped ? { skipped: was.skipped } : {}), ...(was?.remindId ? { remindId: was.remindId } : {}) }, { starter: !was, remindAt: remindOn ? remindAt : '' });
    closeSheet();
    toast(was ? L('حُفظ', 'Saved') : L('جهزت سيرتك — احذف أو أضف اللي تبي', 'Your CV is ready — remove or add what you like'));
  };
  return (
    <Sheet title={was ? L('إعدادات سيرتي', 'My CV settings') : L('ابدأ سيرتي', 'Start my CV')} onClose={closeSheet} footer={<button className="btn primary grow" disabled={!ok} onClick={save}>{was ? L('احفظ', 'Save') : L('جهّز سيرتي', 'Build my CV')}</button>}>
      <div className="cv-form">
        <div className="field">
          <label>{L('وش مجالك؟', 'Your field?')}</label>
          <div className="cv-chips">{FIELDS.map((x) => <button key={x.v} className={`chip btnish ${field === x.v ? 'on' : ''}`} onClick={() => { setField(x.v); setBranch(''); }}>{L(...x.t)}</button>)}</div>
          {f?.branches && <div className="cv-chips sub">{f.branches.map((x) => <button key={x.v} className={`chip btnish ${branch === x.v ? 'on' : ''}`} onClick={() => setBranch(x.v)}>{L(...x.t)}</button>)}</div>}
          {was && field !== was.field && <small className="faint">{L('تغيير المجال ما يمسح بنودك — تلقى بنود المجال الجديد في «أضف بند».', 'Changing field keeps your items — the new field’s items are under “Add item”.')}</small>}
        </div>
        <div className="field">
          <label>{L('متى تبيها جاهزة؟', 'Ready by when?')}</label>
          <Seg value={kind} onChange={setKind} options={[{ v: 'student', l: L('يوم تخرجي', 'My graduation') }, { v: 'other', l: L('تاريخ ثاني', 'Another date') }]} />
          {kind === 'student' ? (
            <div className="cv-chips">{[0, 1, 2, 3, 4, 5].map((i) => { const d = `${y + i}-06-30`; return <button key={i} className={`chip btnish ${target === d ? 'on' : ''}`} onClick={() => setTarget(d)}>{y + i}</button>; })}</div>
          ) : (
            <input type="date" className="input" min={todayKey()} value={target} onChange={(e) => e.target.value && setTarget(e.target.value)} />
          )}
        </div>
        <div className="field">
          <label>{L('أي أيام تعطيها؟', 'Which days?')}</label>
          <div className="rm-days">{WD().map((d, i) => { const on = days.includes(i); return <button key={i} className={on ? 'on' : ''} aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i].sort())}>{d}</button>; })}</div>
          <small className="faint">{L(`يعني ${days.length === 1 ? 'خطوة وحدة' : days.length === 2 ? 'خطوتين' : `${days.length} خطوات`} بالأسبوع — كل خطوة ٢٠–٤٥ د.`, `${days.length} step${days.length === 1 ? '' : 's'} a week — each 20–45 min.`)}</small>
        </div>
        <div className="row between">
          <span>{L('ذكّرني بأيامها الساعة', 'Remind me on those days at')}</span>
          <span className="row" style={{ gap: 8 }}>
            {remindOn && <input type="time" className="input" style={{ width: 140, height: 34 }} value={remindAt} onChange={(e) => e.target.value && setRemindAt(e.target.value)} aria-label={L('وقت التذكير', 'Reminder time')} />}
            <Switch on={remindOn} onChange={setRemindOn} label={L('تذكير', 'Reminder')} />
          </span>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------- one item ----------------

export function FutureItemSheet({ id }: { id: string }) {
  const s = useApp();
  const x = (s.future.cvItems || []).find((y) => y.id === id);
  const [title, setTitle] = useState(x?.title || '');
  const [target, setTarget] = useState(x?.target || '');
  const [evidence, setEvidence] = useState(x?.evidence || '');
  const [sec, setSec] = useState<CvSection>(x?.sec || 'tools');
  const [newStep, setNewStep] = useState('');
  if (!x) return null;
  const done = itemDone(x);
  const first = (s.future.cvItems || [])[0]?.id === x.id;
  const keep = (patch: Partial<CvItem> = {}) => A.saveCvItem({ ...x, title: title.trim() || x.title, sec, ...(target.trim() ? { target: target.trim() } : { target: undefined }), ...(evidence.trim() ? { evidence: evidence.trim() } : { evidence: undefined }), ...patch });
  return (
    <Sheet title={secName(x.sec)} onClose={() => { keep(); closeSheet(); }} footer={
      <>
        <button className="btn primary grow" onClick={() => { keep(); closeSheet(); }}>{L('تم', 'Done')}</button>
        <button className="btn ghost" aria-label={L('احذف', 'Delete')} onClick={() => { A.deleteCvItem(x.id); closeSheet(); toast(L('انحذف من سيرتك', 'Removed from your CV'), { undoable: true }); }}><Icon name="trash" size={15} /></button>
      </>
    }>
      <div className="cv-form">
        <input className="input big" value={title} onChange={(e) => setTitle(e.target.value)} aria-label={L('البند', 'Item')} />
        {x.why && <p className="cv-why">{x.why}</p>}
        <div className="field">
          <label htmlFor="cv-target">{L('متى تعتبره جاهز؟', 'When does it count as done?')}</label>
          <input id="cv-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={L('مثلًا: IELTS 6.5', 'e.g. IELTS 6.5')} />
        </div>
        <div className="field">
          <label>{L('الخطوات', 'Steps')} <small className="faint">{stepsDone(x)}/{x.steps.length}</small></label>
          <ul className="cv-steps">
            {x.steps.map((st) => (
              <li key={st.id} className={st.doneAt ? 'done' : ''}>
                <button className="tick" aria-pressed={!!st.doneAt} aria-label={st.title} onClick={() => A.toggleCvStep(x.id, st.id)}>{st.doneAt ? <Icon name="check" size={14} /> : null}</button>
                <span className="t">{st.title}</span>
                <span className="min num">{st.min} {L('د', 'm')}</span>
                <button className="icon-btn sm" aria-label={L('احذف الخطوة', 'Delete step')} onClick={() => A.saveCvItem({ ...x, steps: x.steps.filter((y) => y.id !== st.id) })}><Icon name="x" size={13} /></button>
              </li>
            ))}
          </ul>
          <div className="row" style={{ gap: 6 }}>
            <input className="input" value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder={L('خطوة جديدة (٢٠–٤٥ د)', 'New step (20–45 min)')} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && newStep.trim()) { A.saveCvItem({ ...x, steps: [...x.steps, { id: uid(), title: newStep.trim(), min: 30 }] }); setNewStep(''); } }} />
            <button className="btn" disabled={!newStep.trim()} onClick={() => { A.saveCvItem({ ...x, steps: [...x.steps, { id: uid(), title: newStep.trim(), min: 30 }] }); setNewStep(''); }}>{L('أضف', 'Add')}</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="cv-ev">{L('الدليل', 'Evidence')}</label>
          <input id="cv-ev" className="input" dir="auto" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder={L('رابط، رقم شهادة، اسم الجهة…', 'A link, certificate number, the organisation…')} />
          {done && !evidence.trim() && <small className="faint">{L('أضف دليل يقدر غيرك يتأكد منه — يقوّي البند في سيرتك.', 'Add evidence others can check — it makes the item count.')}</small>}
        </div>
        <div className="field">
          <label>{L('القسم', 'Section')}</label>
          <div className="cv-chips">{SECTIONS.map((y) => <button key={y.v} className={`chip btnish ${sec === y.v ? 'on' : ''}`} onClick={() => setSec(y.v)}>{L(...y.t)}</button>)}</div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {!done && !first && <button className="btn sm" onClick={() => { A.focusCvItem(x.id); toast(L('صار أول شي — خطواته تجيك الحين', 'Moved first — its steps come next')); }}>{L('اشتغل عليه الحين', 'Work on this next')}</button>}
          {!done && <button className="btn sm ghost" onClick={() => { keep({ doneAt: Date.now() }); toast(L('علّمته جاهز ✓', 'Marked ready ✓')); }}>{L('عندي هذا من قبل', 'I already have this')}</button>}
          {done && x.doneAt && <button className="btn sm ghost" onClick={() => keep({ doneAt: undefined })}>{L('رجّعه مو جاهز', 'Mark not ready')}</button>}
        </div>
      </div>
    </Sheet>
  );
}

// ---------------- add ----------------

export function FutureAddSheet() {
  const s = useApp();
  const cv = s.future.cv!;
  const items = s.future.cvItems || [];
  const sug = suggestions(cv, items);
  const [title, setTitle] = useState('');
  const [sec, setSec] = useState<CvSection>('tools');
  const add = (it: CvItem) => {
    A.addCvItems([it]);
    toast(L(`انضاف «${it.title}»`, `Added “${it.title}”`), { undoable: true });
  };
  return (
    <Sheet title={L('أضف بند', 'Add item')} onClose={closeSheet}>
      <div className="cv-form">
        {sug.length > 0 && (
          <div className="field">
            <label>{L('مقترحات لمجالك', 'Suggested for your field')}</label>
            <div className="cv-sug">
              {sug.map((x) => (
                <button key={x.key} onClick={() => add(toItem(x, uid, Date.now()))}>
                  <span className="m"><b>{L(...x.title)}</b><span>{L(...SECTIONS.find((y) => y.v === x.sec)!.t)} · {L(`${x.steps.length} خطوات`, `${x.steps.length} steps`)}</span></span>
                  <Icon name="plus" size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="cv-new">{L('أو اكتب بند من عندك', 'Or write your own')}</label>
          <input id="cv-new" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L('مثلًا: رخصة قيادة، دورة إسعافات، كتابة مقال…', 'e.g. driving licence, first-aid course, publish an article…')} />
          <div className="cv-chips">{SECTIONS.map((y) => <button key={y.v} className={`chip btnish ${sec === y.v ? 'on' : ''}`} onClick={() => setSec(y.v)}>{L(...y.t)}</button>)}</div>
          <button className="btn primary" style={{ alignSelf: 'flex-start', marginTop: 8 }} disabled={!title.trim()} onClick={() => { const it: CvItem = { id: uid(), sec, title: title.trim(), steps: [{ id: uid(), title: L('حدد أول خطوة صغيرة', 'Set a small first step'), min: 20 }], createdAt: Date.now() }; add(it); setTitle(''); closeSheet(); openSheet({ type: 'fu-item', id: it.id }); }}>{L('أضف وحدد خطواته', 'Add and set its steps')}</button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------- on «اليوم» ----------------

/** on your CV days: the next small step, with done / not today */
export function FutureTodayCard() {
  const s = useApp();
  const now = useNow(60_000);
  const t = today(s, now);
  if (!t?.show || !t.next) return null;
  const { item, step } = t.next;
  return (
    <section className="tile fu-today">
      <span className="fu-today-i"><Icon name="target" size={20} /></span>
      <button className="m" onClick={() => openSheet({ type: 'fu-item', id: item.id })}>
        <b>{step.title}</b>
        <span>{L('خطوة سيرتك', 'Your CV step')} · {item.title} · {fmtMinutes(step.min)}</span>
      </button>
      <span className="a">
        <button className="icon-btn" aria-label={L('خلصتها', 'Done')} onClick={() => { A.toggleCvStep(item.id, step.id); toast(L('✓ خطوة أقرب لسيرتك', '✓ One step closer'), { undoable: true }); }}><Icon name="check" size={18} /></button>
        <button className="icon-btn" aria-label={L('مو اليوم', 'Not today')} onClick={() => A.skipCvToday()}><Icon name="x" size={16} /></button>
      </span>
    </section>
  );
}
