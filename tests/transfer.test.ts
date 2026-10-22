import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { cleanCode, fromB64url, mergeStates, newCode, open, prettyCode, seal, toB64url, WrongCode } from '../src/lib/transfer';

const sample = () => {
  const s = initialState();
  s.tasks.push({ id: 't1', title: 'مهمة عربية طويلة', notes: '', area: 'work', priority: 3, hard: false, spent: 0, status: 'open', checklist: [], deferrals: 0, createdAt: 1, updatedAt: 1 });
  return s;
};

describe('device transfer', () => {
  it('round-trips through link encoding with the right code', async () => {
    const code = newCode();
    expect(code).toHaveLength(12);
    const packed = await seal(sample(), code);
    const link = toB64url(packed);
    const back = await open(fromB64url(link), prettyCode(code).toLowerCase()); // forgiving input
    expect(back.state.tasks[0].title).toBe('مهمة عربية طويلة');
  });

  it('rejects a wrong code', async () => {
    const packed = await seal(sample(), newCode());
    await expect(open(packed, 'AAAA-BBBB-CCCC')).rejects.toBeInstanceOf(WrongCode);
  });

  it('cleans pasted codes', () => {
    expect(cleanCode(' k7qm-9xwd 3pra ')).toBe('K7QM9XWD3PRA');
  });

  it('merges two devices: union, newest edit wins, settings stay local', () => {
    const a = sample();
    a.settings.name = 'هنا';
    const b = sample();
    b.settings.name = 'هناك';
    b.tasks[0] = { ...b.tasks[0], title: 'معدّلة', updatedAt: 5 };
    b.tasks.push({ ...b.tasks[0], id: 't2', title: 'جديدة', updatedAt: 2 });
    const m = mergeStates(a, b);
    expect(m.tasks.map((t) => t.title).sort()).toEqual(['جديدة', 'معدّلة']);
    expect(m.settings.name).toBe('هنا');
    expect(m.templates.length).toBe(a.templates.length); // no duplicate starter templates
  });
});
