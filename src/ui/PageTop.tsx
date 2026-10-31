import { Icon } from './Icon';
import { openSheet } from './sheets';
import { go, useRoute } from './router';
import { pairOf, shown } from './pairs';
import { useApp } from '../lib/store';
import { L } from '../lib/i18n';

/** shared page header: big title, optional subtitle, search + profile on phones */
export function PageTop({ title, sub, actions, back }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; back?: { label: string; to: string } }) {
  const page = useRoute().page;
  const s = useApp();
  const p0 = back ? undefined : pairOf(page);
  const items = p0 ? shown(p0.items, s) : [];
  const pair = p0 && items.length > 1 ? { ...p0, items } : undefined;
  return (
    <header style={{ marginBottom: 18 }}>
      <div className="top">
        {back ? (
          <button className="btn sm ghost" style={{ paddingInlineStart: 4 }} onClick={() => go(back.to)}>
            <Icon name="back" size={16} /> {back.label}
          </button>
        ) : pair ? (
          // two places share one tab: switch between them here (phones; the sidebar lists both)
          <div className="pair-switch hide-desktop" role="tablist" aria-label={L('بدّل القسم', 'Switch section')}>
            {pair.items.map((it) => (
              <button key={it.id} role="tab" aria-selected={it.id === page} className={it.id === page ? 'on' : ''} onClick={() => it.id !== page && go(it.id)}>
                <Icon name={it.icon} size={15} /> {it.label()}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="actions">
          {actions}
          <button className="icon-btn hide-desktop" onClick={() => openSheet({ type: 'palette' })} aria-label={L("بحث", "Search")}><Icon name="search" /></button>
          <button className="icon-btn hide-desktop" onClick={() => go('me')} aria-label={L("أنت والإعدادات", "You & settings")}><Icon name="user" /></button>
        </div>
      </div>
      <h1 className="title-xl">{title}</h1>
      {sub && <p className="lede" style={{ marginBottom: 0 }}>{sub}</p>}
    </header>
  );
}
