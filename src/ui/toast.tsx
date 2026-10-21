import { useSyncExternalStore } from 'react';
import { undo } from '../lib/store';

export interface ToastBtn {
  label: string;
  fn: () => void;
  primary?: boolean;
}

interface Toast {
  id: number;
  text: string;
  buttons: ToastBtn[];
}

let toasts: Toast[] = [];
let seq = 0;
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());

export function toast(text: string, opts: { buttons?: ToastBtn[]; undoable?: boolean; ms?: number } = {}) {
  const id = ++seq;
  const buttons = [...(opts.buttons || [])];
  if (opts.undoable) buttons.push({ label: 'تراجع', fn: () => undo() });
  toasts = [{ id, text, buttons }];
  emit();
  setTimeout(() => dismiss(id), opts.ms ?? (buttons.length ? 6500 : 3200));
  return id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function Toasts() {
  const list = useSyncExternalStore(
    (f) => {
      ls.add(f);
      return () => ls.delete(f);
    },
    () => toasts,
  );
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.buttons.map((b) => (
            <button
              key={b.label}
              className={`btn sm ${b.primary ? 'primary' : ''}`}
              onClick={() => {
                b.fn();
                dismiss(t.id);
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
