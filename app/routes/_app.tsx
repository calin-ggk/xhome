import "./_app.css";
import { Fragment, useState } from 'react';
import { Form, NavLink, Outlet, redirect, useLoaderData, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart2,
  Calendar,
  Landmark,
  LayoutDashboard,
  LineChart,
  List,
  LogOut,
  Menu,
  Plus,
  Scale,
  Settings,
  TrendingUp,
} from 'lucide-react';
import type { Route } from './+types/_app';
import { db } from '~/db/client';
import { getSession } from '~/session.server';
import { getNetWorth } from '~/services/dashboard.service';
import { getBaseCurrency } from '~/services/currency.service';
import { LANG_KEY } from '~/i18n';
import { useFormat } from '~/hooks/useFormat';

export type AppOutletContext = { baseCurrencyCode: string };

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get('Cookie'));
  if (!session.get('authenticated')) throw redirect('/login');
  return { netWorth: getNetWorth(db), baseCurrencyCode: getBaseCurrency(db)?.code ?? '' };
}

type NavItem  = { to: string; key: string; icon: LucideIcon; end?: boolean };
type NavGroup = { key: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    key: 'nav.main',
    items: [
      { to: '/',             key: 'nav.dashboard',    icon: LayoutDashboard, end: true },
      { to: '/transactions', key: 'nav.transactions', icon: List },
    ],
  },
  {
    key: 'nav.accounts',
    items: [{ to: '/accounts', key: 'nav.accounts', icon: Landmark }],
  },
  {
    key: 'nav.analytics',
    items: [
      { to: '/reports/balance-sheet', key: 'nav.balanceSheet', icon: BarChart2 },
      { to: '/reports/income',        key: 'nav.income',       icon: TrendingUp },
      { to: '/reports/net-worth',     key: 'nav.netWorth',     icon: LineChart },
      { to: '/reports/securities',    key: 'nav.securities',   icon: Activity },
    ],
  },
  {
    key: 'nav.monthEnd',
    items: [
      { to: '/reconcile', key: 'nav.reconcile', icon: Scale },
      { to: '/snapshots', key: 'nav.snapshots', icon: Calendar },
    ],
  },
  {
    key: 'nav.settings',
    items: [{ to: '/settings', key: 'nav.settings', icon: Settings }],
  },
];

export default function AppLayout() {
  const { netWorth, baseCurrencyCode } = useLoaderData<typeof loader>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();
  const { fmtAmount } = useFormat();

  const activeItem = NAV.flatMap(g => g.items).find(item =>
    item.end ? pathname === item.to : pathname.startsWith(item.to)
  );
  const headerTitle = activeItem
    ? `${t('financeTracker')} — ${t(activeItem.key)}`
    : t('financeTracker');

  const toggleLang = () => {
    const next = i18n.language.startsWith('ro') ? 'en' : 'ro';
    void i18n.changeLanguage(next);
    localStorage.setItem(LANG_KEY, next);
  };

  return (
    <div className="app-wrapper">
      <header className="app-header">
        <button type="button" className="app-hamburger" onClick={() => setSidebarOpen(o => !o)}>
          <Menu size={22} />
        </button>
        <span className="app-title">{headerTitle}</span>
        <span className="app-net-worth">
          {t('header.netWorth')}:{' '}
          <strong className="has-text-white">{fmtAmount(netWorth)} {baseCurrencyCode}</strong>
        </span>
        <button type="button" className="app-btn-lang" onClick={toggleLang}>
          {i18n.language.startsWith('ro') ? 'EN' : 'RO'}
        </button>
        <NavLink to="/transactions/new" className="app-btn-add">
          <Plus size={14} />
          {t('header.addTransaction')}
        </NavLink>
        <Form method="post" action="/logout">
          <button type="submit" className="app-btn-logout">
            <LogOut size={18} />
          </button>
        </Form>
      </header>

      <div className="app-content">
        {sidebarOpen && (
          <div className="app-overlay" onClick={() => setSidebarOpen(false)} />
        )}
        <aside className={`app-sidebar${sidebarOpen ? ' is-open' : ''}`}>
          <nav className="menu">
            {NAV.map(group => (
              <Fragment key={group.key}>
                <p className="app-nav-group-label">{t(group.key)}</p>
                <ul className="menu-list">
                  {group.items.map(({ to, key, icon: Icon, end }) => (
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
                        {t(key)}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </Fragment>
            ))}
          </nav>
        </aside>

        <main className="app-main">
          <Outlet context={{ baseCurrencyCode } satisfies AppOutletContext} />
        </main>
      </div>

      <footer className="app-footer">
        {t('footer.copyright', { year: new Date().getFullYear() })}
      </footer>
    </div>
  );
}
