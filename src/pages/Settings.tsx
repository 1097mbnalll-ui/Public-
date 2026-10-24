import { InstallCard } from '../ui/InstallCard';
import { useEffect, useRef, useState } from 'react';
import { Collapse, Group, Row, Seg, Stepper, Switch } from '../ui/kit';
import type { CoachTone } from '../lib/types';
import { PageTop } from '../ui/PageTop';
import { openSheet } from '../ui/sheets';
import { receiveFile } from './Receive';
import { go } from '../ui/router';
import { Icon } from '../ui/Icon';
import { getState, replaceState, useApp } from '../lib/store';
import * as A from '../lib/actions';
import { dayNames, fmtDate, fmtMinutes, timeAgo } from '../lib/dates';
import { notificationSupport, requestNotifications, showSystemNotification } from '../lib/reminders';
import { getSnapshot, isPersisted, listSnapshots, requestPersistence } from '../lib/db';
import { readBackup, type ImportPreview } from '../lib/backup';
import { initialState } from '../lib/defaults';
import { exportUI } from '../ui/ops';
import { toast } from '../ui/toast';
import { L } from '../lib/i18n';
import { THEMES } from '../lib/themes';
import { getAiKey, hasAiKey, setAiKey, testAiKey } from '../lib/ai';
import { getSync } from '../lib/sync';

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
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);
  const [snaps, setSnaps] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const xferRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    isPersisted().then(setPersisted);
    listSnapshots().then(setSnaps);
  }, []);

  const enableNotif = async () => {
    const r = await requestNotifications();
    setPerm(r);
    if (r === 'granted') {
      A.updateSettings({ notifications: true });
      toast(L('فُعّلت إشعارات المتصفح', "Browser notifications enabled"));
    } else if (r === 'denied') toast(L('الإذن مرفوض من المتصفح. فعّله من إعدادات الموقع في المتصفح.', "The browser denied permission. Allow it in the browser's site settings."));
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
      <PageTop title={L("أنت", "You")} sub={L("وقتك، تنبيهاتك، بياناتك — وما تعلمه «مسار» عنك", "Your time, reminders, data — and what Masar has learned about you")} />

      <div className="stack">
        <Group>
          <div className="r">
            <span className="ic"><Icon name="user" size={16} /></span>
            <input className="input bare grow" style={{ padding: 0 }} value={st.name} onChange={(e) => A.updateSettings({ name: e.target.value })} placeholder={L("اسمك (اختياري)", "Your name (optional)")} aria-label={L("الاسم", "Name")} />
          </div>
          <div className="r">
            <span className="ic"><Icon name="globe" size={16} /></span>
            <span className="grow">{L("اللغة", "Language")}</span>
            <Seg value={st.lang} options={[{ v: 'ar', l: 'العربية' }, { v: 'en', l: 'English' }]} onChange={(v) => A.updateSettings({ lang: v })} />
          </div>
          <Row icon="insights" iconColor="var(--accent)" label={L("ما تعلمته عنك", "What I've learned about you")} sub={L("دقة تقديراتك، سرعة مذاكرتك، أنماط التأجيل", "Estimate accuracy, study speed, postponing patterns")} chevron onClick={() => go('me/insights')} />
        </Group>
      </div>

      <Section title={L("الألوان", "Colours")} desc={L("اختر الألوان اللي ترتاح لها — تتغير فورًا وتنحفظ مع بياناتك.", "Pick the colours you like — they change instantly and are saved with your data.")}>
        <div className="themes">
          {THEMES.map((t) => (
            <button key={t.id} className={`theme-opt ${st.theme === t.id ? 'on' : ''}`} onClick={() => A.updateSettings({ theme: t.id })} aria-pressed={st.theme === t.id}>
              <span className="theme-swatch" style={{ background: `linear-gradient(150deg, ${t.bg[0]}, ${t.bg[1]} 55%, ${t.bg[2]})` }}>
                <i style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.pop})` }} />
              </span>
              {t.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title={L("المدرب الذكي", "Smart coach")} desc={L("يتابع تأخيرك ويكلمك كل يوم: يحفّزك وأنت ماشي صح، ويشد عليك كل ما زاد تأخيرك.", "Watches your delays and talks to you daily: encourages you when you're on track, and gets tougher the more you fall behind.")}>
        <CoachSettings />
      </Section>

      <Section title={L("وقتك المتاح", "Your available time")} desc={L("الوقت الحر للمذاكرة والمهام خارج الدوام والمحاضرات. الخطة لا تحمّل يومك أكثر منه، ويمكنك تغيير يوم بعينه من صفحة «اليوم».", "Free time for study and tasks outside work and lectures. The plan never fills a day beyond it; you can change a single day from the “Today” page.")}>
        <AvailabilityEditor />
      </Section>

      <Section title={L("التذكيرات والتنبيهات", "Reminders & notifications")}>
        <div className="notice">
          <Icon name="info" size={18} />
          <div>
            <b>{L("بصراحة عن حدود التنبيهات:", "Honestly, about notification limits:")}</b>{L(" الموقع يرسل إشعارات المتصفح فقط وهو مفتوح (في تبويب ولو بالخلفية). إذا أُغلق، تظهر التذكيرات الفائتة عند فتحه في «فاتتك أثناء غيابك». للتنبيه المضمون والجوال مقفل، استخدم «أضف للتقويم» داخل المهمة أو الاختبار — يضيف موعدًا بتنبيه في تقويم جهازك.", " the site sends browser notifications only while it's open (in a tab, even in the background). If it's closed, missed reminders appear when you open it, under “Missed while you were away”. For a guaranteed alert with the phone locked, use “Add to calendar” inside a task or exam — it adds an event with an alert to your device calendar.")}{isIOS && !standalone && L(' على الآيفون: الإشعارات تتطلب إضافة الموقع للشاشة الرئيسية (مشاركة ← إضافة إلى الشاشة الرئيسية) ثم فتحه منها.', " On iPhone: notifications require adding the site to the Home Screen (Share → Add to Home Screen) and opening it from there.")}
          </div>
        </div>
        <div className="row between">
          <div>
            <div style={{ fontWeight: 500 }}>{L("إشعارات المتصفح", "Browser notifications")}</div>
            <div className="faint tiny">
              {perm === 'unsupported' ? L('غير مدعومة في هذا المتصفح — التذكيرات تظهر داخل الموقع', "Not supported in this browser — reminders show inside the site") : perm === 'granted' ? L('الإذن ممنوح', "Permission granted") : perm === 'denied' ? L('مرفوضة من المتصفح', "Denied by the browser") : L('لم يُطلب الإذن بعد', "Not requested yet")}
            </div>
          </div>
          {perm === 'granted' ? (
            <Switch on={st.notifications} onChange={(v) => A.updateSettings({ notifications: v })} label={L("إشعارات المتصفح", "Browser notifications")} />
          ) : perm !== 'unsupported' ? (
            <button className="btn sm" onClick={enableNotif}>{L("تفعيل", "Enable")}</button>
          ) : null}
        </div>
        {perm === 'granted' && st.notifications && (
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
            const ok = await showSystemNotification(L('تجربة من مسار', "Test from Masar"), L('هكذا ستصلك التذكيرات.', "This is how reminders will reach you."), 'test');
            if (!ok) toast(L('تعذر إظهار الإشعار', "Couldn't show the notification"));
          }}>
            <Icon name="bell" size={15} />{L(" إشعار تجريبي", " Test notification")}</button>
        )}
        <div className="row between">
          <div>
            <div style={{ fontWeight: 500 }}>{L("تذكيرات تلقائية", "Automatic reminders")}</div>
            <div className="faint tiny">{L("قبل موعد المهمة بساعة، ليلة الاختبار، وملخص الصباح.", "An hour before a task's time, the night before an exam, and a morning summary.")}</div>
          </div>
          <Switch on={st.nudges} onChange={(v) => A.updateSettings({ nudges: v })} label={L("تذكيرات تلقائية", "Automatic reminders")} />
        </div>
        <div className="field">
          <label>{L("ملخص الصباح", "Morning summary")}</label>
          <input type="time" className="input" style={{ width: 160 }} value={st.morningBrief} onChange={(e) => A.updateSettings({ morningBrief: e.target.value })} />
        </div>
      </Section>

      <Section title={L("ثبّت التطبيق", "Install the app")}>
        <InstallCard always />
      </Section>

      <Section title={L("جدولي", "My timetable")} desc={L("محاضراتك أو دوامك — المهام والمذاكرة تنحط في وقتك الفاضي بس.", "Your lectures or shifts — tasks and study go only into your free time.")}>
        <button className="btn primary" onClick={() => go('schedule')}><Icon name="week" size={16} />{L(" جدولي", " My timetable")}</button>
      </Section>

      <Section title={L("المزامنة بين أجهزتك", "Sync across your devices")} desc={L("جوالك والتابلت يشوفون نفس البيانات تلقائيًا، ورسائل البنك تدخل مصاريفك لحالها — عن طريق حساب قوقل حقك.", "Your phone and tablet see the same data automatically, and bank messages land in your spending — through your own Google account.")}>
        <button className="btn primary" onClick={() => openSheet({ type: 'sync' })}><Icon name="repeat" size={16} />{L(" المزامنة", " Sync")}</button>
      </Section>

      <Section title={L("جهاز آخر", "Another device")} desc={L("انقل كل بياناتك لجوال أو كمبيوتر آخر بدون حساب: تُشفّر بكود، وترسل الرابط لنفسك، وتفتحه هناك.", "Move all your data to another phone or computer without an account: it's encrypted with a code, you send yourself the link, and open it there.")}>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => openSheet({ type: 'transfer' })}><Icon name="share" size={16} />{L(" انقل بياناتي لجهاز آخر", " Move my data to another device")}</button>
          <button className="btn" onClick={() => xferRef.current?.click()}><Icon name="download" size={16} />{L(" استقبل من ملف", " Receive from file")}</button>
          <input
            ref={xferRef}
            type="file"
            accept=".masar,application/octet-stream"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) receiveFile(new Uint8Array(await f.arrayBuffer()));
              e.target.value = '';
            }}
          />
        </div>
        <div className="faint tiny">{L("وصلك رابط؟ افتحه فقط على الجهاز الآخر وسيطلب الكود.", "Got a link? Just open it on the other device and it will ask for the code.")}</div>
      </Section>

      <Section title={L("بياناتك والنسخ الاحتياطي", "Your data & backups")}>
        <div className="notice">
          <Icon name="shield" size={18} />
          <div>{getSync() ? L("بياناتك محفوظة في هذا المتصفح، ونسخة مشفّرة منها في سكربت قوقل الخاص بك للمزامنة (لا يقرؤها أحد بدون أجهزتك). نزّل نسخة احتياطية دوريًا.", "Your data is stored in this browser, with an encrypted copy in your own Google script for sync (unreadable without your devices). Download a backup regularly.") : L("بياناتك محفوظة في هذا المتصفح على هذا الجهاز فقط. مسح بيانات المتصفح يمسحها، لذلك نزّل نسخة احتياطية دوريًا.", "Your data is stored in this browser on this device only. Clearing browser data erases it, so download a backup regularly.")}{s.meta.lastExportAt ? L(` آخر نسخة: ${timeAgo(s.meta.lastExportAt)}.`, ` Last backup: ${timeAgo(s.meta.lastExportAt)}.`) : L(' لم تنزّل نسخة بعد.', " No backup downloaded yet.")}
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary" onClick={exportUI}><Icon name="download" size={16} />{L(" نزّل نسخة احتياطية", " Download backup")}</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />{L(" استعادة من ملف", " Restore from file")}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        {preview && (
          <div className="notice amber" style={{ flexDirection: 'column' }}>
            <div>
              <b>{L("ستُستبدل بياناتك الحالية بمحتوى الملف", "Your current data will be replaced with the file's contents")}</b>{preview.exportedAt ? L(` (نسخة ${new Date(preview.exportedAt).toLocaleString('ar')})`, ` (backup from ${new Date(preview.exportedAt).toLocaleString('en')})`) : ''}:{' '}
              {preview.counts.map((c) => `${c.n} ${c.label}`).join(L('، ', ", "))}{L(". تُستبدل الإعدادات أيضًا (اللغة، الألوان، وقتك المتاح). يمكنك التراجع فورًا من الإشعار.", ". Settings are replaced too (language, colours, available time). You can undo right away from the notice.")}{getSync() && L(" المزامنة مفعّلة: ما ليس في الملف سيُحذف من أجهزتك الأخرى أيضًا.", " Sync is on: anything not in the file will be removed from your other devices too.")}</div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm primary" onClick={async () => {
                await replaceState(preview.state, L('استعادة نسخة', "Restore backup"));
                setPreview(null);
                toast(L('استُعيدت البيانات', "Data restored"), { undoable: true });
              }}>{L("استبدل", "Replace")}</button>
              <button className="btn sm" onClick={() => setPreview(null)}>{L("إلغاء", "Cancel")}</button>
            </div>
          </div>
        )}
        <div className="row between">
          <div>
            <div style={{ fontWeight: 500 }}>{L("تخزين دائم", "Persistent storage")}</div>
            <div className="faint tiny">{persisted === true ? L('مفعل — المتصفح لن يحذف بياناتك تلقائيًا عند امتلاء المساحة', "On — the browser won't delete your data automatically when space runs low") : persisted === false ? L('غير مفعل — قد يحذف المتصفح البيانات عند ضيق المساحة', "Off — the browser may delete data when space runs low") : persisted === null ? L('غير مدعوم في هذا المتصفح', "Not supported in this browser") : '…'}</div>
          </div>
          {persisted === false && <button className="btn sm" onClick={async () => { const r = await requestPersistence(); setPersisted(r); toast(r ? L('فُعّل التخزين الدائم', "Persistent storage enabled") : L('رفض المتصفح الطلب — ثبّت الموقع كتطبيق ليزيد احتمال القبول', "The browser refused — installing the site as an app makes approval more likely")); }}>{L("طلب", "Request")}</button>}
        </div>
        {snaps.length > 0 && (
          <div className="field">
            <label>{L("لقطات يومية تلقائية (آخر 14 يومًا)", "Automatic daily snapshots (last 14 days)")}</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {snaps.map((d) => (
                <button key={d} className="chip btnish" onClick={async () => {
                  if (!confirm(L(`استرجاع بياناتك كما كانت ${fmtDate(d)}؟ يمكنك التراجع بعدها.`, `Restore your data as it was on ${fmtDate(d)}? You can undo afterwards.`))) return;
                  const snap = await getSnapshot(d);
                  if (snap) {
                    await replaceState(snap, L('استرجاع لقطة', "Restore snapshot"));
                    toast(L('استُرجعت اللقطة', "Snapshot restored"), { undoable: true });
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
          if (!confirm(L('مسح كل البيانات والبدء من جديد؟', "Erase all data and start over?") + (getSync() ? L('\n\nالمزامنة مفعّلة: ستُمسح البيانات من أجهزتك الأخرى أيضًا. لإيقافها أولًا: «المزامنة» ← «إيقاف».', '\n\nSync is on: your other devices will be erased too. To stop it first: “Sync” → “Stop”.') : ''))) return;
          if (!confirm(L('متأكد؟ نزّل نسخة احتياطية أولًا إن احتجتها.', "Are you sure? Download a backup first if you need it."))) return;
          await replaceState({ ...initialState(), meta: { ...initialState().meta, onboarded: true }, settings: getState().settings }, L('مسح الكل', "Erase all"));
          toast(L('مُسحت البيانات', "Data erased"), { undoable: true });
        }}>
          <Icon name="trash" size={15} />{L(" مسح كل البيانات", " Erase all data")}</button>
      </Section>

      <Section title={L("كيف يعمل «مسار»؟", "How does Masar work?")}>
        <div className="small muted col" style={{ gap: 8 }}>
          <p style={{ margin: 0 }}><b style={{ color: 'var(--text)' }}>{L("ترتيب اليوم:", "Ordering your day:")}</b>{L(" لكل عنصر درجة من الأولوية، قرب الموعد، هل هو لا يحتمل التأجيل، كم تأجل، وكم مضى عليه. الأسباب تظهر تحت كل عنصر. الخطة لا تتجاوز وقتك المتاح إلا بما لا يمكن تأجيله، وتخبرك بالزيادة.", " every item gets a score from priority, closeness of its deadline, whether it can be postponed, how often it was postponed, and how long it has waited. The reasons show under each item. The plan never goes beyond your available time except for what can't be postponed, and tells you by how much.")}</p>
          <p style={{ margin: 0 }}><b style={{ color: 'var(--text)' }}>{L("تقدير المذاكرة:", "Study estimates:")}</b>{L(" حجم الفصول × صعوبتها × سرعتك المقاسة من جلساتك + وقت المراجعة. يُعرض كنطاق (أقل–أكثر) يضيق كلما سجلت جلسات أكثر. ثم أحاكي الأيام حتى الاختبار مقابل وقتك المتاح للمذاكرة وأوزع الوقت بين الاختبارات.", " chapter size × difficulty × your speed measured from your sessions + review time. Shown as a range (low–high) that narrows as you log more sessions. Then I simulate the days until the exam against your study time and split it between exams.")}</p>
          <p style={{ margin: 0 }}><b style={{ color: 'var(--text)' }}>{L("التعلم منك:", "Learning from you:")}</b>{L(" أقارن تقديراتك بالوقت الفعلي (المؤقت أو إجابتك بعد الإنجاز) وأصحح التقديرات القادمة. المهام التي لم تُنجز في يومها تعود مؤجلة ويُحسب تأجيلها.", " I compare your estimates with the real time (timer or your answer after finishing) and correct future estimates. Tasks not done on their day come back as postponed, and the postponement is counted.")}</p>
          <p style={{ margin: 0 }}><b style={{ color: 'var(--text)' }}>{L("ما لا يفعله:", "What it doesn't do:")}</b>{L(" لا يرسل رسائل ولا ملفات لأحد، ولا يعرف إلا ما أدخلته. يخرج من جهازك فقط: نسخة مشفّرة لسكربت قوقل الخاص بك إذا فعّلت المزامنة، وما يحتاجه Claude إذا أضفت مفتاحك (خطتك، مصاريفك المختصرة، نبذتك، المحادثة، وصورة الجدول إن أرسلتها) — لـAnthropic فقط لكتابة الرد.", " it never sends messages or files to anyone and knows only what you entered. All that leaves your device: an encrypted copy to your own Google script if you turn on sync, and what Claude needs if you add your key (your plan, a spending summary, your about-me, the chat, and a timetable photo if you send one) — to Anthropic only, to write the reply.")}</p>
          <p style={{ margin: 0 }}><b style={{ color: 'var(--text)' }}>{L("اختصارات:", "Shortcuts:")}</b> <span className="kbd">N</span>{L(" إضافة سريعة · ", " quick add · ")}<span className="kbd">/</span>{L(" بحث · ", " search · ")}<span className="kbd">G</span> <span className="kbd">T</span>{L(" للتنقل · ", " to move around · ")}<button className="btn sm ghost" onClick={() => openSheet({ type: 'shortcuts' })}><span className="kbd">?</span>{L(" كل الاختصارات", " All shortcuts")}</button></p>
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
  // moves every day in the group by the same amount, so per-day tweaks survive
  const setGroup = (key: 'available' | 'studyCap', days: number[], v: number) => {
    const arr = [...st[key]];
    const delta = v - avg(key, days);
    for (const d of days) arr[d] = Math.max(0, arr[d] + delta);
    A.updateSettings({ [key]: arr } as never);
  };
  const setDay = (key: 'available' | 'studyCap', i: number, v: number) => {
    const arr = [...st[key]];
    arr[i] = Math.max(0, v);
    A.updateSettings({ [key]: arr } as never);
  };
  const avg = (key: 'available' | 'studyCap', days: number[]) => Math.round(days.reduce((a, d) => a + st[key][d], 0) / days.length / 15) * 15;
  const fmt = (m: number) => (m ? fmtMinutes(m) : L('لا شيء', "None"));
  return (
    <div className="col" style={{ gap: 14 }}>
      {[
        { label: L('الأحد – الخميس', "Sunday – Thursday"), days: WEEKDAYS },
        { label: L('الجمعة – السبت', "Friday – Saturday"), days: WEEKEND },
      ].map((g) => (
        <div key={g.label} className="col" style={{ gap: 8 }}>
          <div style={{ fontWeight: 600 }}>{g.label}</div>
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="muted small">{L("وقت حر", "Free time")}</span>
            <Stepper value={avg('available', g.days)} onChange={(v) => setGroup('available', g.days, v)} format={fmt} />
          </div>
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="muted small">{L("منه مذاكرة بحد أقصى", "Of which study, at most")}</span>
            <Stepper value={avg('studyCap', g.days)} onChange={(v) => setGroup('studyCap', g.days, v)} format={fmt} />
          </div>
        </div>
      ))}
      <Collapse title={L("تخصيص كل يوم على حدة", "Customise each day")}>
        <div className="col" style={{ gap: 10 }}>
          {dayNames().map((d, i) => (
            <div key={d} className="row between wrap" style={{ gap: 8 }}>
              <span style={{ width: 70 }}>{d}</span>
              <Stepper value={st.available[i]} onChange={(v) => setDay('available', i, v)} format={fmt} />
              <Stepper value={st.studyCap[i]} onChange={(v) => setDay('studyCap', i, v)} format={(m) => L(`مذاكرة ${fmt(m)}`, `Study ${fmt(m)}`)} />
            </div>
          ))}
        </div>
      </Collapse>
      <div className="fields two">
        <div className="field">
          <label>{L("ينتهي يومك عادةً", "Your day usually ends at")}</label>
          <input type="time" className="input" value={st.dayEnd} onChange={(e) => A.updateSettings({ dayEnd: e.target.value || '23:30' })} />
        </div>
        <div className="field">
          <label>{L("وقت المراجعة فوق المذاكرة", "Review time on top of study")}</label>
          <select className="select" value={st.reviewFactor} onChange={(e) => A.updateSettings({ reviewFactor: +e.target.value })}>
            {[0, 0.1, 0.2, 0.3, 0.5].map((x) => <option key={x} value={x}>{Math.round(x * 100)}%</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function CoachSettings() {
  const st = useApp().settings;
  const c = st.coach;
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(hasAiKey());
  const [testing, setTesting] = useState(false);
  const tones: { v: CoachTone; l: string; d: string }[] = [
    { v: 'gentle', l: L('لطيف', 'Gentle'), d: L('تحفيز فقط، بدون توبيخ.', 'Encouragement only, no scolding.') },
    { v: 'firm', l: L('حازم', 'Firm'), d: L('صريح ويشد عليك إذا تأخرت.', 'Honest, and firm when you fall behind.') },
    { v: 'harsh', l: L('شديد', 'Harsh'), d: L('توبيخ قاسٍ بقدر تأخيرك — بدون مجاملة.', 'Harsh scolding in proportion to your delay — no sugar-coating.') },
  ];
  // the key is kept only after Claude accepts it
  const save = async () => {
    if (!key.trim()) return;
    setTesting(true);
    try {
      await testAiKey(key);
      setAiKey(key);
      setSaved(true);
      setKey('');
      toast(L('تم الاتصال بـClaude ✓', 'Connected to Claude ✓'));
    } catch (e: any) {
      toast(e?.message || String(e));
    } finally {
      setTesting(false);
    }
  };
  const remove = () => {
    if (!confirm(L('حذف مفتاح Claude من هذا الجهاز؟', 'Remove the Claude key from this device?'))) return;
    setAiKey('');
    setSaved(false);
    toast(L('حُذف المفتاح من هذا الجهاز', 'Key removed from this device'));
  };
  const masked = (k: string) => `${k.slice(0, 7)}…${k.slice(-4)}`;
  return (
    <>
      <div className="row between">
        <div>
          <div style={{ fontWeight: 500 }}>{L("رسالة المدرب في صفحة اليوم", "Coach message on Today")}</div>
          <div className="faint tiny">{L("تتغير حسب إنجازك وتأخيرك.", "Changes with what you finish and what's late.")}</div>
        </div>
        <Switch on={c.enabled} onChange={(v) => A.updateCoach({ enabled: v })} label={L("المدرب", "Coach")} />
      </div>
      <div className="field">
        <label>{L("أسلوب المدرب", "Coach style")}</label>
        <Seg value={c.tone} options={tones.map((t) => ({ v: t.v, l: t.l }))} onChange={(v) => A.updateCoach({ tone: v })} />
        <div className="faint tiny">{tones.find((t) => t.v === c.tone)?.d}</div>
      </div>
      <div className="field">
        <label>{L("عرّف المدرب عليك", "Tell the coach about you")}</label>
        <textarea
          className="textarea"
          value={c.about}
          onChange={(e) => A.updateCoach({ about: e.target.value })}
          placeholder={L("مثال: أشتغل الصبح وأدرس بالليل، أأجل لما أتعب، يحمسني الكلام المباشر…", "e.g. I work mornings and study at night, I postpone when tired, direct talk motivates me…")}
        />
      </div>
      <div className="field">
        <label htmlFor="ai-key">{L("مفتاح Claude (اختياري)", "Claude key (optional)")}</label>
        {saved ? (
          <div className="row" style={{ gap: 8 }}>
            <code className="grow" dir="ltr">{masked(getAiKey())}</code>
            <button className="btn sm danger" onClick={remove}><Icon name="trash" size={15} />{L(' حذف المفتاح', ' Remove key')}</button>
          </div>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            <input id="ai-key" className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" dir="ltr" />
            <button className="btn primary" onClick={save} disabled={testing || !key.trim()}>{testing ? L('يتحقق…', 'Checking…') : L('حفظ', 'Save')}</button>
          </div>
        )}
        <div className="faint tiny">
          {saved ? L('مفعّل — الرسائل والمحادثة يكتبها Claude.', 'On — messages and chat are written by Claude.') : L('بدون مفتاح يكتب المدرب رسائل جاهزة من بياناتك.', 'Without a key the coach uses built-in messages based on your data.')}{' '}
          {L('المفتاح من console.anthropic.com (مدفوع بالاستخدام، منفصل عن اشتراك Claude — يُفضّل مفتاح بحد إنفاق). يبقى على هذا الجهاز فقط ولا يدخل في النسخ الاحتياطية أو النقل. عند الاستخدام تُرسل لـAnthropic خطتك ومختصر مصاريفك ونبذتك والمحادثة لكتابة الرد.', "Get one at console.anthropic.com (pay-as-you-go, separate from a Claude subscription — a key with a spend limit is best). It stays on this device only and isn't included in backups or transfers. When used, your plan, a spending summary, your about-me and the chat are sent to Anthropic to write the reply.")}
        </div>
      </div>
    </>
  );
}
