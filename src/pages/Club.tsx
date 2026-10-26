import { useEffect, useMemo, useState } from 'react';
import { Check, Empty, Ring, Seg, Sheet, Switch, useNow } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { PageTop } from '../ui/PageTop';
import { closeSheet, openSheet } from '../ui/sheets';
import { go, useRoute } from '../ui/router';
import { toast } from '../ui/toast';
import * as A from '../lib/actions';
import { addDays, dateKey, diffDays, fmtDate, timeAgo, todayKey } from '../lib/dates';
import { clubServerCode } from '../lib/clubServer';
import {
  act, activeDaysInWeek, badges, clubRate, connectAsManager, disconnect, isActiveDay, isStaff, join, joinLink, lastActive, memberName, newClubSetup, parseJoinLink, rate, refresh, roleName,
  setClubConf, stars, stopped, streak, toggleClubTask, useClub, weeklyDone, weekReport, weekStartOf, type ClubMember, type ClubPost, type ClubTask, type ClubView,
} from '../lib/club';
import { L } from '../lib/i18n';

// «النادي» answers, in this order:
//  1. what does the club ask of me today, and how am I keeping up? → «يومي»
//  2. what are the others saying? → «النقاش»
//  3. who's in it? → «الأعضاء»
//  4. (manager / supervisor) who needs a hand, who's waiting to join, how did the week go? → «الإدارة»

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const tryIt = async (fn: () => Promise<unknown>, ok?: string) => {
  try {
    await fn();
    if (ok) toast(ok);
    return true;
  } catch (e) {
    toast((e as Error).message);
    return false;
  }
};
async function copy(text: string, ok: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    prompt(L('انسخ:', 'Copy:'), text);
  }
}

export function Club() {
  const r = useRoute();
  const c = useClub();
  if (r.id === 'join') return <JoinView />;
  if (!c.conf) return <Landing />;
  if (!c.view) return <Connecting />;
  const v = c.view;
  if (v.me.status === 'pending') return <Waiting v={v} />;
  if (v.me.status !== 'active') return <Outside v={v} />;
  return <ClubHome v={v} />;
}

// ---------------- before you're in ----------------

function Landing() {
  return (
    <div>
      <PageTop title={L('النادي', 'Club')} sub={L('ناس يلتزمون مع بعض، ومدير يتابع كل واحد عشان ما يضيع أحد.', 'People keeping at it together, with a manager who keeps an eye on everyone.')} />
      <section className="cl-land">
        <div className="cl-land-card">
          <b>{L('عندك رابط نادي؟', 'Got a club link?')}</b>
          <span>{L('افتح الرابط اللي وصلك من مدير النادي، وتطلع لك صفحة الانضمام.', 'Open the link the club manager sent you to get the join page.')}</span>
        </div>
        <div className="cl-land-card acc">
          <b>{L('سوّ ناديك', 'Start a club')}</b>
          <span>{L('أنت المدير: تضيف مهام وتحديات، تقبل الأعضاء، وتتابع التزام كل واحد. النادي يعيش في حساب قوقل حقك، مو عندنا.', 'You run it: add tasks and challenges, accept members, follow everyone. The club lives in your own Google account, not with us.')}</span>
          <button className="btn primary" onClick={() => openSheet({ type: 'club-setup' })}><Icon name="plus" size={15} /> {L('ابدأ نادي جديد', 'Start a new club')}</button>
        </div>
        <ul className="cl-what">
          <li>{L('مهام يومية وتحديات أسبوعية للنادي، تظهر في صفحة «اليوم» مع مهامك.', 'Daily club tasks and weekly challenges, shown on your Today page.')}</li>
          <li>{L('تسلسل أيام الإنجاز ونسبة التزامك، وشارات على اللي سويته.', 'Your streak, how much you kept up, and badges for what you did.')}</li>
          <li>{L('مهامك الخاصة تبقى لك. اللي يطلع للنادي: اسمك ومهام النادي اللي خلصتها، وعدد مهامك المنجزة لو سمحت بس.', 'Your own tasks stay yours. The club sees your name and the club tasks you did — and, only if you allow it, how many of your tasks you finished.')}</li>
        </ul>
      </section>
    </div>
  );
}

function JoinView() {
  const r = useRoute();
  const c = useClub();
  const link = parseJoinLink(r.query);
  const [name, setName] = useState('');
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!link) return <div><PageTop title={L('الانضمام لنادي', 'Join a club')} /><Empty icon="alert" title={L('الرابط ناقص أو مو لنادي', "This link isn't a club link")}>{L('اطلب الرابط من جديد من مدير النادي.', 'Ask the club manager for the link again.')}</Empty></div>;
  if (c.conf && c.conf.url !== link.url && c.view) {
    return (
      <div>
        <PageTop title={L('الانضمام لنادي', 'Join a club')} />
        <div className="notice"><Icon name="info" size={18} /><div>{L(`هذا الجهاز مربوط بنادي «${c.view.club.name}». تقدر تكون في نادي واحد على الجهاز — اطلع منه أول من «إعداداتي في النادي».`, `This device is linked to “${c.view.club.name}”. One club per device — leave it first from “My club settings”.`)}</div></div>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => go('club')}>{L('رجوع للنادي', 'Back to the club')}</button>
      </div>
    );
  }
  return (
    <div>
      <PageTop title={L('الانضمام لنادي', 'Join a club')} sub={L('مدير النادي يشوف طلبك ويقبله.', 'The club manager will see your request and accept it.')} />
      <div className="cl-form">
        <label className="field"><span>{L('اسمك في النادي', 'Your name in the club')}</span><input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={L('مثلًا: أبو فهد', 'e.g. Sam')} /></label>
        <div className="cl-switch"><span><b>{L('شارك عدد مهامي المنجزة يوميًا', 'Share how many tasks I finish each day')}</b><small>{L('الرقم بس، بدون أسماء المهام. تقدر تغيّرها بعدين.', 'The number only, never the tasks. You can change it later.')}</small></span><Switch on={share} onChange={setShare} label={L('شارك العدد', 'Share the number')} /></div>
        <button className="btn primary" disabled={busy || !name.trim()} onClick={async () => {
          setBusy(true);
          const ok = await tryIt(() => join(link.url, link.code, name, share));
          setBusy(false);
          if (ok) go('club');
        }}>{busy ? L('لحظة…', 'One moment…') : L('اطلب الانضمام', 'Ask to join')}</button>
      </div>
    </div>
  );
}

function Connecting() {
  const c = useClub();
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <div>
      <PageTop title={L('النادي', 'Club')} />
      <Empty icon="clock" title={c.error ? L('ما قدرت أوصل للنادي', "Couldn't reach the club") : L('أفتح النادي…', 'Opening the club…')}>{c.error}</Empty>
      {c.error && <div className="row" style={{ justifyContent: 'center' }}><button className="btn" disabled={c.busy} onClick={() => void refresh()}><Icon name="repeat" size={14} /> {L('حاول مرة ثانية', 'Try again')}</button></div>}
    </div>
  );
}

function Waiting({ v }: { v: ClubView }) {
  const c = useClub();
  return (
    <div>
      <PageTop title={v.club.name} />
      <Empty icon="clock" title={L('طلبك عند المدير', 'Your request is with the manager')}>
        {L('أول ما يقبلك تبدأ معهم. نتحقق كل كم دقيقة.', "As soon as you're accepted you're in. We check every few minutes.")}
      </Empty>
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        <button className="btn" disabled={c.busy} onClick={() => void refresh()}><Icon name="repeat" size={14} /> {L('تحقق الحين', 'Check now')}</button>
        <button className="btn ghost" onClick={() => { if (confirm(L('تلغي الطلب من هذا الجهاز؟', 'Cancel the request on this device?'))) disconnect(); }}>{L('إلغاء', 'Cancel')}</button>
      </div>
    </div>
  );
}

function Outside({ v }: { v: ClubView }) {
  return (
    <div>
      <PageTop title={v.club.name} />
      <Empty icon="info" title={v.me.status === 'rejected' ? L('ما انقبل طلبك هالمرة', "Your request wasn't accepted this time") : L('أنت خارج النادي الحين', "You're not in the club right now")}>
        {L('سجلك محفوظ عند النادي. تقدر تطلب الانضمام من جديد برابط من المدير.', 'Your history is kept. You can ask to join again with a link from the manager.')}
      </Empty>
      <div className="row" style={{ justifyContent: 'center' }}><button className="btn" onClick={disconnect}>{L('افصل الجهاز عن النادي', 'Unlink this device')}</button></div>
    </div>
  );
}

// ---------------- inside ----------------

type Tab = 'day' | 'talk' | 'people' | 'admin';

function ClubHome({ v }: { v: ClubView }) {
  const r = useRoute();
  const c = useClub();
  const staff = isStaff(v);
  const tab: Tab = r.id === 'talk' || r.id === 'people' || (r.id === 'admin' && staff) ? (r.id as Tab) : 'day';
  const now = useNow(60_000);
  const today = todayKey(now);
  const req = staff ? v.members.filter((m) => m.status === 'pending').length : 0;
  const active = v.members.filter((m) => m.status === 'active').length;
  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div>
      <PageTop
        title={v.club.name}
        sub={`${roleName(v.me.role)} · ${active === 1 ? L('عضو واحد', 'one member') : L(`${active} عضو`, `${active} members`)}${c.error ? L(' · ما قدرت أحدّث', ' · couldn’t update') : ''}`}
        actions={<button className="icon-btn" onClick={() => openSheet({ type: 'club-me' })} aria-label={L('إعداداتي في النادي', 'My club settings')}><Icon name="settings" /></button>}
      />
      <div style={{ marginBottom: 14 }}>
        <Seg value={tab} onChange={(t) => go(t === 'day' ? 'club' : `club/${t}`)} label={L('أقسام النادي', 'Club sections')} options={[
          { v: 'day', l: L('يومي', 'My day') },
          { v: 'talk', l: L('النقاش', 'Talk') },
          { v: 'people', l: L('الأعضاء', 'Members') },
          ...(staff ? [{ v: 'admin' as Tab, l: <>{L('الإدارة', 'Manage')}{req ? <span className="cl-dot-n">{req}</span> : null}</> }] : []),
        ]} />
      </div>
      {tab === 'day' ? <DayTab v={v} today={today} /> : tab === 'talk' ? <TalkTab v={v} /> : tab === 'people' ? <PeopleTab v={v} today={today} /> : <AdminTab v={v} today={today} />}
    </div>
  );
}

/** a row of seven days: filled where something got done */
function WeekDots({ v, id, today }: { v: ClubView; id: string; today: string }) {
  const w = weekStartOf(today);
  const c = v.checks[id] || {};
  return (
    <div className="cl-week" role="img" aria-label={L(`أنجز ${activeDaysInWeek(v, id, today)} أيام هالأسبوع`, `${activeDaysInWeek(v, id, today)} days this week`)}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(w, i);
        return (
          <span key={d} className={`${isActiveDay(c[d]) ? 'on' : ''} ${d === today ? 'today' : ''} ${d > today ? 'later' : ''}`}>
            <i />
            <small>{L('ح ن ث ر خ ج س', 'S M T W T F S').split(' ')[i]}</small>
          </span>
        );
      })}
    </div>
  );
}

function TaskRow({ v, t, today }: { v: ClubView; t: ClubTask; today: string }) {
  const done = t.kind === 'weekly' ? weeklyDone(v, v.me.id, t.id, today) : !!v.checks[v.me.id]?.[today]?.t.includes(t.id);
  const doneToday = !!v.checks[v.me.id]?.[today]?.t.includes(t.id);
  // a weekly task ticked on an earlier day is done; it can only be un-ticked on the day it was ticked
  const locked = t.kind === 'weekly' && done && !doneToday;
  return (
    <div className={`cl-task ${done ? 'done' : ''}`}>
      {locked ? <span className="check on" aria-label={L('منجزة هالأسبوع', 'Done this week')}><Icon name="check" size={14} stroke={3} /></span> : <Check on={done} onClick={() => void toggleClubTask(t.id)} label={done ? L(`إلغاء إنجاز ${t.title}`, `Undo ${t.title}`) : L(`أنجزت ${t.title}`, `Done: ${t.title}`)} />}
      <span className="m"><bdi>{t.title}</bdi>{t.note ? <small>{t.note}</small> : null}</span>
      <button className="icon-btn sm" aria-label={L(`أضف «${t.title}» لمهامي`, `Add “${t.title}” to my tasks`)} title={L('أضف لمهامي', 'Add to my tasks')} onClick={() => {
        A.addTask({ title: t.title, due: today, notes: L(`من النادي: ${v.club.name}`, `From the club: ${v.club.name}`) });
        toast(L('انضافت لمهامك اليوم — لما تخلصها علّمها هنا بعد', 'Added to today’s tasks — tick it here too when done'));
      }}><Icon name="calplus" size={16} /></button>
    </div>
  );
}

/** your own counts this week — compared only with your own last week */
function selfCompare(v: ClubView, today: string): string {
  const now = activeDaysInWeek(v, v.me.id, today);
  const before = activeDaysInWeek(v, v.me.id, addDays(today, -7));
  if (!now && !before) return L('كل يوم فيه خطوة صغيرة يحسب لك.', 'Every day with one small step counts.');
  if (now > before) return L(`أحسن من الأسبوع اللي فات (${before}) 👏`, `Better than last week (${before}) 👏`);
  if (now === before) return L('نفس الأسبوع اللي فات، استمر.', 'Same as last week — keep going.');
  return L(`الأسبوع اللي فات ${before} — باقي أيام تلحق فيها.`, `${before} last week — there are days left to catch up.`);
}

function DayTab({ v, today }: { v: ClubView; today: string }) {
  const daily = v.tasks.filter((t) => t.kind === 'daily' && !t.archived);
  const weekly = v.tasks.filter((t) => t.kind === 'weekly' && !t.archived);
  const st = streak(v.checks[v.me.id], today);
  const my = rate(v, v.me.id, today);
  const club = clubRate(v, today);
  const b = badges(v, v.me.id, today);
  const top = stars(v, today);
  const msg = [...v.msgs].filter((m) => m.to === 'all' || m.to === v.me.id).sort((a, x) => x.at - a.at)[0];
  const doneToday = daily.filter((t) => v.checks[v.me.id]?.[today]?.t.includes(t.id)).length;

  return (
    <>
      <section className="cl-hero">
        <div className="cl-streak">
          <b className="num">{st}</b>
          <span>{st === 0 ? L('ابدأ تسلسلك اليوم', 'Start your streak today') : st === 1 ? L('يوم إنجاز 🔥', 'day done 🔥') : L('أيام ورا بعض 🔥', 'days in a row 🔥')}</span>
        </div>
        <div className="cl-rates">
          <div><Ring value={my ?? 0} size={46} label={pct(my)} /><span>{L('التزامي', 'Me')}</span></div>
          <div><Ring value={club ?? 0} size={46} color="var(--green, #2FA98C)" label={pct(club)} /><span>{L('النادي', 'Club')}</span></div>
        </div>
        <WeekDots v={v} id={v.me.id} today={today} />
        <p className="cl-self">{selfCompare(v, today)}</p>
      </section>

      {msg && (
        <section className="cl-msg">
          <b>{msg.to === 'all' ? L(`من ${memberName(v, msg.from)} للكل`, `From ${memberName(v, msg.from)} to all`) : L(`رسالة لك من ${memberName(v, msg.from)}`, `A message from ${memberName(v, msg.from)}`)}</b>
          <p>{msg.text}</p>
          <small>{timeAgo(msg.at)}</small>
        </section>
      )}

      <section>
        <div className="group-title"><span className="sh-h2">{L('مهام النادي اليوم', 'Club tasks today')}</span>{daily.length > 0 && <span className="faint small num">{doneToday}/{daily.length}</span>}</div>
        {daily.length ? <div className="cl-list">{daily.map((t) => <TaskRow key={t.id} v={v} t={t} today={today} />)}</div> : <p className="faint small">{isStaff(v) ? L('ما فيه مهام يومية. أضفها من «الإدارة».', 'No daily tasks yet. Add them under “Manage”.') : L('المدير ما أضاف مهام يومية بعد. إنجازك لمهامك الخاصة يحسب لك لو شاركت العدد.', 'No daily tasks yet. Your own tasks count if you share the number.')}</p>}
      </section>

      {weekly.length > 0 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('تحديات الأسبوع', 'This week’s challenges')}</span></div>
          <div className="cl-list">{weekly.map((t) => <TaskRow key={t.id} v={v} t={t} today={today} />)}</div>
        </section>
      )}

      {b.length > 0 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('شاراتي', 'My badges')}</span></div>
          <div className="cl-badges">{b.map((x) => <span key={x.id} className="cl-badge" title={x.why}><i aria-hidden>{x.icon}</i>{x.title}</span>)}</div>
        </section>
      )}

      {top.length > 0 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('نجوم الأسبوع', 'Stars of the week')}</span></div>
          <div className="cl-stars">
            {top.map((x) => (
              <button key={x.m.id} className="cl-star" onClick={() => openSheet({ type: 'club-member', id: x.m.id })}>
                <Avatar name={x.m.name} />
                <bdi>{x.m.name}</bdi>
                <small className="num">{L(`${x.days} من ٧`, `${x.days} of 7`)}</small>
              </button>
            ))}
          </div>
          <p className="faint tiny">{L('اللي أنجزوا أكثر أيام هالأسبوع. ما فيه ترتيب للباقين — كل واحد يقارن نفسه بنفسه.', 'Most days done this week. Nobody else is ranked — everyone compares with themselves.')}</p>
        </section>
      )}
    </>
  );
}

function Avatar({ name }: { name: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(h) % 360;
  return <span className="cl-av" aria-hidden style={{ background: `hsl(${hue} 55% 88%)`, color: `hsl(${hue} 45% 30%)` }}>{[...name.trim()][0] || '؟'}</span>;
}

// ---------------- talk ----------------

const CHEERS = ['👏', '🔥', '💪', '❤️'];

function PostCard({ v, p, replies }: { v: ClubView; p: ClubPost; replies: ClubPost[] }) {
  const [reply, setReply] = useState(false);
  const [text, setText] = useState('');
  const staff = isStaff(v);
  const counts = CHEERS.map((e) => ({ e, n: Object.values(p.cheers || {}).filter((x) => x === e).length, me: p.cheers?.[v.me.id] === e }));
  return (
    <article className={`cl-post ${p.hidden ? 'hidden' : ''}`}>
      <header>
        <Avatar name={memberName(v, p.by)} />
        <span><b><bdi>{memberName(v, p.by)}</bdi></b><small>{timeAgo(p.at)}{p.hidden ? L(' · مخفية', ' · hidden') : ''}</small></span>
        {(staff || p.by === v.me.id) && <button className="btn ghost sm" onClick={() => void tryIt(() => act({ a: 'hide', post: p.id, on: !p.hidden }))}>{p.hidden ? L('أظهرها', 'Show') : L('أخفها', 'Hide')}</button>}
      </header>
      <p>{p.text}</p>
      <div className="cl-cheers">
        {counts.map((c) => (
          <button key={c.e} className={c.me ? 'on' : ''} aria-pressed={c.me} aria-label={L(`تشجيع ${c.e}`, `Cheer ${c.e}`)} onClick={() => void tryIt(() => act({ a: 'cheer', post: p.id, e: c.e }))}>{c.e}{c.n ? <span className="num">{c.n}</span> : null}</button>
        ))}
        <button className="cl-reply" onClick={() => setReply(!reply)}>{L('رد', 'Reply')}{replies.length ? ` · ${replies.length}` : ''}</button>
      </div>
      {replies.length > 0 && (
        <div className="cl-replies">
          {replies.map((r) => (
            <div key={r.id} className="cl-r"><b><bdi>{memberName(v, r.by)}</bdi></b> {r.text} <small>{timeAgo(r.at)}</small></div>
          ))}
        </div>
      )}
      {reply && (
        <div className="cl-compose sm">
          <input className="input" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={L('ردّك…', 'Your reply…')} />
          <button className="btn primary sm" disabled={!text.trim()} onClick={async () => { if (await tryIt(() => act({ a: 'post', text, parent: p.id }))) { setText(''); setReply(false); } }}>{L('أرسل', 'Send')}</button>
        </div>
      )}
    </article>
  );
}

function TalkTab({ v }: { v: ClubView }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(30);
  const top = useMemo(() => v.posts.filter((p) => !p.parent).sort((a, b) => b.at - a.at), [v.posts]);
  const kids = useMemo(() => {
    const m = new Map<string, ClubPost[]>();
    for (const p of v.posts) if (p.parent) m.set(p.parent, [...(m.get(p.parent) || []), p]);
    for (const l of m.values()) l.sort((a, b) => a.at - b.at);
    return m;
  }, [v.posts]);
  return (
    <>
      <div className="cl-compose">
        <textarea className="input" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={L('شارك إنجازك، اسأل، أو شجّع أحد…', 'Share a win, ask, or cheer someone on…')} aria-label={L('مشاركة جديدة', 'New post')} />
        <button className="btn primary" disabled={!text.trim() || busy} onClick={async () => { setBusy(true); if (await tryIt(() => act({ a: 'post', text }))) setText(''); setBusy(false); }}>{L('انشر', 'Post')}</button>
      </div>
      {top.length ? (
        <div className="cl-feed">
          {top.slice(0, limit).map((p) => <PostCard key={p.id} v={v} p={p} replies={kids.get(p.id) || []} />)}
          {top.length > limit && <button className="btn ghost" onClick={() => setLimit(limit + 30)}>{L('اعرض أقدم', 'Show older')}</button>}
        </div>
      ) : (
        <Empty icon="note" title={L('النقاش فاضي', 'No posts yet')}>{L('كن أول واحد يكتب — حتى «بدأت اليوم» تكفي.', 'Be the first — even “started today” is enough.')}</Empty>
      )}
    </>
  );
}

// ---------------- members ----------------

function PeopleTab({ v, today }: { v: ClubView; today: string }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const staff = isStaff(v);
  const list = v.members
    .filter((m) => m.status === 'active' && (!q.trim() || m.name.includes(q.trim())))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : a.role === 'sup' ? -1 : 1));
  return (
    <>
      {v.members.filter((m) => m.status === 'active').length > 8 && <input className="input" style={{ marginBottom: 10 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('ابحث بالاسم', 'Search by name')} aria-label={L('ابحث بالاسم', 'Search by name')} />}
      <div className="cl-people">
        {list.slice(0, limit).map((m) => <PersonRow key={m.id} v={v} m={m} today={today} showRate={staff} />)}
      </div>
      {list.length > limit && <button className="btn ghost" onClick={() => setLimit(limit + 60)}>{L(`اعرض المزيد (${list.length - limit})`, `Show more (${list.length - limit})`)}</button>}
      {!list.length && <p className="faint small">{L('ما فيه أحد بهالاسم.', 'Nobody by that name.')}</p>}
    </>
  );
}

function PersonRow({ v, m, today, showRate, extra }: { v: ClubView; m: ClubMember; today: string; showRate?: boolean; extra?: React.ReactNode }) {
  const st = streak(v.checks[m.id], today);
  const last = lastActive(v.checks[m.id]);
  return (
    <button className="cl-person" onClick={() => openSheet({ type: 'club-member', id: m.id })}>
      <Avatar name={m.name} />
      <span className="m">
        <b><bdi>{m.name}</bdi>{m.role !== 'member' && <em>{roleName(m.role)}</em>}{m.id === v.me.id && <em className="me">{L('أنت', 'You')}</em>}</b>
        <span>{extra || (last ? (last === today ? L('أنجز اليوم', 'Done today') : L(`آخر إنجاز ${fmtDate(last, false)}`, `Last done ${fmtDate(last, false)}`)) : L('ما بدأ بعد', 'Not started yet'))}</span>
      </span>
      {st > 0 && <span className="cl-st num">🔥{st}</span>}
      {showRate && <span className="cl-rt num">{pct(rate(v, m.id, today))}</span>}
      <Icon name="chevron" size={14} className="chev-end" />
    </button>
  );
}

// ---------------- manage ----------------

function AdminTab({ v, today }: { v: ClubView; today: string }) {
  const c = useClub();
  const admin = v.me.role === 'admin';
  const pending = v.members.filter((m) => m.status === 'pending');
  const quiet = stopped(v, today);
  const [weekOf, setWeekOf] = useState(today);
  const rep = weekReport(v, weekOf);
  const left = v.members.filter((m) => m.status === 'left');
  const [showQuiet, setShowQuiet] = useState(10);
  const link = c.conf ? joinLink(c.conf, v) : '';

  const csv = () => {
    const rows = [[L('الاسم', 'Name'), L('الدور', 'Role'), L('التسلسل', 'Streak'), L('الالتزام ٧ أيام', '7-day rate'), L('أيام الأسبوع', 'Days this week'), L('آخر إنجاز', 'Last done')]];
    for (const m of v.members.filter((x) => x.status === 'active')) rows.push([m.name, roleName(m.role), String(streak(v.checks[m.id], today)), pct(rate(v, m.id, today)), String(activeDaysInWeek(v, m.id, today)), lastActive(v.checks[m.id]) || '']);
    const text = '﻿' + rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = `club-${today}.csv`;
    a.click();
  };

  return (
    <>
      <section className="cl-card">
        <b>{L('رابط الانضمام', 'Join link')}</b>
        <span className="faint small">{v.club.auto ? L('أي أحد معه الرابط يدخل على طول.', 'Anyone with the link gets straight in.') : L('اللي يفتح الرابط يرسل طلب، وتقبله أنت أو المشرف.', 'Whoever opens it sends a request you or a supervisor accept.')}</span>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn sm primary" onClick={() => void copy(link, L('نُسخ الرابط ✓', 'Link copied ✓'))}><Icon name="copy" size={14} /> {L('انسخ الرابط', 'Copy link')}</button>
          {'share' in navigator && <button className="btn sm" onClick={() => void navigator.share({ title: v.club.name, text: L(`انضم لنادي «${v.club.name}» في مدار`, `Join “${v.club.name}” on Madar`), url: link }).catch(() => null)}><Icon name="share" size={14} /> {L('شارك', 'Share')}</button>}
        </div>
      </section>

      <section>
        <div className="group-title"><span className="sh-h2">{L('طلبات الانضمام', 'Join requests')}</span>{pending.length > 0 && <span className="faint small num">{pending.length}</span>}</div>
        {pending.length ? (
          <div className="cl-people">
            {pending.map((m) => (
              <div key={m.id} className="cl-req">
                <Avatar name={m.name} />
                <span className="m"><b><bdi>{m.name}</bdi></b><small>{timeAgo(m.joined)}</small></span>
                <button className="btn sm primary" onClick={() => void tryIt(() => act({ a: 'approve', id: m.id }), L(`قبلت ${m.name}`, `Accepted ${m.name}`))}>{L('قبول', 'Accept')}</button>
                <button className="btn sm ghost" onClick={() => void tryIt(() => act({ a: 'reject', id: m.id }))}>{L('رفض', 'Decline')}</button>
              </div>
            ))}
            {pending.length > 1 && <button className="btn sm" onClick={() => void tryIt(async () => { for (const m of pending) await act({ a: 'approve', id: m.id }); }, L('قبلت الكل', 'Accepted all'))}>{L(`اقبل الكل (${pending.length})`, `Accept all (${pending.length})`)}</button>}
          </div>
        ) : <p className="faint small">{L('ما فيه طلبات الحين.', 'No requests right now.')}</p>}
      </section>

      <section>
        <div className="group-title"><span className="sh-h2">{L('يحتاجون التفاتة', 'Need a nudge')}</span>{quiet.length > 0 && <span className="faint small num">{quiet.length}</span>}</div>
        {quiet.length ? (
          <>
            <div className="cl-people">
              {quiet.slice(0, showQuiet).map(({ m, days }) => <PersonRow key={m.id} v={v} m={m} today={today} showRate extra={<span className="cl-warn">{L(`ما أنجز من ${days} أيام`, `Nothing for ${days} days`)}</span>} />)}
            </div>
            {quiet.length > showQuiet && <button className="btn ghost sm" onClick={() => setShowQuiet(showQuiet + 20)}>{L('اعرض الباقين', 'Show the rest')}</button>}
            <p className="faint tiny">{L('افتح ملف العضو وأرسل له رسالة لطيفة. هو ما يشوف هالقائمة.', 'Open their profile and send a kind word. They never see this list.')}</p>
          </>
        ) : <p className="faint small">{L('الكل ماشي — ما أحد متوقف ٣ أيام أو أكثر.', 'Everyone’s moving — nobody stopped for 3+ days.')}</p>}
      </section>

      <section>
        <div className="group-title"><span className="sh-h2">{L('مهام وتحديات النادي', 'Club tasks & challenges')}</span><button onClick={() => openSheet({ type: 'club-task' })}>{L('+ أضف', '+ Add')}</button></div>
        {v.tasks.filter((t) => !t.archived).length ? (
          <div className="cl-list">
            {v.tasks.filter((t) => !t.archived).map((t) => (
              <button key={t.id} className="cl-task admin" onClick={() => openSheet({ type: 'club-task', id: t.id })}>
                <em>{t.kind === 'weekly' ? L('أسبوعي', 'Weekly') : L('يومي', 'Daily')}</em>
                <span className="m"><bdi>{t.title}</bdi></span>
                <Icon name="chevron" size={14} className="chev-end" />
              </button>
            ))}
          </div>
        ) : <p className="faint small">{L('أضف أول مهمة يومية أو تحدي أسبوعي — تطلع لكل الأعضاء في صفحة «اليوم».', 'Add a first daily task or weekly challenge — every member sees it on Today.')}</p>}
      </section>

      <section>
        <div className="group-title"><span className="sh-h2">{L('رسالة للكل', 'Message everyone')}</span></div>
        <button className="btn" onClick={() => openSheet({ type: 'club-msg', to: 'all' })}><Icon name="send" size={14} /> {L('اكتب رسالة للأعضاء', 'Write to all members')}</button>
      </section>

      <section className="cl-card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <b>{L('تقرير الأسبوع', 'Weekly report')}</b>
          <span className="row" style={{ gap: 4 }}>
            <button className="icon-btn sm" aria-label={L('الأسبوع اللي قبل', 'Previous week')} onClick={() => setWeekOf(addDays(weekOf, -7))}><Icon name="back" size={14} /></button>
            <button className="icon-btn sm" aria-label={L('الأسبوع اللي بعد', 'Next week')} disabled={weekStartOf(weekOf) >= weekStartOf(today)} onClick={() => setWeekOf(addDays(weekOf, 7))}><Icon name="chevron" size={14} /></button>
          </span>
        </div>
        <span className="faint small">{fmtDate(rep.from, false)} – {fmtDate(rep.to, false)}</span>
        <div className="ss-sum">
          <div><b className="num">{rep.activeMembers}/{rep.members}</b><span>{L('أنجزوا', 'showed up')}</span></div>
          <div className="acc"><b className="num">{pct(rep.avgRate)}</b><span>{L('متوسط الالتزام', 'avg. rate')}</span></div>
          <div><b className="num">{rep.posts}</b><span>{L('مشاركة', 'posts')}</span></div>
        </div>
        {rep.tasks.length > 0 && (
          <div className="cl-rep">
            {rep.tasks.map(({ t, done }) => (
              <div key={t.id}><bdi>{t.title}</bdi><i><i style={{ width: `${rep.members ? (done / rep.members) * 100 : 0}%` }} /></i><span className="num">{done}/{rep.members}</span></div>
            ))}
          </div>
        )}
        <button className="btn sm" onClick={csv}><Icon name="download" size={14} /> {L('نزّل الأعضاء (CSV)', 'Download members (CSV)')}</button>
      </section>

      {admin && left.length > 0 && (
        <section>
          <div className="group-title"><span className="sh-h2">{L('طلعوا من النادي', 'Left the club')}</span><span className="faint small num">{left.length}</span></div>
          <div className="cl-people">{left.slice(0, 30).map((m) => <PersonRow key={m.id} v={v} m={m} today={today} extra={L('سجله محفوظ', 'History kept')} />)}</div>
        </section>
      )}
    </>
  );
}

// ---------------- sheets ----------------

export function ClubSetupSheet() {
  const [{ key, code }] = useState(newClubSetup);
  const [name, setName] = useState('');
  const [me, setMe] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={L('نادي جديد', 'New club')} onClose={closeSheet} footer={
      <button className="btn primary grow" disabled={busy || !url.trim() || !me.trim()} onClick={async () => {
        setBusy(true);
        const ok = await tryIt(() => connectAsManager(url, me), L('النادي جاهز 🎉 — انسخ رابط الانضمام من «الإدارة»', 'Your club is ready 🎉 — copy the join link under “Manage”'));
        setBusy(false);
        if (ok) { closeSheet(); go('club/admin'); }
      }}>{busy ? L('لحظة…', 'One moment…') : L('شغّل النادي', 'Start the club')}</button>
    }>
      <div className="cl-form">
        <label className="field"><span>{L('اسم النادي', 'Club name')}</span><input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={L('مثلًا: نادي الصباح', 'e.g. Morning club')} /></label>
        <label className="field"><span>{L('اسمك', 'Your name')}</span><input className="input" maxLength={60} value={me} onChange={(e) => setMe(e.target.value)} /></label>
        <ol className="cl-steps">
          <li>
            {L('انسخ كود النادي:', 'Copy the club code:')}{' '}
            <button className="btn sm" disabled={!name.trim()} onClick={() => void copy(clubServerCode(key, code, name.trim()), L('نُسخ الكود ✓', 'Code copied ✓'))}><Icon name="copy" size={14} /> {L('انسخ الكود', 'Copy code')}</button>
            {!name.trim() && <small className="faint"> {L('(اكتب اسم النادي أول)', '(type the club name first)')}</small>}
          </li>
          <li>{L('افتح ', 'Open ')}<a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com</a>{L(' بحسابك، امسح اللي فيه، والصق الكود.', ' with your account, clear it, and paste the code.')}</li>
          <li>{L('اضغط ', 'Press ')}<bdi dir="ltr">Deploy › New deployment › Web app</bdi>{L('. في ', '. Set ')}<bdi dir="ltr">Execute as</bdi>{L(' اختر نفسك، وفي ', ' to you and ')}<bdi dir="ltr">Who has access</bdi>{L(' اختر ', ' to ')}<bdi dir="ltr">Anyone</bdi>{L('. وافق على صلاحية Drive، عشان يحفظ ملف النادي.', '. Allow Drive — it keeps the club file.')}</li>
          <li>{L('انسخ رابط ', 'Copy the ')}<bdi dir="ltr">Web app</bdi>{L(' والصقه هنا:', ' link and paste it here:')}</li>
        </ol>
        <input className="input" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" aria-label={L('رابط تطبيق الويب', 'Web app link')} />
        <div className="notice"><Icon name="shield" size={18} /><div>{L('الكود فيه مفتاح المدير — لا ترسله لأحد. الأعضاء ينضمون برابط ثاني تاخذه من «الإدارة».', 'The code holds the manager key — never send it. Members join with a separate link from “Manage”.')}</div></div>
      </div>
    </Sheet>
  );
}

export function ClubMemberSheet({ id }: { id: string }) {
  const c = useClub();
  const v = c.view;
  const now = useNow(60_000);
  if (!v) return null;
  const today = todayKey(now);
  const m = v.members.find((x) => x.id === id);
  if (!m) return null;
  const staff = isStaff(v);
  const admin = v.me.role === 'admin';
  const chk = v.checks[m.id] || {};
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));
  const b = badges(v, m.id, today);
  const st = streak(chk, today);
  const last = lastActive(chk);
  const posts = v.posts.filter((p) => p.by === m.id && !p.hidden).length;
  const showNumbers = staff || m.id === v.me.id;
  return (
    <Sheet title={<bdi>{m.name}</bdi>} onClose={closeSheet}>
      <div className="cl-form">
        <div className="cl-prof">
          <Avatar name={m.name} />
          <span>{roleName(m.role)} · {L(`انضم ${fmtDate(dateKey(new Date(m.joined)), false)}`, `joined ${fmtDate(dateKey(new Date(m.joined)), false)}`)}</span>
        </div>
        <div className="ss-sum">
          <div><b className="num">🔥{st}</b><span>{L('التسلسل', 'Streak')}</span></div>
          {showNumbers && <div className="acc"><b className="num">{pct(rate(v, m.id, today))}</b><span>{L('التزام ٧ أيام', '7-day rate')}</span></div>}
          {showNumbers && <div><b className="num">{pct(rate(v, m.id, today, 28))}</b><span>{L('٤ أسابيع', '4 weeks')}</span></div>}
        </div>
        {showNumbers && (
          <div className="cl-grid" role="img" aria-label={L('آخر ٤ أسابيع', 'Last 4 weeks')}>
            {days.map((d) => <i key={d} className={`${isActiveDay(chk[d]) ? 'on' : ''} ${d < dateKey(new Date(m.joined)) ? 'pre' : ''}`} title={`${fmtDate(d, false)}${chk[d]?.n ? ` · ${chk[d].n}` : ''}`} />)}
          </div>
        )}
        {showNumbers && <span className="faint small">{last ? L(`آخر إنجاز: ${fmtDate(last)} (${diffDays(last, today) === 0 ? 'اليوم' : `قبل ${diffDays(last, today)} أيام`})`, `Last done: ${fmtDate(last)}`) : L('ما سجّل إنجاز بعد', 'Nothing done yet')}{posts ? L(` · ${posts} مشاركة`, ` · ${posts} posts`) : ''}</span>}
        {b.length > 0 && <div className="cl-badges">{b.map((x) => <span key={x.id} className="cl-badge" title={x.why}><i aria-hidden>{x.icon}</i>{x.title}</span>)}</div>}
        {staff && m.id !== v.me.id && (
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm primary" onClick={() => openSheet({ type: 'club-msg', to: m.id })}><Icon name="send" size={14} /> {L('رسالة', 'Message')}</button>
            {admin && m.role !== 'admin' && m.status === 'active' && (
              <button className="btn sm" onClick={() => void tryIt(() => act({ a: 'role', id: m.id, role: m.role === 'sup' ? 'member' : 'sup' }), m.role === 'sup' ? L('رجع عضو', 'Now a member') : L('صار مشرف', 'Now a supervisor'))}>{m.role === 'sup' ? L('شيل الإشراف', 'Remove supervisor') : L('خلّه مشرف', 'Make supervisor')}</button>
            )}
            {admin && m.role !== 'admin' && (
              <button className="btn sm ghost" onClick={() => {
                if (m.status === 'active' && !confirm(L(`تطلّع ${m.name} من النادي؟ سجله يبقى محفوظ وتقدر ترجعه.`, `Remove ${m.name}? Their history is kept and you can bring them back.`))) return;
                void tryIt(() => act({ a: 'remove', id: m.id, back: m.status !== 'active' }));
              }}>{m.status === 'active' ? L('طلّعه من النادي', 'Remove from club') : L('رجّعه للنادي', 'Bring back')}</button>
            )}
          </div>
        )}
        {!staff && m.id !== v.me.id && <p className="faint small">{L('شجّعه في «النقاش» 👏', 'Cheer them on in “Talk” 👏')}</p>}
      </div>
    </Sheet>
  );
}

export function ClubTaskSheet({ id }: { id?: string }) {
  const c = useClub();
  const t = c.view?.tasks.find((x) => x.id === id);
  const [title, setTitle] = useState(t?.title || '');
  const [note, setNote] = useState(t?.note || '');
  const [kind, setKind] = useState<'daily' | 'weekly'>(t?.kind || 'daily');
  return (
    <Sheet title={t ? L('مهمة النادي', 'Club task') : L('مهمة أو تحدي جديد', 'New task or challenge')} onClose={closeSheet} footer={
      <>
        <button className="btn primary grow" disabled={!title.trim()} onClick={async () => {
          if (await tryIt(() => act(t ? { a: 'task', id: t.id, title } : { a: 'task', title, note, kind }), t ? L('انحفظت', 'Saved') : L('انضافت لكل الأعضاء', 'Added for every member'))) closeSheet();
        }}>{t ? L('احفظ', 'Save') : L('أضف للنادي', 'Add to the club')}</button>
        {t && <button className="btn ghost" onClick={async () => { if (await tryIt(() => act({ a: 'task', id: t.id, archived: true }), L('انشالت — سجلها محفوظ', 'Removed — its history is kept'))) closeSheet(); }}>{L('أوقفها', 'Stop it')}</button>}
      </>
    }>
      <div className="cl-form">
        {!t && <Seg value={kind} onChange={setKind} options={[{ v: 'daily', l: L('مهمة يومية', 'Daily task') }, { v: 'weekly', l: L('تحدي أسبوعي', 'Weekly challenge') }]} />}
        <label className="field"><span>{L('وش المطلوب؟', 'What’s asked?')}</span><input className="input" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'daily' ? L('مثلًا: اقرأ ١٠ صفحات', 'e.g. Read 10 pages') : L('مثلًا: خلّص كتاب هالأسبوع', 'e.g. Finish a book this week')} /></label>
        {!t && <label className="field"><span>{L('توضيح (اختياري)', 'Note (optional)')}</span><input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
        <p className="faint small">{kind === 'daily' ? L('تطلع لكل عضو كل يوم، ويعلّمها لما يخلصها.', 'Every member sees it every day and ticks it when done.') : L('مرة وحدة بالأسبوع، أي يوم يناسبه.', 'Once a week, any day that suits them.')}</p>
      </div>
    </Sheet>
  );
}

export function ClubMsgSheet({ to }: { to: string }) {
  const c = useClub();
  const [text, setText] = useState('');
  if (!c.view) return null;
  const who = to === 'all' ? L('كل الأعضاء', 'every member') : memberName(c.view, to);
  return (
    <Sheet title={L(`رسالة لـ ${who}`, `Message ${who}`)} onClose={closeSheet} footer={
      <button className="btn primary grow" disabled={!text.trim()} onClick={async () => { if (await tryIt(() => act({ a: 'msg', to, text }), L('وصلت ✓', 'Sent ✓'))) closeSheet(); }}>{L('أرسل', 'Send')}</button>
    }>
      <div className="cl-form">
        <textarea className="input" rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={to === 'all' ? L('مثلًا: أسبوع حلو يا شباب، تحدي الأسبوع الجاي…', 'e.g. Great week everyone, next week’s challenge…') : L('مثلًا: افتقدناك! وش رايك نبدأ بخطوة صغيرة اليوم؟', 'e.g. We missed you! How about one small step today?')} aria-label={L('نص الرسالة', 'Message text')} />
        <p className="faint small">{L('توصل له في صفحة النادي، مع تنبيه خفيف أول ما يفتح مدار.', 'It shows on their club page, with a gentle note when they open Madar.')}</p>
      </div>
    </Sheet>
  );
}

export function ClubMeSheet() {
  const c = useClub();
  const v = c.view;
  const conf = c.conf;
  const [name, setName] = useState(v?.me.name || '');
  const [cname, setCname] = useState(v?.club.name || '');
  const [about, setAbout] = useState(v?.club.about || '');
  if (!v || !conf) return null;
  const admin = v.me.role === 'admin';
  return (
    <Sheet title={L('إعداداتي في النادي', 'My club settings')} onClose={closeSheet}>
      <div className="cl-form">
        <label className="field"><span>{L('اسمي في النادي', 'My name in the club')}</span>
          <span className="row" style={{ gap: 8 }}><input className="input grow" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /><button className="btn sm" disabled={!name.trim() || name === v.me.name} onClick={() => void tryIt(() => act({ a: 'name', name }), L('تغيّر ✓', 'Changed ✓'))}>{L('احفظ', 'Save')}</button></span>
        </label>
        <div className="cl-switch"><span><b>{L('شارك عدد مهامي المنجزة', 'Share how many tasks I finish')}</b><small>{L('الرقم بس — يحسب يومك في التسلسل حتى لو ما فيه مهام للنادي.', 'Just the number — it counts your day in the streak even without club tasks.')}</small></span><Switch on={conf.share} onChange={(on) => setClubConf({ share: on })} label={L('شارك العدد', 'Share the number')} /></div>
        <div className="cl-switch"><span><b>{L('تنبيهات النادي', 'Club notes')}</b><small>{L('رسائل لك وردود عليك، وتذكير واحد بالمساء لو باقي مهام. ما فيه أكثر.', 'Messages, replies to you, and one evening reminder if tasks are left. Nothing more.')}</small></span><Switch on={!conf.muted} onChange={(on) => setClubConf({ muted: !on })} label={L('تنبيهات النادي', 'Club notes')} /></div>
        {admin && (
          <>
            <label className="field"><span>{L('اسم النادي', 'Club name')}</span><input className="input" maxLength={60} value={cname} onChange={(e) => setCname(e.target.value)} /></label>
            <label className="field"><span>{L('نبذة', 'About')}</span><textarea className="input" rows={2} maxLength={400} value={about} onChange={(e) => setAbout(e.target.value)} /></label>
            <button className="btn sm" onClick={() => void tryIt(() => act({ a: 'club', name: cname, about }), L('انحفظ ✓', 'Saved ✓'))}>{L('احفظ النادي', 'Save the club')}</button>
            <div className="cl-switch"><span><b>{L('قبول تلقائي', 'Auto-accept')}</b><small>{L('اللي معه الرابط يدخل بدون طلب.', 'Anyone with the link joins without a request.')}</small></span><Switch on={v.club.auto} onChange={(on) => void tryIt(() => act({ a: 'club', auto: on }))} label={L('قبول تلقائي', 'Auto-accept')} /></div>
          </>
        )}
        <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
          {!admin && <button className="btn sm ghost" onClick={() => { if (confirm(L('تطلع من النادي؟ سجلك يبقى عندهم وتقدر ترجع برابط.', 'Leave the club? Your history stays and you can rejoin with a link.'))) void tryIt(() => act({ a: 'leave' })).then((ok) => ok && closeSheet()); }}>{L('اطلع من النادي', 'Leave the club')}</button>}
          <button className="btn sm ghost" onClick={() => {
            if (!confirm(admin ? L('تفصل هذا الجهاز؟ انتبه: مفتاح المدير موجود بس في كود قوقل — احتفظ فيه لو تبي ترجع.', 'Unlink this device? The manager key is only in the Google code — keep it to come back.') : L('تفصل هذا الجهاز عن النادي؟ عضويتك تبقى.', 'Unlink this device? Your membership stays.'))) return;
            disconnect();
            closeSheet();
          }}>{L('افصل هذا الجهاز', 'Unlink this device')}</button>
        </div>
      </div>
    </Sheet>
  );
}

/** on «اليوم»: the club's tasks for today, one tap each */
export function ClubTodayCard() {
  const c = useClub();
  const now = useNow(60_000);
  const v = c.view;
  if (!v || v.me.status !== 'active') return null;
  const today = todayKey(now);
  const daily = v.tasks.filter((t) => t.kind === 'daily' && !t.archived);
  const weekly = v.tasks.filter((t) => t.kind === 'weekly' && !t.archived && !weeklyDone(v, v.me.id, t.id, today));
  if (!daily.length && !weekly.length) return null;
  const st = streak(v.checks[v.me.id], today);
  return (
    <section className="tile cl-today" aria-label={L('مهام النادي', 'Club tasks')}>
      <button className="cl-today-h" onClick={() => go('club')}>
        <b><bdi>{v.club.name}</bdi></b>
        <span className="num">{st ? `🔥${st}` : ''}</span>
        <Icon name="chevron" size={14} className="chev-end" />
      </button>
      <div className="cl-list">
        {daily.map((t) => <TaskRow key={t.id} v={v} t={t} today={today} />)}
        {weekly.slice(0, 2).map((t) => <TaskRow key={t.id} v={v} t={t} today={today} />)}
      </div>
    </section>
  );
}
