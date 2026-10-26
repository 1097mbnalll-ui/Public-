import { describe, expect, it } from 'vitest';
import { CLUB_SERVER_BODY } from '../src/lib/clubServer';
import { activeDaysInWeek, badges, bestStreak, clubRate, rate, stars, stopped, streak, weekReport, type ClubView } from '../src/lib/club';
import { addDays } from '../src/lib/dates';

// ---------- the Google script, run here with stand-ins for Drive, locks and so on ----------

function server(admin = 'A'.repeat(32), code = 'join123') {
  let content = '';
  const props: Record<string, string> = {};
  const file = { getId: () => 'f1', getBlob: () => ({ getDataAsString: () => content }), setContent: (s: string) => (content = s) };
  const g = {
    ContentService: { createTextOutput: (s: string) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => (props[k] = v) }) },
    DriveApp: { getFileById: () => file, createFile: () => file },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), formatDate: (d: Date) => d.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => 'UTC' },
  };
  const src = `const ADMIN='${admin}';const JOIN='${code}';const NAME='نادي';${CLUB_SERVER_BODY};return doPost;`;
  const doPost = new Function(...Object.keys(g), src)(...Object.values(g));
  const call = (b: object) => JSON.parse(doPost({ postData: { contents: JSON.stringify(b) } }).s);
  return { call, size: () => content.length, raw: () => JSON.parse(content) };
}

const key = (i: number) => `member-key-${String(i).padStart(6, '0')}-xxxxxx`;

describe('club server', () => {
  it('an empty club: the manager arrives and sees only themselves', () => {
    const s = server();
    const v = s.call({ a: 'state', k: 'A'.repeat(32), name: 'المدير' });
    expect(v.ok).toBe(true);
    expect(v.me.role).toBe('admin');
    expect(v.members).toHaveLength(1);
    expect(v.tasks).toEqual([]);
    expect(v.joinCode).toBe('join123');
  });

  it('wrong code, short key, unknown key and members doing staff work are refused', () => {
    const s = server();
    expect(s.call({ a: 'join', k: key(1), code: 'nope', name: 'x' }).error).toBe('code');
    expect(s.call({ a: 'state', k: 'short' }).error).toBe('key');
    expect(s.call({ a: 'state', k: key(9) }).error).toBe('who');
    s.call({ a: 'join', k: key(1), code: 'join123', name: 'سارة' });
    expect(s.call({ a: 'check', k: key(1), day: '2026-10-26', t: [] }).error).toBe('status'); // still pending
    const m = s.call({ a: 'state', k: 'A'.repeat(32) }).members.find((x: any) => x.name === 'سارة');
    s.call({ a: 'approve', k: 'A'.repeat(32), id: m.id });
    expect(s.call({ a: 'task', k: key(1), title: 'x' }).error).toBe('role');
    expect(s.call({ a: 'approve', k: key(1), id: m.id }).error).toBe('role');
    expect(s.call({ a: 'remove', k: key(1), id: m.id }).error).toBe('role');
  });

  it('hundreds of members with very long names: all join, names are cut, the view stays complete', () => {
    const s = server();
    const A = 'A'.repeat(32);
    s.call({ a: 'state', k: A });
    s.call({ a: 'club', k: A, auto: true });
    const long = 'عبدالرحمن '.repeat(30);
    for (let i = 0; i < 400; i++) s.call({ a: 'join', k: key(i), code: 'join123', name: long + i });
    const v = s.call({ a: 'state', k: A });
    expect(v.members).toHaveLength(401);
    expect(Math.max(...v.members.map((m: any) => m.name.length))).toBeLessThanOrEqual(60);
    s.call({ a: 'task', k: A, title: 'اقرأ ١٠ صفحات', kind: 'daily' });
    const t = s.call({ a: 'state', k: A }).tasks[0];
    for (let i = 0; i < 400; i++) s.call({ a: 'check', k: key(i), day: '2026-10-26', t: [t.id, 'not-a-task'], n: 3 });
    const after = s.call({ a: 'state', k: A });
    expect(Object.keys(after.checks)).toHaveLength(401);
    expect(after.checks[after.members[5].id]['2026-10-26'].t).toEqual([t.id]); // unknown task ids dropped
    expect(s.size()).toBeLessThan(400_000);
  });

  it('nothing is deleted for good: removing, leaving and hiding only mark it', () => {
    const s = server();
    const A = 'A'.repeat(32);
    s.call({ a: 'state', k: A });
    s.call({ a: 'club', k: A, auto: true });
    s.call({ a: 'join', k: key(1), code: 'join123', name: 'خالد' });
    const id = s.call({ a: 'state', k: key(1) }).me.id;
    s.call({ a: 'post', k: key(1), text: 'بدأت اليوم' });
    const post = s.call({ a: 'state', k: A }).posts[0];
    s.call({ a: 'hide', k: A, post: post.id, on: true });
    expect(s.call({ a: 'state', k: key(1) }).posts).toHaveLength(1); // the writer still sees it
    s.call({ a: 'remove', k: A, id });
    expect(s.raw().members.find((m: any) => m.id === id).status).toBe('left');
    expect(s.raw().posts).toHaveLength(1);
    expect(s.call({ a: 'remove', k: A, id: s.raw().members[0].id }).error).toBe('role'); // not the manager
    expect(s.call({ a: 'leave', k: A }).error).toBe('admin');
    // and back
    s.call({ a: 'remove', k: A, id, back: true });
    expect(s.raw().members.find((m: any) => m.id === id).status).toBe('active');
  });

  it('roles: a supervisor approves and adds tasks, but can’t change roles', () => {
    const s = server();
    const A = 'A'.repeat(32);
    s.call({ a: 'state', k: A });
    s.call({ a: 'join', k: key(1), code: 'join123', name: 'مشرف' });
    s.call({ a: 'join', k: key(2), code: 'join123', name: 'عضو' });
    const ms = s.call({ a: 'state', k: A }).members;
    for (const m of ms.filter((x: any) => x.status === 'pending')) s.call({ a: 'approve', k: A, id: m.id });
    s.call({ a: 'role', k: A, id: ms[1].id, role: 'sup' });
    expect(s.call({ a: 'task', k: key(1), title: 'تحدي', kind: 'weekly' }).ok).toBe(true);
    expect(s.call({ a: 'role', k: key(1), id: ms[2].id, role: 'sup' }).error).toBe('role');
    expect(s.call({ a: 'role', k: A, id: ms[0].id, role: 'member' }).error).toBe('role'); // the manager stays manager
  });
});

// ---------- the numbers ----------

const today = '2026-10-28'; // a Wednesday
const day0 = new Date('2026-10-01T12:00:00').getTime();

function view(p: Partial<ClubView> = {}): ClubView {
  return {
    club: { name: 'نادي', about: '', auto: false, created: day0 },
    me: { id: 'a', name: 'أ', role: 'admin', status: 'active', joined: day0 },
    members: [{ id: 'a', name: 'أ', role: 'admin', status: 'active', joined: day0, last: 0 }],
    tasks: [],
    checks: {},
    posts: [],
    msgs: [],
    now: Date.now(),
    ...p,
  };
}
const did = (t: string[] = ['t1'], n = 0) => ({ t, n, at: 0 });

describe('club numbers', () => {
  it('an empty club gives no numbers instead of zeros that shame', () => {
    const v = view({ members: [] });
    expect(clubRate(v, today)).toBeNull();
    expect(stars(v, today)).toEqual([]);
    expect(stopped(v, today)).toEqual([]);
    expect(weekReport(v, today).avgRate).toBeNull();
  });

  it('streak counts back from today, or from yesterday while today is open', () => {
    const c = { [today]: did(), [addDays(today, -1)]: did(), [addDays(today, -2)]: did(), [addDays(today, -4)]: did() };
    expect(streak(c, today)).toBe(3);
    const open = { [addDays(today, -1)]: did(), [addDays(today, -2)]: did() };
    expect(streak(open, today)).toBe(2);
    expect(streak({}, today)).toBe(0);
    expect(bestStreak(c)).toBe(3);
  });

  it('a member with no club tasks: own tasks count (shared number), else nothing to measure', () => {
    const joined = new Date(`${today}T08:00:00`).getTime();
    const v = view({ members: [{ id: 'b', name: 'ب', role: 'member', status: 'active', joined, last: 0 }] });
    expect(rate(v, 'b', today)).toBeNull(); // joined today, nothing yet: no score at all
    const v2 = view({ checks: { a: { [addDays(today, -1)]: did([], 4), [addDays(today, -2)]: did([], 0) } } });
    expect(rate(v2, 'a', today)).toBeCloseTo(1 / 6);
  });

  it('today and this week never count against anyone while still open', () => {
    const t = { id: 't1', title: 'x', kind: 'daily' as const, by: 'a', at: new Date(`${addDays(today, -1)}T08:00:00`).getTime() };
    const w = { id: 'w1', title: 'y', kind: 'weekly' as const, by: 'a', at: new Date(`${addDays(today, -1)}T08:00:00`).getTime() };
    const v = view({ tasks: [t, w], checks: { a: { [addDays(today, -1)]: did(['t1']) } } });
    expect(rate(v, 'a', today)).toBe(1);
  });

  it('stopped: three quiet days flags them; a new member counts from joining', () => {
    const v = view({
      members: [
        { id: 'a', name: 'أ', role: 'admin', status: 'active', joined: day0, last: 0 },
        { id: 'b', name: 'ب', role: 'member', status: 'active', joined: day0, last: 0 },
        { id: 'c', name: 'ج', role: 'member', status: 'active', joined: new Date(`${addDays(today, -1)}T08:00:00`).getTime(), last: 0 },
        { id: 'd', name: 'د', role: 'member', status: 'left', joined: day0, last: 0 },
      ],
      checks: { a: { [today]: did() }, b: { [addDays(today, -5)]: did() } },
    });
    expect(stopped(v, today).map((x) => [x.m.id, x.days])).toEqual([['b', 5]]);
  });

  it('stars show three at most and never anyone with nothing; badges are only the earned ones', () => {
    const members = Array.from({ length: 300 }, (_, i) => ({ id: `m${i}`, name: `عضو ${i}`, role: 'member' as const, status: 'active' as const, joined: day0, last: 0 }));
    const checks: ClubView['checks'] = {};
    members.forEach((m, i) => (checks[m.id] = i % 3 ? {} : { [today]: did(), [addDays(today, -1)]: did(), [addDays(today, -2)]: did() }));
    const v = view({ members, checks });
    const s = stars(v, today);
    expect(s).toHaveLength(3);
    expect(s.every((x) => x.days === 3)).toBe(true);
    expect(badges(v, 'm1', today)).toEqual([]);
    expect(badges(v, 'm0', today).map((b) => b.id)).toEqual(['first', 's3']);
    expect(activeDaysInWeek(v, 'm0', today)).toBe(3);
    expect(clubRate(v, today)).toBeGreaterThan(0);
  });
});
