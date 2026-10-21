// UI-level operations: state change + feedback (toast, undo, follow-up questions).

import * as A from '../lib/actions';
import { getState } from '../lib/store';
import { fmtMinutes } from '../lib/dates';
import { exportBackup } from '../lib/backup';
import type { Action } from '../lib/engine/insights';
import { toast } from './toast';
import { openSheet } from './sheets';
import { go } from './router';

export function completeTaskUI(id: string) {
  const t = getState().tasks.find((x) => x.id === id);
  if (!t) return;
  A.completeTask(id);
  const est = t.estimate;
  // ask how long it really took — one tap, optional; it's how estimates get better
  if (est && t.spent === 0) {
    const opts = [Math.round(est * 0.6), est, Math.round(est * 1.5), est * 2].map((m) => Math.max(5, Math.round(m / 5) * 5));
    toast(`أُنجزت «${t.title}». كم أخذت فعلًا؟`, {
      undoable: true,
      ms: 9000,
      buttons: [...new Set(opts)].map((m) => ({ label: fmtMinutes(m), fn: () => A.setActual(id, m) })),
    });
  } else toast(`أُنجزت «${t.title}»`, { undoable: true });
  if (t.recurrence) setTimeout(() => toast('أُضيف الموعد القادم لهذه المهمة المتكررة'), 400);
}

export function deferTaskUI(id: string) {
  A.deferTask(id);
  toast('نُقلت إلى الغد', { undoable: true });
}

export function toggleStepUI(procId: string, stepId: string) {
  const p = getState().procedures.find((x) => x.id === procId);
  const st = p?.steps.find((s) => s.id === stepId);
  if (!p || !st) return;
  // sending is an external action — the app only records what you confirm you did
  if (!st.done && st.kind === 'send') return openSheet({ type: 'step-confirm', procId, stepId });
  A.toggleStep(procId, stepId);
  const after = getState().procedures.find((x) => x.id === procId);
  if (after?.completedAt && !p.completedAt) toast(`اكتمل «${p.title}» بكل خطواته`, { undoable: true });
  else toast(st.done ? 'أُعيد فتح الخطوة' : `تم: ${st.title}`, { undoable: true });
}

export function exportUI() {
  exportBackup(getState());
  A.setMeta({ lastExportAt: Date.now() });
  toast('نزلت النسخة الاحتياطية. احفظها في مكان آمن (iCloud / Drive).');
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
    case 'export':
      return exportUI();
    case 'set-estimate':
      A.updateTask(a.arg!, { estimate: a.value });
      return toast('حُفظ التقدير');
    case 'set-pace':
      A.updateCourse(a.arg!, { paceGuess: a.value });
      return toast('حُفظ — سيتحسن التقدير مع كل جلسة مذاكرة تسجلها');
    case 'step-done': {
      const [pid, sid] = a.arg!.split(':');
      return toggleStepUI(pid, sid);
    }
    case 'proc-followup': {
      A.addLog(a.arg!, 'تمت متابعة الطلب (بانتظار الرد)');
      return toast('سُجلت المتابعة');
    }
    case 'drop-task':
      A.dropTask(a.arg!);
      return toast('أُلغيت المهمة', { undoable: true });
  }
}
