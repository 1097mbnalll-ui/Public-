import { describe, expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { idSnapshot, mergeSynced } from '../src/lib/transfer';
import { getState, replaceState } from '../src/lib/store';
import * as A from '../src/lib/actions';
import type { AppState } from '../src/lib/types';

function base(): AppState {
  const s = initialState();
  s.courses.push({ id: 'c', name: 'كيم', color: '#000', difficulty: 3, sizeLabel: 'صفحة', paceGuess: 1, notes: '', archived: false, createdAt: 1 });
  s.units.push({ id: 'u', courseId: 'c', title: 'الفصل 1', size: 20, progress: 0, reviewed: false, spent: 0, order: 0 });
  s.exams.push({ id: 'e', courseId: 'c', title: 'الميد', date: '2026-12-01', unitIds: ['u'], reviewDays: 1, createdAt: 1 });
  return s;
}

describe('study logged on one device survives the other device syncing', () => {
  it('a lesson finished here is not undone by a device that changed something else', () => {
    const shared = base();
    const snap = idSnapshot(shared);
    // this device logs an hour on the lesson and finishes it
    replaceState(structuredClone(shared), '', false);
    A.logStudy('c', 'u', 60, 20);
    const here = getState();
    expect(here.units[0].progress).toBe(1);
    // the other device, still on the old copy, changed something unrelated
    replaceState(structuredClone(shared), '', false);
    A.addTask({ title: 'شي ثاني' });
    const there = getState();
    // it pulls what this device pushed and merges
    const merged = mergeSynced(there, here, snap);
    expect(merged.units[0].progress).toBe(1);
    expect(merged.units[0].spent).toBe(60);
    expect(merged.sessions.length).toBe(1);
    expect(merged.tasks.length).toBe(1);
  });

  it('a tick on a lesson survives too, and so does finishing an exam', () => {
    const shared = base();
    const snap = idSnapshot(shared);
    replaceState(structuredClone(shared), '', false);
    A.markLesson('u', { progress: 0.5 });
    A.finishExam('e');
    const here = getState();
    replaceState(structuredClone(shared), '', false);
    A.addTask({ title: 'x' });
    const merged = mergeSynced(getState(), here, snap);
    expect(merged.units[0].progress).toBe(0.5);
    expect(merged.exams[0].finished).toBe(true);
  });
});
