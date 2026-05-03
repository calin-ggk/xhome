import "./_app.css";
import { Fragment, useState } from 'react';
import { NavLink, Outlet, redirect, useLoaderData, useLocation } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart2,
  Landmark,
  LayoutDashboard,
  LineChart,
  List,
  LogOut,
  Menu,
  Plus,
  Settings,
  TrendingUp,
} from 'lucide-react';
import type { Route } from './+types/_app';
import { db } from '~/db/client';
import { BASE_CURRENCY } from '~/constants';
import { getSession } from '~/session.server';
import { getNetWorth } from '~/services/dashboard.service';

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get('Cookie'));
  if (!session.get('authenticated')) throw redirect('/login');
  return { netWorth: getNetWorth(db) };
}

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/transactions', label: 'Transactions', icon: List },
    ],
  },
  {
    label: 'Accounts',
    items: [{ to: '/accounts', label: 'Accounts', icon: Landmark }],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/reports/balance-sheet', label: 'Balance Sheet', icon: BarChart2 },
      { to: '/reports/income', label: 'Income', icon: TrendingUp },
      { to: '/reports/net-worth', label: 'Net Worth', icon: LineChart },
    ],
  },
  {
    label: 'Settings',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
];

function fmtNetWorth(cents: number): string {
  return (cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AppLayout() {
  const { netWorth } = useLoaderData<typeof loader>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const activeItem = NAV.flatMap(g => g.items).find(item =>
    item.end ? pathname === item.to : pathname.startsWith(item.to)
  );
  const headerTitle = activeItem
    ? `Finance Tracker — ${activeItem.label}`
    : 'Finance Tracker';

  return (
    <div className="app-wrapper">
      <header className="app-header">
        <button type="button" className="app-hamburger" onClick={() => setSidebarOpen(o => !o)}>
          <Menu size={22} />
        </button>
        <span className="app-title">{headerTitle}</span>
        <span className="app-net-worth">
          Net Worth:{' '}
          <strong className="has-text-white">{fmtNetWorth(netWorth)} {BASE_CURRENCY}</strong>
        </span>
        <NavLink to="/transactions/new" className="app-btn-add">
          <Plus size={14} />
          Transaction
        </NavLink>
        <NavLink to="/logout" className="app-btn-logout">
          <LogOut size={18} />
        </NavLink>
      </header>

      <div className="app-content">
        {sidebarOpen && (
          <div className="app-overlay" onClick={() => setSidebarOpen(false)} />
        )}
        <aside className={`app-sidebar${sidebarOpen ? ' is-open' : ''}`}>
          <nav className="menu">
            {NAV.map(group => (
              <Fragment key={group.label}>
                <p className="app-nav-group-label">{group.label}</p>
                <ul className="menu-list">
                  {group.items.map(({ to, label, icon: Icon, end }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={end ?? false}
                        className={({ isActive }) => (isActive ? 'is-active' : '')}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <span className="icon is-small">
                          <Icon size={14} />
                        </span>
                        {label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </Fragment>
            ))}
          </nav>
        </aside>

        <main className="app-main">
          <Outlet />
        </main>
      </div>

      <footer className="app-footer">
        © {new Date().getFullYear()} Finance Tracker
      </footer>
    </div>
  );
}
