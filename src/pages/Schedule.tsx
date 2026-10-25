import { useRef, useState } from 'react';
import { Empty, Seg, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { PageTop } from '../ui/PageTop';
import { closeSheet, openSheet } from '../ui/sheets';
import { toast } from '../ui/toast';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { askClaudeImage, hasAiKey } from '../lib/ai';
import { DAY_NAMES, isSkipped, readSchedule, weekSummary } from '../lib/engine/schedule';
import { addDays, atTime, fmtClock, fmtDate, fmtMinutes, todayKey, weekday } from '../lib/dates';
import type { ClassBlock } from '../lib/types';
import { L } from '../lib/i18n';

type Draft = Omit<ClassBlock, 'id' | 'createdAt'>;

const PALETTE = ['#4A9CC4', '#B9C94A', '#E8A13C', '#E58FA0', '#5B47B0', '#2FA98C', '#D9667A', '#7E62F0'];
/** one colour per subject, stable across the week */
export function blockColor(title: string) {
  let h = 0;
  for (const c of title.trim()) h = (h * 31 + c.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const ROW = 44; // px per hour

const SYSTEM = 'You read university timetables and work rosters from screenshots and return strict JSON only.';
const PROMPT = `Read this weekly timetable. Return ONLY JSON: {"schedule":[{"title":"…","day":0,"start":"HH:MM","end":"HH:MM","kind":"class","place":"…"}]}
Rules:
- day: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday. Arabic headers: الأحد/الاحد=0, الإثنين/الاثنين=1, الثلاثاء=2, الأربعاء/الاربعاء=3, الخميس=4.
- Trust the text written inside each block (e.g. "8.0-9.50 100 عرب" = 08:00–09:50, course «عرب 100»); ignore colour bands that spill into other columns without their own text.
- title: the course name and number as written (e.g. "عرب 100"). Times in 24h; afternoon hours like 1.0–2.50 are 13:00–14:50 when the grid shows 13.00.
- kind: "work" only for job shifts, otherwise "class". place only if written. "remote": true only if the block says online / عن بعد.`;

async function shrink(file: File): Promise<{ data: string; mediaType: 'image/jpeg' }> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { data: c.toDataURL('image/jpeg', 0.85).split(',')[1], mediaType: 'image/jpeg' };
}

/** جدولي: the weekly timetable — from a photo, typed in, or from any AI */
export function Schedule() {
  const s = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [reading, setReading] = useState(false);
  const sum = weekSummary(s);

  const fromPhoto = async (file?: File) => {
    if (!file) return;
    if (!hasAiKey()) {
      toast(L('قراءة الصور تحتاج مفتاح Claude من الإعدادات — أو استخدم «من الذكاء» مع ChatGPT.', 'Reading photos needs a Claude key in settings — or use “From AI” with ChatGPT.'), { ms: 7000 });
      return;
    }
    setReading(true);
    try {
      const text = await askClaudeImage(SYSTEM, PROMPT, await shrink(file));
      const a = text.indexOf('{');
      const b = text.lastIndexOf('}');
      const list = readSchedule(JSON.parse(text.slice(a, b + 1)));
      if (!list.length) throw new Error(L('ما لقيت محاضرات في الصورة.', "Couldn't find lectures in the picture."));
      setDraft(list);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { ms: 7000 });
    } finally {
      setReading(false);
    }
  };

  const shownDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => d <= 4 || s.schedule.some((b) => b.day === d));
  const from = Math.min(8 * 60, ...s.schedule.map((b) => toMin(b.start)));
  const to = Math.max(17 * 60, ...s.schedule.map((b) => toMin(b.end)));
  const hours = Array.from({ length: Math.ceil((to - Math.floor(from / 60) * 60) / 60) }, (_, i) => Math.floor(from / 60) + i);
  const top = (t: string) => ((toMin(t) - hours[0] * 60) / 60) * ROW;

  return (
    <div>
      <PageTop title={L('جدولي', 'My timetable')} sub={L('محاضراتك ودوامك — وأرتب يومك حولها', 'Your lectures and shifts — I plan your day around them')} back={{ label: L('أنت', 'You'), to: 'me' }} />
      <div className="stack">
        <div className="src3">
          <button onClick={() => fileRef.current?.click()} disabled={reading}><i>📷</i>{reading ? L('أقرأ الجدول…', 'Reading…') : L('صورة الجدول', 'Timetable photo')}</button>
          <button onClick={() => openSheet({ type: 'block' })}><i>✍️</i>{L('أكتبه', 'Type it')}</button>
          <button onClick={() => openSheet({ type: 'ai-import' })}><i>🤖</i>{L('من الذكاء', 'From AI')}</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        {draft && (
          <section>
            <div className="group-title"><span>{L('تأكد من القراءة', 'Check what I read')}</span></div>
            <div className="card sched-read">
              {[0, 1, 2, 3, 4, 5, 6].filter((d) => draft.some((b) => b.day === d)).map((d) => (
                <div key={d} className="r">
                  <b>{DAY_NAMES()[d]}</b>
                  <div className="c">
                    {draft.filter((b) => b.day === d).sort((a, b) => a.start.localeCompare(b.start)).map((b, i) => (
                      <span key={i} style={{ background: `${blockColor(b.title)}22`, color: blockColor(b.title) }}>{b.title} · {fmtClock(b.start)}–{fmtClock(b.end)}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn primary" onClick={() => { A.setSchedule(draft, true); setDraft(null); toast(L('اعتُمد الجدول ✓ — يومك صار يترتب حوله', 'Timetable saved ✓ — your days now plan around it'), { undoable: true }); }}>{L('اعتمد الجدول', 'Use this timetable')}</button>
              {s.schedule.length > 0 && <button className="btn" onClick={() => { A.setSchedule(draft); setDraft(null); }}>{L('أضفه للموجود', 'Add to current')}</button>}
              <button className="btn ghost" onClick={() => setDraft(null)}>{L('إلغاء', 'Cancel')}</button>
            </div>
            <div className="faint tiny" style={{ marginTop: 6 }}>{L('فيه غلط؟ اعتمده وعدّل أي محاضرة بالضغط عليها.', 'Something off? Save it, then tap any lecture to fix it.')}</div>
          </section>
        )}

        {s.schedule.length ? (
          <>
            <div className="card sched-grid" style={{ ['--cols' as string]: shownDays.length }}>
              <div className="sg-head">
                <span />
                {shownDays.map((d) => <span key={d}>{DAY_NAMES()[d]}</span>)}
              </div>
              <div className="sg-body" style={{ height: hours.length * ROW }}>
                <div className="sg-hours">{hours.map((h) => <span key={h} style={{ height: ROW }}>{h > 12 ? h - 12 : h}</span>)}</div>
                {shownDays.map((d) => (
                  <div key={d} className="sg-day">
                    {hours.map((h) => <i key={h} style={{ top: (h - hours[0]) * ROW }} />)}
                    {s.schedule.filter((b) => b.day === d).map((b) => (
                      <button key={b.id} className="sg-b" style={{ top: top(b.start), height: Math.max(18, top(b.end) - top(b.start) - 2), background: b.kind === 'work' ? '#5E6B7D' : blockColor(b.title) }} onClick={() => openSheet({ type: 'block', id: b.id })}>
                        <b>{b.remote ? '💻 ' : ''}{b.title}</b>
                        <span>{fmtClock(b.start)}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: '12px 16px', fontSize: 14, lineHeight: 1.75 }}>
              ⏱️ {sum.cls ? L(`الأسبوع فيه ${fmtMinutes(sum.cls)} محاضرات`, `${fmtMinutes(sum.cls)} of lectures a week`) : ''}{sum.cls && sum.work ? L(' و', ' and ') : ''}{sum.work ? L(`${fmtMinutes(sum.work)} دوام`, `${fmtMinutes(sum.work)} of work`) : ''}.
              <br />
              {L('وقتك الفاضي للمذاكرة والمهام: ', 'Your free time for study and tasks: ')}
              <b>{[sum.freeDays.length ? L(`${sum.freeDays.join(' و')} كامل`, `all of ${sum.freeDays.join(', ')}`) : '', L(`بعد ${fmtClock(sum.latest)} يوميًا`, `after ${fmtClock(sum.latest)} daily`), L('والفراغات بين المحاضرات', 'and the gaps between lectures')].filter(Boolean).join(' + ')}</b>.
            </div>
            <TravelCard />
            <button className="btn" onClick={() => openSheet({ type: 'block' })}><Icon name="plus" size={15} /> {L('محاضرة أو دوام', 'Lecture or shift')}</button>
          </>
        ) : (
          !draft && (
            <div className="card">
              <Empty icon="week" title={L('أضف جدولك', 'Add your timetable')}>
                {L('صوّر جدولك الدراسي أو جدول الدوام، أو اكتبه. بعدها المهام والمذاكرة تنحط في وقتك الفاضي بس، و«وقتي» ينحسب بدون وقت المحاضرات.', 'Snap your timetable or work roster, or type it. Tasks and study then go only into your free time, and “My time” excludes lectures.')}
              </Empty>
            </div>
          )
        )}
      </div>
    </div>
  );
}

const MINS = [0, 15, 30, 45, 60, 90, 120];

/** the way there and back, and the rest once home — taken out of your free time like the lectures themselves */
function TravelCard() {
  const s = useApp();
  const c = s.settings.commuteMin ?? 60;
  const r = s.settings.restMin ?? 60;
  const sel = (v: number, key: 'commuteMin' | 'restMin') => (
    <select className="input" value={v} onChange={(e) => A.updateSettings({ [key]: Number(e.target.value) })}>
      {MINS.map((m) => <option key={m} value={m}>{m ? fmtMinutes(m) : L('بدون', 'None')}</option>)}
    </select>
  );
  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div className="fields two">
        <div className="field"><label>{L('🚗 الطريق (رايح وراجع)', '🚗 Travel (each way)')}</label>{sel(c, 'commuteMin')}</div>
        <div className="field"><label>{L('🛋️ راحة بعد ما ترجع', '🛋️ Rest once home')}</label>{sel(r, 'restMin')}</div>
      </div>
      <div className="faint tiny" style={{ marginTop: 6, lineHeight: 1.7 }}>
        {L(`محاضرة 8:00 = تطلع ${fmtClock(`${String(Math.floor((480 - c) / 60)).padStart(2, '0')}:${String((480 - c) % 60).padStart(2, '0')}`)}، وبعد آخر محاضرة ${c ? fmtMinutes(c) : ''} طريق${r ? ` + ${fmtMinutes(r)} راحة` : ''} قبل ما أحط لك مذاكرة أو مهام. المحاضرات «عن بعد» 💻 ما لها طريق. وإذا الفراغ بين محاضرتين ما يكفي ترجع البيت، أحسبك باقي هناك.`, `An 8:00 lecture means leaving earlier; after the last one I leave travel${r ? ' + rest' : ''} before planning study or tasks. Online 💻 blocks have no travel. If a gap is too short to go home, I count you as staying.`)}
      </div>
    </div>
  );
}

/** add (several days at once) or edit a lecture / shift */
export function BlockSheet({ id }: { id?: string }) {
  const s = useApp();
  const ex = id ? s.schedule.find((b) => b.id === id) : undefined;
  const [title, setTitle] = useState(ex?.title || '');
  const [kind, setKind] = useState<'class' | 'work'>(ex?.kind || 'class');
  const [days, setDays] = useState<number[]>(ex ? [ex.day] : []);
  const [start, setStart] = useState(ex?.start || '08:00');
  const [end, setEnd] = useState(ex?.end || '09:50');
  const [place, setPlace] = useState(ex?.place || '');
  const [remote, setRemote] = useState(!!ex?.remote);
  const ok = title.trim() && days.length && end > start;
  // the next time this block happens (today if it hasn't ended yet)
  let next = todayKey();
  if (ex) while (weekday(next) !== ex.day || (next === todayKey() && atTime(next, ex.end) <= Date.now())) next = addDays(next, 1);
  const off = ex ? isSkipped(s, next, ex.id) : false;
  const save = () => {
    const base = { title: title.trim(), kind, start, end, remote, ...(place.trim() ? { place: place.trim() } : {}) };
    if (ex) A.saveBlock({ ...base, id: ex.id, day: days[0] });
    else A.setSchedule(days.map((day) => ({ ...base, day })));
    closeSheet();
  };
  return (
    <Sheet
      title={ex ? ex.title : L('أضف للجدول', 'Add to timetable')}
      onClose={closeSheet}
      footer={
        <>
          <button className="btn primary grow" disabled={!ok} onClick={save}>{L('حفظ', 'Save')}</button>
          {ex && <button className="btn danger" onClick={() => { A.deleteBlock(ex.id); closeSheet(); toast(L('انحذف من الجدول', 'Removed'), { undoable: true }); }}><Icon name="trash" size={15} /></button>}
        </>
      }
    >
      <div className="fields">
        <Seg value={kind} onChange={setKind} options={[{ v: 'class', l: L('🎓 محاضرة', '🎓 Lecture') }, { v: 'work', l: L('💼 دوام', '💼 Work') }]} />
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'work' ? L('الدوام', 'Work') : L('اسم المادة (كيم 101)', 'Course (CHEM 101)')} autoFocus />
        <div className="field">
          <label>{ex ? L('اليوم', 'Day') : L('الأيام (اختر أكثر من يوم)', 'Days (pick several)')}</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <button key={d} className={`chip btnish ${days.includes(d) ? 'on' : ''}`} onClick={() => setDays(ex ? [d] : days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{DAY_NAMES()[d]}</button>
            ))}
          </div>
        </div>
        <div className="fields two">
          <div className="field"><label>{L('من', 'From')}</label><input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="field"><label>{L('إلى', 'To')}</label><input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <Seg value={remote ? 'r' : 'p'} onChange={(v) => setRemote(v === 'r')} options={[{ v: 'p', l: L('🚗 حضوري', '🚗 In person') }, { v: 'r', l: L('💻 عن بعد', '💻 Online') }]} />
        {ex && (
          <button className={`btn ${off ? '' : 'ghost'}`} onClick={() => { A.skipClass(next, ex.id, !off); if (!off) toast(L('ألغيتها — ووقتها راح للمذاكرة ذاك اليوم', 'Skipped — its time goes to study that day'), { undoable: true }); }}>
            {off ? L(`↩︎ رجّعها (${fmtDate(next)})`, `↩︎ Back on (${fmtDate(next)})`) : L(`🚫 ما راح أحضرها ${fmtDate(next)}`, `🚫 I'll miss it on ${fmtDate(next)}`)}
          </button>
        )}
        {!remote && <input className="input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={L('القاعة (اختياري)', 'Room (optional)')} />}
      </div>
    </Sheet>
  );
}
