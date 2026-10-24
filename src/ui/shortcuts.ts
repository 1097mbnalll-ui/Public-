// Keyboard shortcuts. Keys are matched by their physical position (e.code), so they work the
// same on an Arabic keyboard («ى» / «ظ») as on an English one.

import { useEffect } from 'react';
import { getState, undo } from '../lib/store';
import * as A from '../lib/actions';
import { openSheet } from './sheets';
import { go } from './router';
import { toast } from './toast';
import { L } from '../lib/i18n';

/** g then a letter → a page */
const GO: Record<string, string> = { KeyT: 'today', KeyK: 'tasks', KeyW: 'work', KeyS: 'study', KeyM: 'money', KeyP: 'me', KeyI: 'me/insights', KeyC: 'coach', KeyL: 'schedule' };
const NAV = ['today', 'tasks', 'work', 'study', 'money'];

/** what the help sheet lists (the handler below is the source of truth) */
export function shortcutList(): { keys: string[]; label: string }[] {
  return [
    { keys: ['N'], label: L('إضافة سريعة (أو مصروف في «مصاريفي»)', 'Quick add (or an expense on Spending)') },
    { keys: ['/'], label: L('بحث', 'Search') },
    { keys: ['Ctrl', 'K'], label: L('بحث — يعمل حتى أثناء الكتابة', 'Search — works even while typing') },
    { keys: ['Ctrl', 'Z'], label: L('تراجع عن آخر عملية', 'Undo the last change') },
    { keys: ['?'], label: L('هذه القائمة', 'This list') },
    { keys: ['G', 'T'], label: L('اليوم', 'Today') },
    { keys: ['G', 'K'], label: L('المهام', 'Tasks') },
    { keys: ['G', 'W'], label: L('العمل', 'Work') },
    { keys: ['G', 'S'], label: L('الدراسة', 'Study') },
    { keys: ['G', 'M'], label: L('مصاريفي', 'Spending') },
    { keys: ['G', 'L'], label: L('جدولي', 'My timetable') },
    { keys: ['G', 'C'], label: L('المدرب', 'Coach') },
    { keys: ['G', 'I'], label: L('ما تعلمته عنك', "What I've learned") },
    { keys: ['G', 'P'], label: L('أنت والإعدادات', 'You & settings') },
    { keys: ['Alt', '1…5'], label: L('الصفحات الخمس الرئيسية', 'The five main pages') },
    { keys: [L('مسافة', 'Space')], label: L('إيقاف/استئناف المؤقت', 'Pause / resume the timer') },
    { keys: ['F'], label: L('وضع التركيز للمؤقت', 'Focus mode for the timer') },
    { keys: ['Esc'], label: L('إغلاق النافذة أو وضع التركيز', 'Close the sheet or focus mode') },
  ];
}

export function useShortcuts() {
  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && e.code === 'KeyK') {
        e.preventDefault();
        openSheet({ type: 'palette' });
        return;
      }
      const el = e.target instanceof Element ? e.target : document.body;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      if (document.querySelector('.sheet')) return;
      if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyZ') {
        const label = undo();
        if (label) {
          e.preventDefault();
          toast(L(`تراجعت عن: ${label}`, `Undid: ${label}`));
        }
        return;
      }
      if (mod) return;
      if (e.altKey) {
        const n = /^Digit([1-5])$/.exec(e.code);
        if (n && !e.shiftKey) {
          e.preventDefault();
          go(NAV[+n[1] - 1]);
        }
        return;
      }

      const timer = getState().timer;
      if (timer && e.code === 'Space' && !el.closest('button, a, [role="button"]')) {
        e.preventDefault();
        if (timer.running) A.pauseTimer();
        else A.resumeTimer();
        return;
      }
      if (timer && e.code === 'KeyF') {
        A.setFocus(!timer.focus);
        return;
      }
      // focus mode covers everything else: nothing may open underneath it
      if (timer?.focus) return;

      if (Date.now() - gAt < 1500 && GO[e.code]) {
        gAt = 0;
        e.preventDefault();
        go(GO[e.code]);
        return;
      }
      gAt = 0;
      if (e.code === 'KeyG' && !e.shiftKey) gAt = Date.now();
      else if (e.code === 'Slash' && e.shiftKey) {
        e.preventDefault();
        openSheet({ type: 'shortcuts' });
      } else if (e.code === 'Slash') {
        e.preventDefault();
        openSheet({ type: 'palette' });
      } else if ((e.code === 'KeyN' && !e.shiftKey) || e.code === 'NumpadAdd' || e.key === '+') {
        e.preventDefault();
        openSheet(location.hash.startsWith('#/money') ? { type: 'expense' } : { type: 'quick' });
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}
