import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { applyTheme, AUTO } from './lib/themes';
import { Icon } from './ui/Icon';
import { useApp } from './lib/store';
import { useRoute, go } from './ui/router';
import { openSheet } from './ui/sheets';
import { SheetHost, TimerBar, useHeartbeat, useQuotaLog } from './ui/Shell';
import { useShortcuts } from './ui/shortcuts';
import { Toasts } from './ui/toast';
import { FocusScreen } from './ui/Focus';
import { Today } from './pages/Today';
import { Tasks } from './pages/Tasks';
import { Work } from './pages/Work';
import { Study } from './pages/Study';
import { Insights } from './pages/Insights';
import { Settings } from './pages/Settings';
import { Import } from './pages/Import';
import { Receive } from './pages/Receive';
import { CoachPage } from './pages/Coach';
import { Money } from './pages/Money';
import { SyncJoin } from './pages/SyncJoin';
import { Schedule } from './pages/Schedule';
import { InstallCard } from './ui/InstallCard';
import { PageTop } from './ui/PageTop';
import { CoachFab } from './ui/Coach';
import { todayKey } from './lib/dates';
import { L } from './lib/i18n';

// Five places, each answering one question:
// اليوم: what do I do now? · المهام: what's on my list? · العمل: where is each procedure? · الدراسة: am I ready? · مصاريفي: where does my money go?
const NAV = [
  { id: 'today', get label() { return L('اليوم', "Today"); }, icon: 'today' },
  { id: 'tasks', get label() { return L('المهام', "Tasks"); }, icon: 'tasks' },
  { id: 'work', get label() { return L('العمل', "Work"); }, icon: 'work' },
  { id: 'study', get label() { return L('الدراسة', "Study"); }, icon: 'study' },
  { id: 'money', get label() { return L('مصاريفي', 'Spending'); }, icon: 'wallet' },
];

/** old links keep working */
function resolve(page: string, id?: string): { page: string; id?: string } {
  if (page === 'week') return { page: 'today', id: 'week' };
  if (page === 'settings') return { page: 'me' };
  if (page === 'install') return { page: 'install' };
  if (page === 'insights') return { page: 'me', id: 'insights' };
  if (NAV.some((n) => n.id === page) || page === 'me' || page === 'coach' || page === 'import' || page === 'receive' || page === 'sync' || page === 'schedule') return { page, id };
  return { page: 'today' };
}

export function App() {
  const s = useApp();
  const route = useRoute();
  useHeartbeat();
  useQuotaLog();
  useShortcuts();

  const lng = s.settings.lang;
  const theme = s.settings.theme;
  useLayoutEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    if (theme !== AUTO) return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme(theme);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lng === 'en' ? 'en' : 'ar';
    document.documentElement.dir = lng === 'en' ? 'ltr' : 'rtl';
    document.title = lng === 'en' ? 'Masar' : 'مسار';
  }, [lng]);

  // welcome once — but never on top of an import link; it shows on the next page instead
  const welcomed = useRef(false);
  useEffect(() => {
    if (welcomed.current || s.meta.onboarded || route.page === 'import' || route.page === 'receive' || route.page === 'sync' || route.page === 'install') return;
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

  // every person / group / place used in a step so far, offered as suggestions
  const targets = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of s.procedures) for (const st of p.steps) if (st.target?.trim()) c.set(st.target.trim(), (c.get(st.target.trim()) || 0) + 1);
    for (const t of s.templates) for (const st of t.steps) if (st.target?.trim()) c.set(st.target.trim(), (c.get(st.target.trim()) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [s.procedures, s.templates]);

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
    case 'receive':
      body = <Receive />;
      break;
    case 'coach':
      body = <CoachPage />;
      break;
    case 'money':
      body = <Money />;
      break;
    case 'sync':
      body = <SyncJoin />;
      break;
    case 'schedule':
      body = <Schedule />;
      break;
    case 'install':
      body = <div><PageTop title={L('ثبّت «مسار»', 'Install Masar')} /><InstallCard always /></div>;
      break;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="logo" size={18} stroke={2.2} style={{ color: '#fff' }} /></span>{L("مسار", "Masar")}</div>
        <button className="btn primary block side-add" onClick={() => openSheet(page === 'money' ? { type: 'expense' } : { type: 'quick' })}>
          <Icon name="plus" size={17} />{L(" جديد ", " New ")}<span className="kbd" style={{ borderColor: 'currentColor', color: 'inherit', opacity: 0.8 }}>N</span>
        </button>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
            <Icon name={n.icon} /> {n.label}
            {counts[n.id] ? <span className="count">{counts[n.id]}</span> : null}
          </button>
        ))}
        <div className="spacer" />
        <button className="nav-item" onClick={() => openSheet({ type: 'palette' })}>
          <Icon name="search" />{L(" بحث ", " Search ")}<span className="count kbd">/</span>
        </button>
        <button className={`nav-item ${page === 'me' ? 'active' : ''}`} onClick={() => go('me')}>
          <Icon name="user" />{L(" أنت والإعدادات", " You & settings")}</button>
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
        <button className="tab-add" onClick={() => openSheet(page === 'money' ? { type: 'expense' } : { type: 'quick' })} aria-label={L("إضافة", "Add")}>
          <Icon name="plus" size={24} stroke={2.4} />
        </button>
        {NAV.slice(2).map((n) => (
          <button key={n.id} className={`tab ${page === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
            <Icon name={n.icon} size={22} /> {n.label}
          </button>
        ))}
      </nav>

      <datalist id="masar-targets">
        {targets.map((t) => <option key={t} value={t} />)}
      </datalist>
      <TimerBar />
      {s.timer?.focus && <FocusScreen />}
      <SheetHost />
      {page !== 'coach' && page !== 'import' && page !== 'receive' && page !== 'sync' && <CoachFab />}
      <Toasts />
    </div>
  );
}
