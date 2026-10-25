import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { atTime } from '../src/lib/dates';
import { parseQuick } from '../src/lib/parse';
import { planDay } from '../src/lib/engine/planner';
import type { Task } from '../src/lib/types';

const NOW = atTime('2026-10-25', '15:00');
const task = (p: Partial<Task>): Task => ({ id: Math.random().toString(36).slice(2), title: 'x', notes: '', area: 'life', priority: 1, hard: false, spent: 0, status: 'open', checklist: [], deferrals: 0, createdAt: NOW, updatedAt: NOW, ...p });

describe('tasks: what shows on Today, and in what order', () => {
  it('«ترتيب الغرفة» is not work', () => {
    expect(parseQuick('ترتيب الغرفة').area).toBeUndefined();
    expect(parseQuick('مراجعة الغرفة التجارية').area).toBe('work');
  });

  it('urgent leads; a deadline later today keeps its place; one within two hours goes first', () => {
    const s = initialState();
    s.tasks.push(task({ id: 'late', title: 'ترتيب', due: '2026-10-25', dueTime: '20:00' }), task({ id: 'urg', title: 'تقرير', priority: 3 }));
    expect(planDay(s, NOW).items[0].id).toBe('urg');
    expect(planDay(s, atTime('2026-10-25', '19:00')).items[0].id).toBe('late');
  });

  it('a normal appointment tomorrow at a set hour is not work for today', () => {
    const s = initialState();
    s.tasks.push(task({ id: 'meet', due: '2026-10-26', dueTime: '17:00' }), task({ id: 'imp', due: '2026-10-26', dueTime: '08:00', priority: 2 }));
    const plan = planDay(s, NOW);
    const all = [...plan.items, ...plan.later].map((i) => i.id);
    expect(all).not.toContain('meet');
    expect(all).toContain('imp');
  });

  it('«لا يتأجل» only when you said so', () => {
    const s = initialState();
    s.tasks.push(task({ id: 'a', due: '2026-10-25' }), task({ id: 'b', due: '2026-10-25', hard: true }));
    const it = Object.fromEntries(planDay(s, NOW).items.map((i) => [i.id, i]));
    expect(it.a.hard).toBe(false);
    expect(it.b.hard).toBe(true);
  });
});
