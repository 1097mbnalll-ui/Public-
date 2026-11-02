import { describe, expect, it } from 'vitest';
import { serverCode } from '../src/lib/syncServer';
import { initialState } from '../src/lib/defaults';
import { getState, replaceState } from '../src/lib/store';

const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) };

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


describe('bank texts arrive with the regular sync', () => {
  it('pull and take go out together; texts are added even when the pull fails', async () => {
    const { call } = fakeGoogle('T');
    let failPull = false;
    (globalThis as any).fetch = async (u: string, o?: { body?: string }) => {
      const q = Object.fromEntries(new URL(u).searchParams);
      if (failPull && q.a === 'pull') return new Response('x', { status: 500 });
      return new Response(JSON.stringify(call(q, o?.body)), { status: 200 });
    };
    mem.set('masar.sync', JSON.stringify({ url: 'https://script.google.com/macros/s/x/exec', token: 'T', key: btoa(String.fromCharCode(...new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), rev: 0, dirty: false }));
    replaceState(initialState(), '', false);
    const { syncNow } = await import('../src/lib/sync');
    call({ a: 'sms', t: 'T' }, JSON.stringify({ text: 'Purchase SAR 24 at DUNKIN' }));
    await syncNow();
    expect(getState().expenses.map((e) => e.amount)).toEqual([24]);
    expect(call({ a: 'take', t: 'T' }).sms).toEqual([]);

    failPull = true;
    call({ a: 'sms', t: 'T' }, JSON.stringify({ text: 'Purchase SAR 31 at KUDU' }));
    await syncNow();
    expect(getState().expenses.map((e) => e.amount).sort()).toEqual([24, 31]);
  });
});
