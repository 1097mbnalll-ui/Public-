import { describe, expect, it } from 'vitest';
import { serverCode } from '../src/lib/syncServer';
import { decryptState, encryptState } from '../src/lib/sync';
import { initialState } from '../src/lib/defaults';
import { idSnapshot, mergeStates, mergeSynced } from '../src/lib/transfer';

/** run the Apps Script code with small stand-ins for Google's services */
function fakeGoogle(token: string) {
  const props = new Map<string, string>();
  const P = {
    getProperty: (k: string) => props.get(k) ?? null,
    setProperties: (o: Record<string, string>) => {
      for (const [k, v] of Object.entries(o)) {
        if (v.length > 9000) throw new Error('property too big');
        props.set(k, v);
      }
    },
    deleteProperty: (k: string) => props.delete(k),
  };
  const g = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => ({ body: s }) }) },
    PropertiesService: { getScriptProperties: () => P },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => Math.random().toString(36).slice(2) },
  };
  const fns = new Function(...Object.keys(g), serverCode(token) + '\nreturn { doGet, doPost };')(...Object.values(g));
  const call = (q: Record<string, string>, body?: string) =>
    JSON.parse((body === undefined ? fns.doGet({ parameter: q }) : fns.doPost({ parameter: q, postData: { contents: body } })).body);
  return { call, props };
}

describe('sync server (Apps Script)', () => {
  it('refuses a wrong token', () => {
    const { call } = fakeGoogle('T');
    expect(call({ a: 'ping', t: 'x' })).toEqual({ ok: false, error: 'token' });
    expect(call({ a: 'ping', t: 'T' }).ok).toBe(true);
  });

  it('keeps revisions, refuses stale pushes and splits big data', () => {
    const { call, props } = fakeGoogle('T');
    expect(call({ a: 'pull', t: 'T', rev: '0' })).toMatchObject({ ok: true, rev: 0, data: '' });
    const big = 'x'.repeat(30_000);
    expect(call({ a: 'push', t: 'T' }, JSON.stringify({ base: 0, data: big }))).toEqual({ ok: true, rev: 1 });
    expect(Number(props.get('state:n'))).toBeGreaterThan(3);
    expect(call({ a: 'pull', t: 'T', rev: '0' })).toMatchObject({ rev: 1, data: big });
    expect(call({ a: 'pull', t: 'T', rev: '1' })).toMatchObject({ rev: 1, data: '' });
    expect(call({ a: 'push', t: 'T' }, JSON.stringify({ base: 0, data: 'old' }))).toMatchObject({ ok: false, conflict: true, rev: 1, data: big });
    expect(call({ a: 'push', t: 'T' }, JSON.stringify({ base: 1, data: 'small' }))).toEqual({ ok: true, rev: 2 });
    expect(props.get('state:n')).toBe('1');
    expect(props.has('state:1')).toBe(false);
  });

  it('queues bank messages (JSON or plain) and hands them out once', () => {
    const { call } = fakeGoogle('T');
    expect(call({ a: 'sms', t: 'T' }, JSON.stringify({ text: 'شراء 10 ريال لدى أ' })).ok).toBe(true);
    expect(call({ a: 'sms', t: 'T' }, 'Purchase SAR 5 at B').ok).toBe(true);
    expect(call({ a: 'sms', t: 'T' }, '').ok).toBe(false);
    const got = call({ a: 'take', t: 'T' });
    expect(got.sms.map((m: { text: string }) => m.text)).toEqual(['شراء 10 ريال لدى أ', 'Purchase SAR 5 at B']);
    expect(call({ a: 'take', t: 'T' }).sms).toEqual([]);
  });
});

describe('sync client', () => {
  it('encrypts the state so only the key opens it', async () => {
    const s = initialState();
    s.expenses.push({ id: 'e', title: 'قهوة', amount: 18, cat: 'coffee', day: '2026-10-24', createdAt: 1 });
    const key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const blob = await encryptState(s, key);
    expect(blob).not.toContain('قهوة');
    expect((await decryptState(blob, key)).expenses[0].title).toBe('قهوة');
    await expect(decryptState(blob, 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB')).rejects.toThrow();
  });

  it('merges spending from both devices', () => {
    const a = initialState();
    const b = initialState();
    a.expenses.push({ id: '1', title: 'أ', amount: 1, cat: 'other', day: '2026-10-24', createdAt: 1 });
    b.expenses.push({ id: '2', title: 'ب', amount: 2, cat: 'other', day: '2026-10-24', createdAt: 1 });
    b.money.smsSeen = ['k'];
    const m = mergeStates(a, b);
    expect(m.expenses.map((e) => e.id).sort()).toEqual(['1', '2']);
    expect(m.money.smsSeen).toEqual(['k']);
  });

  it('a deletion on one device survives a merge with the other', () => {
    const base = initialState();
    const e = (id: string) => ({ id, title: id, amount: 1, cat: 'other' as const, day: '2026-10-24', createdAt: 1 });
    base.expenses.push(e('kept'), e('gone'));
    const snap = idSnapshot(base);
    const phone = structuredClone(base);
    phone.expenses = phone.expenses.filter((x) => x.id !== 'gone'); // deleted on the phone
    const tablet = structuredClone(base);
    tablet.expenses.push(e('new')); // added on the tablet
    const m = mergeSynced(tablet, phone, snap);
    expect(m.expenses.map((x) => x.id).sort()).toEqual(['kept', 'new']);
  });
});
