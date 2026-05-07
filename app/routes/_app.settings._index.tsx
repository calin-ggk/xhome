import "./_app.settings._index.css";
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Calendar, Globe, Settings, Tag, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type SettingRow = { to: string; labelKey: string; icon: LucideIcon; descKey: string };

const SETTINGS: SettingRow[] = [
  { to: '/settings/currencies',  labelKey: 'settings.currencies',  icon: Globe,       descKey: 'settings.currenciesDesc' },
  { to: '/settings/securities',  labelKey: 'settings.securities',  icon: TrendingUp,  descKey: 'settings.securitiesDesc' },
  { to: '/settings/tags',        labelKey: 'settings.tags',        icon: Tag,         descKey: 'settings.tagsDesc' },
  { to: '/settings/preferences', labelKey: 'settings.preferences', icon: Settings,  descKey: 'settings.preferencesDesc' },
  { to: '/settings/snapshots',   labelKey: 'settings.snapshots',   icon: Calendar,  descKey: 'settings.snapshotsDesc' },
];

export default function SettingsIndex() {
  const { t } = useTranslation();

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <table className="table is-fullwidth is-hoverable">
          <tbody>
            {SETTINGS.map(({ to, labelKey, icon: Icon, descKey }) => (
              <tr key={to}>
                <td className="settings-cell">
                  <span className="settings-icon-cell">
                    <Icon size={16} className="settings-icon" />
                    <strong>{t(labelKey)}</strong>
                  </span>
                </td>
                <td className="settings-desc-cell">{t(descKey)}</td>
                <td className="settings-action-cell">
                  <Link to={to} className="settings-link">{t('settings.configure')}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
