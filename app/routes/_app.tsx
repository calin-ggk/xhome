import { Fragment } from 'react';
import { NavLink, Outlet, redirect, useLoaderData } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart2,
  Landmark,
  LayoutDashboard,
  LineChart,
  List,
  LogOut,
  Plus,
  Settings,
  TrendingUp,
} from 'lucide-react';
import type { Route } from './+types/_app';
import { db } from '~/db/client';
import { BASE_CURRENCY } from '~/config';
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

const baseLinkStyle = { display: 'flex', alignItems: 'center', paddingLeft: '0.5rem' };
const activeStyle = {
  ...baseLinkStyle,
  color: '#F5821A',
  borderLeft: '3px solid #F5821A',
  paddingLeft: 'calc(0.5rem - 3px)',
  backgroundColor: '#FFF8F4',
  fontWeight: 500 as const,
};

export default function AppLayout() {
  const { netWorth } = useLoaderData<typeof loader>();

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        backgroundColor: '#0D6B6B',
        display: 'flex',
        alignItems: 'center',
        padding: '0 1rem',
        height: '52px',
        flexShrink: 0,
        gap: '1rem',
      }}>
        <span style={{ color: 'white', fontWeight: 600, fontSize: '1.1rem', marginRight: 'auto' }}>
          Finance Tracker
        </span>
        <span style={{ color: 'white', fontSize: '0.875rem' }}>
          Net Worth:{' '}
          <strong style={{ color: 'white' }}>{fmtNetWorth(netWorth)} {BASE_CURRENCY}</strong>
        </span>
        <NavLink
          to="/transactions/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            backgroundColor: '#F5821A',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '0.3rem 0.75rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          <Plus size={14} />
          Transaction
        </NavLink>
        <NavLink
          to="/logout"
          style={{ color: 'rgba(255,255,255,0.8)', display: 'inline-flex', alignItems: 'center' }}
        >
          <LogOut size={18} />
        </NavLink>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <aside style={{
          width: '220px',
          minWidth: '220px',
          backgroundColor: 'white',
          borderRight: '1px solid #E0E0E0',
          overflowY: 'auto',
          padding: '1rem 0.5rem',
        }}>
          <nav className="menu">
            {NAV.map(group => (
              <Fragment key={group.label}>
                <p style={{
                  color: '#2AA5A5',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.09em',
                  padding: '0.75rem 0.75rem 0.25rem',
                  margin: 0,
                }}>
                  {group.label}
                </p>
                <ul className="menu-list">
                  {group.items.map(({ to, label, icon: Icon, end }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={end ?? false}
                        className={({ isActive }) => (isActive ? 'is-active' : '')}
                        style={({ isActive }) => (isActive ? activeStyle : baseLinkStyle)}
                      >
                        <span className="icon is-small" style={{ marginRight: '0.4rem' }}>
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

        <main style={{
          flex: 1,
          backgroundColor: '#F5F5F5',
          overflowY: 'auto',
          padding: '1.5rem',
        }}>
          <Outlet />
        </main>
      </div>

      <footer style={{
        backgroundColor: '#0D6B6B',
        padding: '0.4rem 1rem',
        fontSize: '0.72rem',
        color: 'rgba(255,255,255,0.6)',
        flexShrink: 0,
        textAlign: 'center',
      }}>
        © {new Date().getFullYear()} Finance Tracker
      </footer>
    </div>
  );
}
