import { expect, it } from 'vitest';
import { initialState } from '../src/lib/defaults';
import { addDays, atTime } from '../src/lib/dates';
import { planStudy } from '../src/lib/engine/study';
import { studyCapFor, availableFor } from '../src/lib/engine/capacity';
import type { AppState, ClassBlock } from '../src/lib/types';

const blk = (id: string, title: string, day: number, start: string, end: string, extra: Partial<ClassBlock> = {}): ClassBlock => ({ id, title, day, start, end, kind: 'class', createdAt: 1, ...extra });
function build(): AppState {
  const s = initialState();
  const C: [string, number, number, string][] = [['احص', 6, 60, '2026-10-28'], ['كيم', 7, 80, '2026-10-29'], ['انجل', 8, 50, '2026-11-04'], ['ريد', 5, 45, '2026-11-08']];
  C.forEach(([name, n, m, date], k) => {
    const id = 'c' + k;
    s.courses.push({ id, name, color: '#000', difficulty: 3, sizeLabel: 'دقيقة', paceGuess: 1, notes: '', archived: false, createdAt: 1 } as any);
    for (let i = 0; i < n; i++) s.units.push({ id: id + 'u' + i, courseId: id, title: 'f' + i, size: m, progress: k === 0 && i < 2 ? 1 : 0, reviewed: false, spent: 0, order: i });
    s.exams.push({ id: 'e' + k, courseId: id, title: 'م', date, time: '10:00', unitIds: Array.from({ length: n }, (_, i) => id + 'u' + i), reviewDays: 0, createdAt: 1 });
  });
  s.schedule = [blk('b1', 'عرب', 0, '08:00', '09:50'), blk('b2', 'كيم', 0, '10:00', '11:50'), blk('b3', 'احص', 2, '08:00', '09:50'), blk('b4', 'انجل', 2, '13:00', '14:50'), blk('b5', 'ريادة', 1, '16:00', '18:00', { remote: true }), blk('b6', 'ريد', 3, '10:00', '11:50')];
  return s;
}
const carry = new Map<string, number>();
// study m minutes of a course the way a student does: lessons in order, then review them
function study(s: AppState, cid: string, m: number, day: string) {
  const units = s.units.filter((u) => u.courseId === cid).sort((a, b) => a.order - b.order);
  for (const u of units) { if (m <= 0.01) break; const g = Math.min(u.size * (1 - u.progress), m); u.progress = Math.min(1, u.progress + g / u.size); m -= g; }
  m += carry.get(cid) || 0;
  for (const u of units) { if (m <= 0.01) break; if (u.reviewed) continue; const need = u.size * s.settings.reviewFactor; if (m + 0.5 >= need) { u.reviewed = true; m -= need; } else break; }
  carry.set(cid, m);
  s.sessions.push({ id: cid + day + Math.random(), courseId: cid, minutes: 0, at: atTime(day, '16:00') } as any);
}
const f = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;

// four exams close together, timetable with travel: study exactly what each day asks, and every exam is reached with all lessons learned and reviewed
it('following the plan exactly gets every exam ready', () => {
  const s = build();
  const out: string[] = [];
  for (let day = '2026-10-25'; day <= '2026-11-08'; day = addDays(day, 1)) {
    const now = atTime(day, day === '2026-10-25' ? '15:00' : '08:00');
    const p = planStudy(s, now);
    const cells: string[] = [];
    let tot = 0;
    for (const e of p.exams) {
      if (e.exam.date === day) {
        const units = s.units.filter((u) => u.courseId === e.course.id);
        const learn = units.filter((u) => u.progress < 0.999).length, rev = units.filter((u) => !u.reviewed).length;
        const lastRev = units.filter((u) => !u.reviewed).map((u) => `${u.title} يحتاج ${u.size * s.settings.reviewFactor}د، معك ${Math.round(carry.get(e.course.id) || 0)}د`).join('؛ ');
        expect([e.course.name, learn, rev]).toEqual([e.course.name, 0, 0]);
        out.push(`   ★ اختبار ${e.course.name}: ${learn === 0 && rev === 0 ? 'جاهز ✓ كل الدروس + المراجعة' : `دروس ناقصة ${learn} · مراجعة ناقصة ${rev} (${lastRev})`}`);
      }
      if (e.exam.date <= day || !e.todayMinutes) continue;
      cells.push(`${e.course.name} ${f(e.todayMinutes)}`);
      tot += e.todayMinutes;
      study(s, e.course.id, e.todayMinutes, day);
    }
    out.push(`${day.slice(5)} ذاكرت ${f(tot)} (وقت المذاكرة ${f(studyCapFor(s, day))} من وقتك ${f(availableFor(s, day))}) | ${cells.join(' · ')}`);
  }
  expect(out.filter((l) => l.includes('★'))).toHaveLength(4);
});
