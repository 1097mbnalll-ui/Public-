import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export function Sheet({
  title,
  onClose,
  children,
  footer,
  wide,
  headExtra,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  headExtra?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('[autofocus], input, textarea');
    if (first && matchMedia('(pointer: fine)').matches) first.focus();
    return () => {
      removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${wide ? 'wide' : ''}`} ref={ref} role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2 className="grow">{title}</h2>
          {headExtra}
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق">
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; l: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={String(o.v)} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)} role="tab" aria-selected={o.v === value}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} aria-label={label} />;
}

export function Check({ on, onClick, square, label }: { on: boolean; onClick: () => void; square?: boolean; label?: string }) {
  return (
    <button
      className={`check ${on ? 'on' : ''} ${square ? 'square' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label || (on ? 'إلغاء الإنجاز' : 'إنجاز')}
      aria-pressed={on}
    >
      <Icon name="check" size={14} stroke={3} />
    </button>
  );
}

export function Ring({ value, size = 44, stroke = 4, color = 'var(--accent)', label }: { value: number; size?: number; stroke?: number; color?: string; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <span className="ring-label">{label ?? `${Math.round(v * 100)}%`}</span>
    </div>
  );
}

export function Bar({ value, color, thick }: { value: number; color?: string; thick?: boolean }) {
  return (
    <div className={`bar ${thick ? 'thick' : ''}`}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

export function Empty({ icon = 'check', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big-ic">
        <Icon name={icon} size={24} />
      </div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {children && <div className="small" style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export function Collapse({ title, children, defaultOpen, count }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; count?: number }) {
  return (
    <details open={defaultOpen}>
      <summary className="collapse-head">
        <Icon name="chevron" size={16} className="chev" />
        {title}
        {count != null && <span className="faint small">({count})</span>}
      </summary>
      <div style={{ marginTop: 8 }}>{children}</div>
    </details>
  );
}

/** number input that commits on blur / enter to avoid churn while typing */
export function NumInput({ value, onChange, min = 0, step = 1, className = 'input', placeholder, suffix }: { value?: number; onChange: (v: number | undefined) => void; min?: number; step?: number; className?: string; placeholder?: string; suffix?: string }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => setV(value == null ? '' : String(value)), [value]);
  const commit = () => {
    const n = v.trim() === '' ? undefined : Math.max(min, Number(v.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))));
    if (n === undefined || !Number.isNaN(n)) onChange(n);
  };
  return (
    <div className="row" style={{ gap: 6 }}>
      <input
        className={className}
        inputMode="decimal"
        value={v}
        step={step}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {suffix && <span className="faint small">{suffix}</span>}
    </div>
  );
}

export function useNow(interval = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    const vis = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [interval]);
  return now;
}

export function confirmAsk(msg: string) {
  return window.confirm(msg);
}

export function Group({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {(title || action) && (
        <div className="group-title">
          <span>{title}</span>
          {action}
        </div>
      )}
      <div className="rows">{children}</div>
    </section>
  );
}

/** list row: icon · label/sub · value · chevron */
export function Row({
  icon,
  iconColor,
  label,
  sub,
  value,
  onClick,
  chevron,
  danger,
  end,
}: {
  icon?: string;
  iconColor?: string;
  label: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
  end?: ReactNode;
}) {
  const inner = (
    <>
      {icon && (
        <span className="ic" style={iconColor ? { color: iconColor, background: `color-mix(in srgb, ${iconColor} 15%, transparent)` } : undefined}>
          <Icon name={icon} size={17} />
        </span>
      )}
      <span className="main-t">
        <div className="lbl">{label}</div>
        {sub && <div className="sub">{sub}</div>}
      </span>
      {value != null && <span className="val">{value}</span>}
      {end}
      {chevron && <Icon name="chevron" size={16} className="chev-end" />}
    </>
  );
  return onClick ? (
    <button className={`r ${danger ? 'danger' : ''}`} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className={`r ${danger ? 'danger' : ''}`}>{inner}</div>
  );
}

export function Stepper({ value, onChange, step = 30, min = 0, max = 960, format }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; format: (v: number) => string }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - step))} aria-label="إنقاص"><Icon name="minus" size={16} /></button>
      <span>{format(value)}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} aria-label="زيادة"><Icon name="plus" size={16} /></button>
    </div>
  );
}
