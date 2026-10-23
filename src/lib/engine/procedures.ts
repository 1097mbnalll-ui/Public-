import type { Procedure, Step, StepKind } from '../types';
import { L } from '../i18n';

export const STEP_KINDS: { kind: StepKind; label: string; waiting: string; icon: string }[] = [
  { kind: 'action', get label() { return L('تنفيذ', "Do"); }, get waiting() { return L('بانتظار التنفيذ', "Waiting to be done"); }, icon: 'bolt' },
  { kind: 'print', get label() { return L('طباعة', "Print"); }, get waiting() { return L('بانتظار الطباعة', "Waiting to print"); }, icon: 'printer' },
  { kind: 'file', get label() { return L('حفظ', "File"); }, get waiting() { return L('بانتظار الحفظ', "Waiting to file"); }, icon: 'folder' },
  { kind: 'certify', get label() { return L('تصديق', "Certify"); }, get waiting() { return L('بانتظار التصديق', "Waiting for certification"); }, icon: 'stamp' },
  { kind: 'send', get label() { return L('إرسال', "Send"); }, get waiting() { return L('بانتظار الإرسال', "Waiting to send"); }, icon: 'send' },
  { kind: 'reply', get label() { return L('انتظار رد', "Await reply"); }, get waiting() { return L('بانتظار الرد', "Waiting for a reply"); }, icon: 'hourglass' },
  { kind: 'followup', get label() { return L('متابعة', "Follow up"); }, get waiting() { return L('بانتظار المتابعة', "Waiting for follow-up"); }, icon: 'repeat' },
];

export const kindInfo = (k?: StepKind) => STEP_KINDS.find((s) => s.kind === k) || STEP_KINDS[0];

export function nextStep(p: Procedure): Step | undefined {
  return p.steps.find((s) => !s.done);
}

export type ProcStage = 'new' | 'partial' | 'waiting' | 'done';

export function procStage(p: Procedure): ProcStage {
  const done = p.steps.filter((s) => s.done).length;
  if (p.steps.length && done === p.steps.length) return 'done';
  const next = nextStep(p);
  if (next && next.kind === 'reply') return 'waiting';
  return done === 0 ? 'new' : 'partial';
}

export function procProgress(p: Procedure): number {
  return p.steps.length ? p.steps.filter((s) => s.done).length / p.steps.length : 0;
}

export function isProcDone(p: Procedure): boolean {
  return p.steps.length > 0 && p.steps.every((s) => s.done);
}

/** last time anything happened on the procedure */
export function lastActivity(p: Procedure): number {
  const stepTimes = p.steps.map((s) => s.doneAt || 0);
  return Math.max(p.updatedAt, p.createdAt, ...stepTimes);
}

/** minutes of hands-on work left (waiting for a reply costs no time) */
export function procMinutes(p: Procedure): number {
  return p.steps.filter((s) => !s.done && s.kind !== 'reply').length * 10;
}

/** plain-text summary that can be copied / shared to whoever receives it */
export function procSummary(p: Procedure): string {
  const lines = [p.title];
  for (const f of p.fields) if (f.value.trim()) lines.push(`${f.key}: ${f.value}`);
  if (p.notes.trim()) lines.push(p.notes.trim());
  return lines.join('\n');
}
