import { Link } from 'react-router';
import { Briefcase, Globe, RefreshCw, Settings, Tag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type SettingRow = { to: string; label: string; icon: LucideIcon; description: string };

const SETTINGS: SettingRow[] = [
  { to: '/settings/currencies',     label: 'Currencies',     icon: Globe,      description: 'Manage supported currencies' },
  { to: '/settings/exchange-rates', label: 'Exchange Rates', icon: RefreshCw,  description: 'Update FX rates' },
  { to: '/settings/securities',     label: 'Securities',     icon: Briefcase,  description: 'Stocks and funds' },
  { to: '/settings/tags',           label: 'Tags',           icon: Tag,        description: 'Transaction labels' },
  { to: '/settings/preferences',    label: 'Preferences',    icon: Settings,   description: 'App preferences' },
];

export default function SettingsIndex() {
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="container is-fluid">
        <h1 className="title is-5" style={{ marginBottom: '1rem' }}>Settings</h1>
        <table className="table is-fullwidth is-hoverable">
          <tbody>
            {SETTINGS.map(({ to, label, icon: Icon, description }) => (
              <tr key={to}>
                <td style={{ verticalAlign: 'middle' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Icon size={16} style={{ color: '#2AA5A5' }} />
                    <strong>{label}</strong>
                  </span>
                </td>
                <td style={{ verticalAlign: 'middle', color: '#666' }}>{description}</td>
                <td style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                  <Link to={to} style={{ color: '#F5821A' }}>Configure →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
