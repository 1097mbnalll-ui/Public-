import { useEffect, useRef, useState } from 'react';
import { Collapse, Group, Row, Stepper, Switch } from '../ui/kit';
import { PageTop } from '../ui/PageTop';
import { go } from '../ui/router';
import { Icon } from '../ui/Icon';
import { getState, replaceState, useApp } from '../lib/store';
import * as A from '../lib/actions';
import { DAY_NAMES, fmtDate, fmtMinutes, timeAgo } from '../lib/dates';
import { notificationSupport, requestNotifications, showSystemNotification } from '../lib/reminders';
import { getSnapshot, isPersisted, listSnapshots, requestPersistence } from '../lib/db';
import { readBackup, type ImportPreview } from '../lib/backup';
import { initialState } from '../lib/defaults';
import { exportUI } from '../ui/ops';
import { toast } from '../ui/toast';

function Section({ title, children, desc }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-head"><h2>{title}</h2></div>
      {desc && <p className="muted small" style={{ marginTop: -4 }}>{desc}</p>}
      <div className="card fields">{children}</div>
    </div>
  );
}

export function Settings() {
  const s = useApp();
  const st = s.settings;
  const [perm, setPerm] = useState(notificationSupport());
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [snaps, setSnaps] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    isPersisted().then(setPersisted);
    listSnapshots().then(setSnaps);
  }, []);

  const enableNotif = async () => {
    const r = await requestNotifications();
    setPerm(r);
    if (r === 'granted') {
      A.updateSettings({ notifications: true });
      toast('فُعّلت إشعارات المتصفح');
    } else if (r === 'denied') toast('الإذن مرفوض من المتصفح. فعّله من إعدادات الموقع في المتصفح.');
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      setPreview(readBackup(await f.text()));
    } catch (e) {
      toast((e as Error).message);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;

  return (
    <div>
      <PageTop title="أنت" sub="وقتك، تنبيهاتك، بياناتك — وما تعلمه «مسار» عنك" />

      <div className="stack">
        <Group>
          <div className="r">
            <span className="ic"><Icon name="user" size={16} /></span>
            <input className="input bare grow" style={{ padding: 0 }} value={st.name} onChange={(e) => A.updateSettings({ name: e.target.value })} placeholder="اسمك (اختياري)" aria-label="الاسم" />
          </div>
          <Row icon="insights" iconColor="var(--accent)" label="ما تعلمته عنك" sub="دقة تقديراتك، سرعة مذاكرتك، أنماط التأجيل" chevron onClick={() => go('me/insights')} />
        </Group>
      </div>

      <Section title="وقتك المتاح" desc="الوقت الحر للمذاكرة والمهام خارج الدوام والمحاضرات. الخطة لا تحمّل يومك أكثر منه، ويمكنك تغيير يوم بعينه من صفحة «اليوم».">
        <AvailabilityEditor />
      </Section>

      <Section title="التذكيرات والتنبيهات">
        <div className="notice">
          <Icon name="info" size={18} />
          <div>
            <b>بصراحة عن حدود التنبيهات:</b> الموقع يرسل إشعارات المتصفح فقط وهو مفتوح (في تبويب ولو بالخلفية). إذا أُغلق، تظهر التذكيرات الفائتة عند فتحه في «فاتتك أثناء غيابك».
            للتنبيه المضمون والجوال مقفل، استخدم «أضف للتقويم» داخل المهمة أو الاختبار — يضيف موعدًا بتنبيه في تقويم جهازك.
            {isIOS && !standalone && ' على الآيفون: الإشعارات تتطلب إضافة الموقع للشاشة الرئيسية (مشاركة ← إضافة إلى الشاشة الرئيسية) ثم فتحه منها.'}
          </div>
        </div>
        <div className="row between">
          <div>
            <div style={{ fontWeight: 500 }}>إشعارات المتصفح</div>
            <div className="faint tiny">
              {perm === 'unsupported' ? 'غير مدعومة في هذا المتصفح — التذكيرات تظهر داخل الموقع' : perm === 'granted' ? 'الإذن ممنوح' : perm === 'denied' ? 'مرفوضة من المتصفح' : 'لم يُطلب الإذن بعد'}
            </div>
          </div>
          {perm === 'granted' ? (
            <Switch on={st.notifications} onChange={(v) => A.updateSettings({ notifications: v })} label="إشعارات المتصفح" />
          ) : perm !== 'unsupported' ? (
            <button className="btn sm" onClick={enableNotif}>تفعيل</button>
          ) : null}
        </div>
        {perm === 'granted' && st.notifications && (
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
            const ok = await showSystemNotification('تجربة من مسار', 'هكذا ستصلك التذكيرات.', 'test');
            if (!ok) toast('تعذر إظهار الإشعار');
          }}>
            <Icon name="bell" size={15} /> إشعار تجريبي
          </button>
        )}
        <div className="row between">
          <div>
            <div style={{ fontWeight: 500 }}>تذكيرات تلقائية</div>
            <div className="faint tiny">قبل موعد المهمة بساعة، ليلة الاختبار، وملخص الصباح.</div>
          </div>
          <Switch on={st.nudges} onChange={(v) => A.updateSettings({ nudges: v })} label="تذكيرات تلقائية" />
        </div>
        <div className="field">
          <label>ملخص الصباح</label>
          <input type="time" className="input" style={{ width: 160 }} value={st.morningBrief} onChange={(e) => A.updateSettings({ morningBrief: e.target.value })} />
        </div>
      </Section>

      <Section title="بياناتك والنسخ الاحتياطي">
        <div className="notice">
          <Icon name="shield" size={18} />
          <div>
            كل بياناتك محفوظة في هذا المتصفح على هذا الجهاز فقط — لا تُرسل لأي خادم. مسح بيانات المتصفح يمسحها، لذلك نزّل نسخة احتياطية دوريًا.
            {s.meta.lastExportAt ? ` آخر نسخة: ${timeAgo(s.meta.lastExportAt)}.` : ' لم تنزّل نسخة بعد.'}
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary" onClick={exportUI}><Icon name="download" size={16} /> نزّل نسخة احتياطية</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} /> استعادة من ملف</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        {preview && (
          <div className="notice amber" style={{ flexDirection: 'column' }}>
            <div>
              <b>ستُستبدل بياناتك الحالية بمحتوى الملف</b>{preview.exportedAt ? ` (نسخة ${new Date(preview.exportedAt).toLocaleString('ar')})` : ''}:{' '}
              {preview.counts.map((c) => `${c.n} ${c.label}`).join('، ')}. تبقى نسخة من الحالية في «لقطات يومية» ويمكنك التراجع فورًا.
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm primary" onClick={async () => {
                await replaceState(preview.state, 'استعادة نسخة');
                setPreview(null);
                toast('استُعيدت البيانات', { undoable: true });
              }}>استبدل</button>
              <button className="btn sm" onClick={() => setPreview(null)}>إلغاء</button>
            </div>
          </div>
        )}
        <div className="row between">
          <div>
            <div style={{ fontWeight: 500 }}>تخزين دائم</div>
            <div className="faint tiny">{persisted === true ? 'مفعل — المتصفح لن يحذف بياناتك تلقائيًا عند امتلاء المساحة' : persisted === false ? 'غير مفعل — قد يحذف المتصفح البيانات عند ضيق المساحة' : 'غير مدعوم في هذا المتصفح'}</div>
          </div>
          {persisted === false && <button className="btn sm" onClick={async () => { const r = await requestPersistence(); setPersisted(r); toast(r ? 'فُعّل التخزين الدائم' : 'رفض المتصفح الطلب — ثبّت الموقع كتطبيق ليزيد احتمال القبول'); }}>طلب</button>}
        </div>
        {snaps.length > 0 && (
          <div className="field">
            <label>لقطات يومية تلقائية (آخر 14 يومًا)</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {snaps.map((d) => (
                <button key={d} className="chip btnish" onClick={async () => {
                  if (!confirm(`استرجاع بياناتك كما كانت ${fmtDate(d)}؟ يمكنك التراجع بعدها.`)) return;
                  const snap = await getSnapshot(d);
                  if (snap) {
                    await replaceState(snap, 'استرجاع لقطة');
                    toast('استُرجعت اللقطة', { undoable: true });
                  }
                }}>
                  {fmtDate(d, false)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="divider" />
        <button className="btn sm danger" style={{ alignSelf: 'flex-start' }} onClick={async () => {
          if (!confirm('مسح كل البيانات والبدء من جديد؟')) return;
          if (!confirm('متأكد؟ نزّل نسخة احتياطية أولًا إن احتجتها.')) return;
          await replaceState({ ...initialState(), meta: { ...initialState().meta, onboarded: true }, settings: getState().settings }, 'مسح الكل');
          toast('مُسحت البيانات', { undoable: true });
        }}>
          <Icon name="trash" size={15} /> مسح كل البيانات
        </button>
      </Section>

      <Section title="كيف يعمل «مسار»؟">
        <div className="small muted col" style={{ gap: 8 }}>
          <p style={{ margin: 0 }}><b style={{ color: 'var(--text)' }}>ترتيب اليوم:</b> لكل عنصر درجة من الأولوية، قرب الموعد، هل هو لا يحتمل التأجيل، كم تأجل، وكم مضى عليه. الأسباب تظهر تحت كل عنصر. الخطة لا تتجاوز وقتك المتاح إلا بما لا يمكن تأجيله، وتخبرك بالزيادة.</p>
          <p style={{ margin: 0 }}><b style={{ color: 'var(--text)' }}>تقدير المذاكرة:</b> حجم الفصول × صعوبتها × سرعتك المقاسة من جلساتك + وقت المراجعة. يُعرض كنطاق (أقل–أكثر) يضيق كلما سجلت جلسات أكثر. ثم أحاكي الأيام حتى الاختبار مقابل وقتك المتاح للمذاكرة وأوزع الوقت بين الاختبارات.</p>
          <p style={{ margin: 0 }}><b style={{ color: 'var(--text)' }}>التعلم منك:</b> أقارن تقديراتك بالوقت الفعلي (المؤقت أو إجابتك بعد الإنجاز) وأصحح التقديرات القادمة. المهام التي لم تُنجز في يومها تعود مؤجلة ويُحسب تأجيلها.</p>
          <p style={{ margin: 0 }}><b style={{ color: 'var(--text)' }}>ما لا يفعله:</b> لا يرسل رسائل ولا ملفات لأحد، ولا يستخدم ذكاءً اصطناعيًا خارجيًا، ولا يعرف إلا ما أدخلته.</p>
          <p style={{ margin: 0 }}><b style={{ color: 'var(--text)' }}>اختصارات:</b> <span className="kbd">N</span> إضافة سريعة · <span className="kbd">/</span> أو <span className="kbd">Ctrl K</span> بحث.</p>
        </div>
      </Section>
    </div>
  );
}

const WEEKDAYS = [0, 1, 2, 3, 4];
const WEEKEND = [5, 6];

/** two simple groups (study days / weekend) + per-day fine-tuning tucked away */
function AvailabilityEditor() {
  const st = useApp().settings;
  const setGroup = (key: 'available' | 'studyCap', days: number[], v: number) => {
    const arr = [...st[key]];
    for (const d of days) arr[d] = v;
    A.updateSettings({ [key]: arr } as never);
  };
  const setDay = (key: 'available' | 'studyCap', i: number, v: number) => {
    const arr = [...st[key]];
    arr[i] = Math.max(0, v);
    A.updateSettings({ [key]: arr } as never);
  };
  const avg = (key: 'available' | 'studyCap', days: number[]) => Math.round(days.reduce((a, d) => a + st[key][d], 0) / days.length / 15) * 15;
  const fmt = (m: number) => (m ? fmtMinutes(m) : 'لا شيء');
  return (
    <div className="col" style={{ gap: 14 }}>
      {[
        { label: 'الأحد – الخميس', days: WEEKDAYS },
        { label: 'الجمعة – السبت', days: WEEKEND },
      ].map((g) => (
        <div key={g.label} className="col" style={{ gap: 8 }}>
          <div style={{ fontWeight: 600 }}>{g.label}</div>
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="muted small">وقت حر</span>
            <Stepper value={avg('available', g.days)} onChange={(v) => setGroup('available', g.days, v)} format={fmt} />
          </div>
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="muted small">منه مذاكرة بحد أقصى</span>
            <Stepper value={avg('studyCap', g.days)} onChange={(v) => setGroup('studyCap', g.days, v)} format={fmt} />
          </div>
        </div>
      ))}
      <Collapse title="تخصيص كل يوم على حدة">
        <div className="col" style={{ gap: 10 }}>
          {DAY_NAMES.map((d, i) => (
            <div key={d} className="row between wrap" style={{ gap: 8 }}>
              <span style={{ width: 70 }}>{d}</span>
              <Stepper value={st.available[i]} onChange={(v) => setDay('available', i, v)} format={fmt} />
              <Stepper value={st.studyCap[i]} onChange={(v) => setDay('studyCap', i, v)} format={(m) => `مذاكرة ${fmt(m)}`} />
            </div>
          ))}
        </div>
      </Collapse>
      <div className="fields two">
        <div className="field">
          <label>ينتهي يومك عادةً</label>
          <input type="time" className="input" value={st.dayEnd} onChange={(e) => A.updateSettings({ dayEnd: e.target.value || '23:30' })} />
        </div>
        <div className="field">
          <label>وقت المراجعة فوق المذاكرة</label>
          <select className="select" value={st.reviewFactor} onChange={(e) => A.updateSettings({ reviewFactor: +e.target.value })}>
            {[0, 0.1, 0.2, 0.3, 0.5].map((x) => <option key={x} value={x}>{Math.round(x * 100)}%</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
