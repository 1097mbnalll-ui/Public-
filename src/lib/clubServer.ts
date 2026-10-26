// The club's server: a Google Apps Script the club's manager pastes into their own Google account
// (Web app, access «Anyone»). It keeps the whole club in one JSON file in the manager's Drive:
// members, club tasks, who did what each day, the discussion and the messages. Nothing is ever
// deleted for good — a member who leaves or is removed is only marked so, and a hidden post stays.
//
// Every request carries the member's own key (made on their device when they join); the manager's
// key is written into the code below, so only the manager can run the club.

export function clubServerCode(adminKey: string, joinCode: string, name: string): string {
  return `// «مدار» — خادم النادي. يشتغل داخل حسابك في قوقل، وبيانات النادي في ملف واحد في Drive حقك.
const ADMIN = '${adminKey}';
const JOIN = '${joinCode}';
const NAME = ${JSON.stringify(name)};
${CLUB_SERVER_BODY}`;
}

/** the server's logic — kept apart so tests can run it with stand-ins for Google's services */
export const CLUB_SERVER_BODY = String.raw`
const FILE = 'madar-club.json';

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function file_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('file');
  if (id) {
    try { return DriveApp.getFileById(id); } catch (e) {}
  }
  const f = DriveApp.createFile(FILE, '', 'application/json');
  p.setProperty('file', f.getId());
  return f;
}

function load_() {
  const s = file_().getBlob().getDataAsString();
  const d = s ? JSON.parse(s) : {};
  d.v = 1;
  d.club = d.club || { name: NAME, about: '', auto: false, created: Date.now() };
  d.members = d.members || [];
  d.tasks = d.tasks || [];
  d.checks = d.checks || {};
  d.posts = d.posts || [];
  d.msgs = d.msgs || [];
  return d;
}

function save_(d) {
  file_().setContent(JSON.stringify(d));
}

const id_ = () => Utilities.getUuid().slice(0, 12);
const str_ = (x, n) => String(x == null ? '' : x).trim().slice(0, n);

function doGet(e) {
  return out_({ ok: true, club: true });
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'body' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    return out_(run_(b));
  } catch (err) {
    return out_({ ok: false, error: 'server', detail: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function view_(d, me) {
  const staff = me.role === 'admin' || me.role === 'sup';
  const from = Date.now() - 42 * 86400000;
  const day = (t) => Utilities.formatDate(new Date(t), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const since = day(from);
  const visible = d.members.filter((m) => m.status === 'active' || m.status === 'left' || staff || m.id === me.id);
  const checks = {};
  for (const m of visible) {
    const c = d.checks[m.id] || {};
    const o = {};
    for (const k in c) if (k >= since) o[k] = c[k];
    checks[m.id] = o;
  }
  return {
    ok: true,
    club: d.club,
    me: { id: me.id, name: me.name, role: me.role, status: me.status, joined: me.joined },
    members: visible.map((m) => ({ id: m.id, name: m.name, role: m.role, status: m.status, joined: m.joined, last: m.last || 0, first: m.first || '' })),
    tasks: d.tasks,
    checks: checks,
    posts: d.posts.filter((p) => !p.hidden || staff || p.by === me.id).slice(-300),
    msgs: d.msgs.filter((x) => x.to === 'all' || x.to === me.id || x.from === me.id || me.role === 'admin').slice(-300),
    joinCode: staff ? JOIN : undefined,
    now: Date.now(),
  };
}

function run_(b) {
  const d = load_();
  const a = b.a;
  const k = str_(b.k, 80);
  if (!k || k.length < 16) return { ok: false, error: 'key' };

  // the manager's first visit makes the manager a member
  if (k === ADMIN && !d.members.some((m) => m.key === ADMIN)) {
    d.members.push({ id: id_(), key: ADMIN, name: str_(b.name, 60) || 'المدير', role: 'admin', status: 'active', joined: Date.now(), last: Date.now() });
    save_(d);
  }

  if (a === 'join') {
    if (str_(b.code, 40) !== JOIN) return { ok: false, error: 'code' };
    let m = d.members.find((x) => x.key === k);
    if (!m) {
      const name = str_(b.name, 60);
      if (!name) return { ok: false, error: 'name' };
      if (d.members.length >= 2000) return { ok: false, error: 'full' };
      m = { id: id_(), key: k, name: name, role: 'member', status: d.club.auto ? 'active' : 'pending', joined: Date.now(), last: Date.now() };
      d.members.push(m);
      save_(d);
    } else if (m.status === 'left' || m.status === 'rejected') {
      m.status = d.club.auto ? 'active' : 'pending';
      save_(d);
    }
    return view_(d, m);
  }

  const me = d.members.find((x) => x.key === k);
  if (!me) return { ok: false, error: 'who' };
  const staff = me.role === 'admin' || me.role === 'sup';
  const admin = me.role === 'admin';

  if (a === 'state') return view_(d, me);
  if (me.status !== 'active') return { ok: false, error: 'status', status: me.status };

  me.last = Date.now();
  const target = () => d.members.find((x) => x.id === b.id);

  switch (a) {
    case 'check': {
      const day = str_(b.day, 10);
      if (!/^\d{4}-\d\d-\d\d$/.test(day)) return { ok: false, error: 'day' };
      const c = (d.checks[me.id] = d.checks[me.id] || {});
      const ids = Array.isArray(b.t) ? b.t.map((x) => str_(x, 20)).filter((x) => d.tasks.some((t) => t.id === x)).slice(0, 100) : [];
      const n = Math.max(0, Math.min(500, Number(b.n) || 0));
      c[day] = { t: ids, n: n, at: Date.now() };
      if (!me.first && (ids.length || n)) me.first = day;
      break;
    }
    case 'name':
      me.name = str_(b.name, 60) || me.name;
      break;
    case 'leave':
      if (admin) return { ok: false, error: 'admin' };
      me.status = 'left';
      break;
    case 'post': {
      const text = str_(b.text, 1000);
      if (!text) return { ok: false, error: 'empty' };
      d.posts.push({ id: id_(), by: me.id, text: text, at: Date.now(), parent: b.parent ? str_(b.parent, 20) : undefined, cheers: {} });
      break;
    }
    case 'cheer': {
      const p = d.posts.find((x) => x.id === b.post);
      if (!p) return { ok: false, error: 'post' };
      p.cheers = p.cheers || {};
      if (p.cheers[me.id] === b.e || !b.e) delete p.cheers[me.id];
      else p.cheers[me.id] = str_(b.e, 8);
      break;
    }
    case 'hide': {
      const p = d.posts.find((x) => x.id === b.post);
      if (!p || (!staff && p.by !== me.id)) return { ok: false, error: 'post' };
      p.hidden = !!b.on;
      break;
    }
    case 'approve':
    case 'reject': {
      if (!staff) return { ok: false, error: 'role' };
      const m = target();
      if (!m || m.status !== 'pending') return { ok: false, error: 'member' };
      m.status = a === 'approve' ? 'active' : 'rejected';
      break;
    }
    case 'role': {
      const m = target();
      if (!admin || !m || m.role === 'admin' || (b.role !== 'sup' && b.role !== 'member')) return { ok: false, error: 'role' };
      m.role = b.role;
      break;
    }
    case 'remove': {
      const m = target();
      if (!admin || !m || m.role === 'admin') return { ok: false, error: 'role' };
      m.status = b.back ? 'active' : 'left';
      break;
    }
    case 'task': {
      if (!staff) return { ok: false, error: 'role' };
      const title = str_(b.title, 140);
      if (b.id) {
        const t = d.tasks.find((x) => x.id === b.id);
        if (!t) return { ok: false, error: 'task' };
        if (title) t.title = title;
        if (b.archived != null) t.archived = !!b.archived;
      } else {
        if (!title) return { ok: false, error: 'empty' };
        const kind = b.kind === 'weekly' ? 'weekly' : 'daily';
        d.tasks.push({ id: id_(), title: title, kind: kind, note: str_(b.note, 300), by: me.id, at: Date.now(), from: str_(b.from, 10) });
      }
      break;
    }
    case 'msg': {
      if (!staff) return { ok: false, error: 'role' };
      const text = str_(b.text, 1000);
      if (!text) return { ok: false, error: 'empty' };
      const to = b.to === 'all' ? 'all' : (d.members.find((x) => x.id === b.to) || {}).id;
      if (!to) return { ok: false, error: 'member' };
      d.msgs.push({ id: id_(), from: me.id, to: to, text: text, at: Date.now() });
      break;
    }
    case 'club': {
      if (!admin) return { ok: false, error: 'role' };
      if (b.name != null) d.club.name = str_(b.name, 60) || d.club.name;
      if (b.about != null) d.club.about = str_(b.about, 400);
      if (b.auto != null) d.club.auto = !!b.auto;
      break;
    }
    default:
      return { ok: false, error: 'action' };
  }
  save_(d);
  return view_(d, me);
}
`;
