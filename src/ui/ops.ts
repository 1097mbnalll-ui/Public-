// UI-level operations: state change + feedback (toast, undo, follow-up questions).

import * as A from '../lib/actions';
import { getState } from '../lib/store';
import { fmtMinutes } from '../lib/dates';
import { exportBackup } from '../lib/backup';
import { planDay, suggestDeferrals } from '../lib/engine/planner';
import type { Action } from '../lib/engine/insights';
import { toast } from './toast';
import { openSheet } from './sheets';
import { go } from './router';
import { L } from '../lib/i18n';

export function completeTaskUI(id: string) {
  const t = getState().tasks.find((x) => x.id === id);
  if (!t) return;
  A.completeTask(id);
  const est = t.estimate;
  // ask how long it really took — one tap, optional; it's how estimates get better
  if (est && t.spent === 0) {
    const opts = [Math.round(est * 0.6), est, Math.round(est * 1.5), est * 2].map((m) => Math.max(5, Math.round(m / 5) * 5));
    toast(L(`أُنجزت «${t.title}». كم أخذت فعلًا؟`, `Completed “${t.title}”. How long did it really take?`), {
      undoable: true,
      ms: 9000,
      buttons: [...new Set(opts)].map((m) => ({ label: fmtMinutes(m), fn: () => A.setActual(id, m) })),
    });
  } else toast(L(`أُنجزت «${t.title}»`, `Completed “${t.title}”`), { undoable: true });
  if (t.recurrence) setTimeout(() => toast(L('أُضيف الموعد القادم لهذه المهمة المتكررة', "The next occurrence of this recurring task was added")), 400);
}

export function deferTaskUI(id: string) {
  A.deferTask(id);
  toast(L('نُقلت إلى الغد', "Moved to tomorrow"), { undoable: true });
}

export function toggleStepUI(procId: string, stepId: string) {
  const p = getState().procedures.find((x) => x.id === procId);
  const st = p?.steps.find((s) => s.id === stepId);
  if (!p || !st) return;
  // sending is an external action — the app only records what you confirm you did
  if (!st.done && st.kind === 'send') return openSheet({ type: 'step-confirm', procId, stepId });
  A.toggleStep(procId, stepId);
  const after = getState().procedures.find((x) => x.id === procId);
  if (after?.completedAt && !p.completedAt) toast(L(`اكتمل «${p.title}» بكل خطواته`, `“${p.title}” completed — all steps done`), { undoable: true });
  else toast(st.done ? L('أُعيد فتح الخطوة', "Step reopened") : L(`تم: ${st.title}`, `Done: ${st.title}`), { undoable: true });
}

export function exportUI() {
  exportBackup(getState());
  A.setMeta({ lastExportAt: Date.now() });
  toast(L('نزلت النسخة الاحتياطية. احفظها في مكان آمن (iCloud / Drive).', "Backup downloaded. Keep it somewhere safe (iCloud / Drive)."));
}

export function runAction(a: Action) {
  switch (a.act) {
    case 'open-task':
      return openSheet({ type: 'task', id: a.arg! });
    case 'start-task': {
      const t = getState().tasks.find((x) => x.id === a.arg);
      if (t) A.startTimer({ kind: 'task', refId: t.id, label: t.title });
      return;
    }
    case 'done-task':
      return completeTaskUI(a.arg!);
    case 'open-proc':
      return go(`work/${a.arg}`);
    case 'open-exam':
      return openSheet({ type: 'exam', id: a.arg });
    case 'go':
      return go(a.arg!);
    case 'replan':
      return openSheet({ type: 'replan' });
    case 'auto-replan':
      return autoReplanUI();
    case 'export':
      return exportUI();
    case 'set-estimate':
      A.updateTask(a.arg!, { estimate: a.value });
      return toast(L('حُفظ التقدير', "Estimate saved"));
    case 'set-pace':
      A.updateCourse(a.arg!, { paceGuess: a.value });
      return toast(L('حُفظ — سيتحسن التقدير مع كل جلسة مذاكرة تسجلها', "Saved — the estimate improves with every study session you log"));
    case 'step-done': {
      const [pid, sid] = a.arg!.split(':');
      return toggleStepUI(pid, sid);
    }
    case 'proc-followup': {
      A.addLog(a.arg!, L('تمت متابعة الطلب (بانتظار الرد)', "Followed up on the request (awaiting reply)"));
      return toast(L('سُجلت المتابعة', "Follow-up logged"));
    }
    case 'drop-task':
      A.dropTask(a.arg!);
      return toast(L('أُلغيت المهمة', "Task cancelled"), { undoable: true });
  }
}

/** one tap: push the lowest-value, non-urgent tasks to tomorrow until today fits */
export function autoReplanUI() {
  const s = getState();
  const plan = planDay(s);
  const moves = suggestDeferrals(plan, s);
  if (!moves.length) {
    toast(L('لا توجد مهام يمكن ترحيلها — كل ما في خطتك عاجل أو لا يتأجل', "Nothing can be moved — everything in your plan is urgent or can't be postponed"));
    return;
  }
  A.deferMany(moves.map((m) => m.id));
  const after = planDay(getState());
  const list = moves.map((m) => `«${m.title}»`).join(L('، ', ", "));
  toast(
    after.overloaded
      ? L(`رحّلت ${list} إلى الغد. ما زال اليوم أكبر بـ ${fmtMinutes(after.overBy)} (عاجل أو لا يتأجل).`, `Moved ${list} to tomorrow. Today is still ${fmtMinutes(after.overBy)} over (urgent or can't be postponed).`)
      : L(`رحّلت ${list} إلى الغد — يومك الآن يتسع لخطتك ✓`, `Moved ${list} to tomorrow — your day now fits your plan ✓`),
    { undoable: true, ms: 9000 },
  );
}
