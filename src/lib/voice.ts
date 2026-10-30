// Voice answers for «صقل» stay on this device only: a separate IndexedDB database (the main data
// and its sync never carry audio). The newest 20 are kept; older ones go by themselves.

const DB = 'masar-voice';
const STORE = 'clips';
const KEEP = 20;

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then((db) => new Promise((resolve) => {
    if (!db) return resolve(undefined);
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => resolve(undefined);
  }));
}

export async function saveClip(id: string, blob: Blob) {
  await run('readwrite', (s) => s.put({ blob, at: Date.now() }, id));
  // keep the newest KEEP
  const keys = ((await run('readonly', (s) => s.getAllKeys())) || []) as string[];
  if (keys.length <= KEEP) return;
  const all = ((await run('readonly', (s) => s.getAll())) || []) as { at: number }[];
  const order = keys.map((k, i) => ({ k, at: all[i]?.at || 0 })).sort((a, b) => a.at - b.at);
  for (const { k } of order.slice(0, keys.length - KEEP)) await run('readwrite', (s) => s.delete(k));
}

export async function getClip(id: string): Promise<Blob | undefined> {
  const v = (await run('readonly', (s) => s.get(id))) as { blob: Blob } | undefined;
  return v?.blob;
}

/** a recorder for one answer: start, stop → a Blob (audio/webm or whatever the browser makes) */
export async function startRecording(): Promise<{ stop: () => Promise<Blob>; cancel: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const end = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () => new Promise<Blob>((resolve) => {
      rec.onstop = () => {
        end();
        resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      };
      rec.stop();
    }),
    cancel: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      end();
    },
  };
}

export const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
