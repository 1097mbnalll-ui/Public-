import type { AppState } from './types';
import { migrate } from './defaults';
import { todayKey } from './dates';
import { L } from './i18n';

export function download(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportBackup(state: AppState): string {
  const payload = { app: 'masar', format: 1, exportedAt: new Date().toISOString(), data: state };
  const json = JSON.stringify(payload, null, 1);
  download(`masar-backup-${todayKey()}.json`, json);
  return json;
}

export interface ImportPreview {
  state: AppState;
  counts: { label: string; n: number }[];
  exportedAt?: string;
}

export function readBackup(text: string): ImportPreview {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(L('الملف ليس بصيغة JSON صحيحة.', "The file is not valid JSON."));
  }
  const data = raw && raw.app === 'masar' ? raw.data : raw;
  if (!data || typeof data !== 'object' || !Array.isArray(data.tasks) || !Array.isArray(data.procedures))
    throw new Error(L('هذا الملف لا يبدو نسخة احتياطية من «مدار».', "This file doesn't look like a Madar backup."));
  const state = migrate(data);
  return {
    state,
    exportedAt: raw.exportedAt,
    counts: stateCounts(state),
  };
}

/** what a backup / transfer holds, for the "this will replace…" preview (empty kinds left out) */
export function stateCounts(s: AppState): { label: string; n: number }[] {
  return [
    { label: L('مهام', "tasks"), n: s.tasks.length },
    { label: L('إجراءات عمل', "work procedures"), n: s.procedures.length },
    { label: L('قوالب', "templates"), n: s.templates.length },
    { label: L('مواد', "courses"), n: s.courses.length },
    { label: L('اختبارات', "exams"), n: s.exams.length },
    { label: L('جلسات مذاكرة', "study sessions"), n: s.sessions.length },
    { label: L('مصاريف', "expenses"), n: s.expenses.length },
    { label: L('اشتراكات', "subscriptions"), n: s.subs.length },
    { label: L('محاضرات/دوامات', "timetable blocks"), n: s.schedule.length },
  ].filter((x) => x.n);
}
