import { useEffect, useMemo, useRef } from 'react';
import { Icon } from './ui/Icon';
import { useApp } from './lib/store';
import { useRoute, go } from './ui/router';
import { openSheet } from './ui/sheets';
import { SheetHost, TimerBar, useHeartbeat, useQuotaLog, useShortcuts } from './ui/Shell';
import { Toasts } from './ui/toast';
import { FocusScreen } from './ui/Focus';
import { Today } from './pages/Today';
import { Tasks } from './pages/Tasks';
import { Work } from './pages/Work';
import { Study } from './pages/Study';
import { Insights } from './pages/Insights';
import { Settings } from './pages/Settings';
import { Import } from './pages/Import';
import { todayKey } from './lib/dates';

// Four places, each answering one question:
// اليوم: what do I do now? · المهام: what's on my list? · العمل: where is each procedure? · الدراسة: am I ready?
const NAV = [
  { id: 'today', label: 'اليوم', icon: 'today' },
  { id: 'tasks', label: 'المهام', icon: 'tasks' },
  { id: 'work', label: 'العمل', icon: 'work' },
  { id: 'study', label: 'الدراسة', icon: 'study' },
];

/** old links keep working */
function resolve(page: string, id?: string): { page: string; id?: string } {
  if (page === 'week') return { page: 'today', id: 'week' };
  if (page === 'settings') return { page: 'me' };
  if (page === 'insights') return { page: 'me', id: 'insights' };
  if (NAV.some((n) => n.id === page) || page === 'me' || page === 'import') return { page, id };
  return { page: 'today' };
}

export function App() {
  const s = useApp();
  const route = useRoute();
  useHeartbeat();
  useQuotaLog();
  useShortcuts();

  // welcome once — but never on top of an import link; it shows on the next page instead
  const welcomed = useRef(false);
  useEffect(() => {
    if (welcomed.current || s.meta.onboarded || route.page === 'import') return;
    welcomed.current = true;
    setTimeout(() => openSheet({ type: 'onboarding' }), 50);
  }, [route.page, s.meta.onboarded]);

  const counts = useMemo(() => {
    const today = todayKey();
    return {
      tasks: s.tasks.filter((t) => t.status === 'open' && t.due && t.due <= today).length,
      work: s.procedures.filter((p) => !p.archived && !p.completedAt).length,
    } as Record<string, number>;
  }, [s]);

  const { page, id } = resolve(route.page, route.id);
  const wide = page === 'today' || (page === 'work' && !!id);
  let body: React.ReactNode;
  switch (page) {
    case 'today':
      body = <Today view={id === 'week' ? 'week' : 'day'} />;
      break;
    case 'tasks':
      body = <Tasks />;
      break;
    case 'work':
      body = <Work />;
      break;
    case 'study':
      body = <Study />;
      break;
    case 'me':
      body = id === 'insights' ? <Insights /> : <Settings />;
      break;
    case 'import':
      body = <Import />;
      break;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="logo" size={18} stroke={2.2} style={{ color: '#fff' }} /></span>
          مسار
        </div>
        <button className="btn primary block side-add" onClick={() => openSheet({ type: 'quick' })}>
          <Icon name="plus" size={17} /> جديد <span className="kbd" style={{ borderColor: 'rgba(0,0,0,.2)', color: 'rgba(0,0,0,.55)' }}>N</span>
        </button>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
            <Icon name={n.icon} /> {n.label}
            {counts[n.id] ? <span className="count">{counts[n.id]}</span> : null}
          </button>
        ))}
        <div className="spacer" />
        <button className="nav-item" onClick={() => openSheet({ type: 'palette' })}>
          <Icon name="search" /> بحث <span className="count kbd">/</span>
        </button>
        <button className={`nav-item ${page === 'me' ? 'active' : ''}`} onClick={() => go('me')}>
          <Icon name="user" /> أنت والإعدادات
        </button>
      </aside>

      <main className={`main ${wide ? 'wide' : ''}`} key={page + (id || '')}>
        {body}
      </main>

      <nav className="tabbar">
        {NAV.slice(0, 2).map((n) => (
          <button key={n.id} className={`tab ${page === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
            <Icon name={n.icon} size={22} /> {n.label}
          </button>
        ))}
        <button className="tab-add" onClick={() => openSheet({ type: 'quick' })} aria-label="إضافة">
          <Icon name="plus" size={24} stroke={2.4} />
        </button>
        {NAV.slice(2).map((n) => (
          <button key={n.id} className={`tab ${page === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
            <Icon name={n.icon} size={22} /> {n.label}
          </button>
        ))}
      </nav>

      <TimerBar />
      {s.timer?.focus && <FocusScreen />}
      <SheetHost />
      <Toasts />
    </div>
  );
}
