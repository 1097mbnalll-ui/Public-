// The little server the user pastes into their own Google account (Google Apps Script → Web app).
// It only keeps: the app data as an encrypted blob (the key never leaves the user's devices)
// and bank messages waiting to be picked up. Script Properties hold both (no Drive access needed).

export function serverCode(token: string): string {
  return `// «مسار» — مزامنة بين أجهزتك. هذا الكود يشتغل داخل حسابك في قوقل فقط.
// بيانات «مسار» توصل هنا مشفّرة، والمفتاح على أجهزتك بس. رسائل البنك تنتظر هنا لين يسحبها «مسار» ثم تنمسح.
const TOKEN = '${token}';

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// a Script Property holds 9 KB at most — longer values are split into parts
function getBig_(k) {
  const p = PropertiesService.getScriptProperties();
  const n = Number(p.getProperty(k + ':n') || 0);
  let s = '';
  for (let i = 0; i < n; i++) s += p.getProperty(k + ':' + i) || '';
  return s;
}

function setBig_(k, s) {
  const p = PropertiesService.getScriptProperties();
  const old = Number(p.getProperty(k + ':n') || 0);
  const parts = {};
  let n = 0;
  for (let i = 0; i < s.length; i += 8000) parts[k + ':' + n++] = s.slice(i, i + 8000);
  parts[k + ':n'] = String(n);
  p.setProperties(parts);
  for (let i = n; i < old; i++) p.deleteProperty(k + ':' + i);
}

function json_(k, def) {
  const s = getBig_(k);
  return s ? JSON.parse(s) : def;
}

function doGet(e) {
  return handle_(e, '');
}

function doPost(e) {
  return handle_(e, e.postData ? e.postData.contents : '');
}

function handle_(e, body) {
  const q = (e && e.parameter) || {};
  if (q.t !== TOKEN) return out_({ ok: false, error: 'token' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (q.a === 'ping') return out_({ ok: true, v: 1 });
    if (q.a === 'pull') {
      const s = json_('state', { rev: 0, data: '' });
      return out_({ ok: true, rev: s.rev, data: String(s.rev) === String(q.rev) ? '' : s.data });
    }
    if (q.a === 'push') {
      const b = JSON.parse(body);
      const s = json_('state', { rev: 0, data: '' });
      if (b.base !== s.rev) return out_({ ok: false, conflict: true, rev: s.rev, data: s.data });
      const n = { rev: s.rev + 1, data: b.data, at: Date.now() };
      setBig_('state', JSON.stringify(n));
      return out_({ ok: true, rev: n.rev });
    }
    if (q.a === 'sms') {
      let text = body || q.m || '';
      try {
        const j = JSON.parse(body);
        if (j && typeof j === 'object') text = j.text || j.message || j.content || '';
      } catch (err) {}
      text = String(text).trim();
      if (!text) return out_({ ok: false, error: 'empty' });
      const list = json_('sms', []);
      list.push({ id: Utilities.getUuid(), at: Date.now(), text: text.slice(0, 2000) });
      setBig_('sms', JSON.stringify(list.slice(-300)));
      return out_({ ok: true });
    }
    if (q.a === 'take') {
      const list = json_('sms', []);
      if (list.length) setBig_('sms', '[]');
      return out_({ ok: true, sms: list });
    }
    return out_({ ok: false, error: 'action' });
  } finally {
    lock.releaseLock();
  }
}
`;
}
