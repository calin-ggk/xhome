import "./_app.settings._index.css";
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
    <section className="section pt-0">
      <div className="container is-fluid">
        <table className="table is-fullwidth is-hoverable">
          <tbody>
            {SETTINGS.map(({ to, label, icon: Icon, description }) => (
              <tr key={to}>
                <td className="settings-cell">
                  <span className="settings-icon-cell">
                    <Icon size={16} className="settings-icon" />
                    <strong>{label}</strong>
                  </span>
                </td>
                <td className="settings-desc-cell">{description}</td>
                <td className="settings-action-cell">
                  <Link to={to} className="settings-link">Configure →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
