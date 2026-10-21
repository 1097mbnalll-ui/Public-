import type { AppState } from './types';
import { migrate } from './defaults';
import { todayKey } from './dates';

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
    throw new Error('الملف ليس بصيغة JSON صحيحة.');
  }
  const data = raw && raw.app === 'masar' ? raw.data : raw;
  if (!data || typeof data !== 'object' || !Array.isArray(data.tasks) || !Array.isArray(data.procedures))
    throw new Error('هذا الملف لا يبدو نسخة احتياطية من «مسار».');
  const state = migrate(data);
  return {
    state,
    exportedAt: raw.exportedAt,
    counts: [
      { label: 'مهام', n: state.tasks.length },
      { label: 'إجراءات عمل', n: state.procedures.length },
      { label: 'قوالب', n: state.templates.length },
      { label: 'مواد', n: state.courses.length },
      { label: 'اختبارات', n: state.exams.length },
      { label: 'جلسات مذاكرة', n: state.sessions.length },
    ],
  };
}
