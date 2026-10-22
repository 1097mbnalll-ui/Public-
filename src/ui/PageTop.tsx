import { Icon } from './Icon';
import { openSheet } from './sheets';
import { go } from './router';
import { L } from '../lib/i18n';

/** shared page header: big title, optional subtitle, search + profile on phones */
export function PageTop({ title, sub, actions, back }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; back?: { label: string; to: string } }) {
  return (
    <header style={{ marginBottom: 18 }}>
      <div className="top">
        {back ? (
          <button className="btn sm ghost" style={{ paddingInlineStart: 4 }} onClick={() => go(back.to)}>
            <Icon name="back" size={16} /> {back.label}
          </button>
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
