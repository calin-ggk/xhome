import "./_app.reports.securities.css";
import { useState } from 'react';
import { useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { db } from '~/db/client';
import { BASE_CURRENCY } from '~/constants';
import { getSecuritiesHistoryData } from '~/services/reports.service';
import type { Route } from './+types/_app.reports.securities';

const CHART_COLORS = [
  '#2AA5A5', '#F5821A', '#6B7FD7', '#E84545',
  '#45B7D1', '#FFC107', '#8B5CF6', '#27AE60',
] as const;

export async function loader(_: Route.LoaderArgs) {
  return getSecuritiesHistoryData(db);
}

function yTickFmt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

export default function SecuritiesHistoryPage() {
  const { securities, points } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(securities.map(s => s.accountId)),
  );

  const chartData = points.map(p => {
    const row: Record<string, string | number> = { display: p['display'] as string };
    for (const sec of securities) {
      const cents = p[String(sec.accountId)];
      row[String(sec.accountId)] = typeof cents === 'number' ? +(cents / 100).toFixed(2) : 0;
    }
    return row;
  });

  function toggleSecurity(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <h1 className="title is-5 mb-3">{t('reports.securities.title')}</h1>

        {securities.length === 0 ? (
          <p className="has-text-grey">{t('reports.securities.noData')}</p>
        ) : (
          <>
            <div className="sec-checkboxes mb-3">
              {securities.map((sec, i) => (
                <label key={sec.accountId} className="sec-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selected.has(sec.accountId)}
                    onChange={() => toggleSecurity(sec.accountId)}
                  />
                  <span className={`sec-color-swatch sec-color-${i % 8}`} />
                  {sec.label}
                </label>
              ))}
            </div>

            <div className="box mb-4">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="display" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={yTickFmt} />
                  <Tooltip
                    formatter={(value, name) =>
                      typeof value === 'number'
                        ? [`${value.toLocaleString('ro-RO', { minimumFractionDigits: 2 })} ${BASE_CURRENCY}`, name as string]
                        : ['', name as string]
                    }
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  {securities
                    .filter(sec => selected.has(sec.accountId))
                    .map(sec => {
                      const idx = securities.indexOf(sec);
                      const color = CHART_COLORS[idx % CHART_COLORS.length] ?? '#888888';
                      return (
                        <Line
                          key={sec.accountId}
                          type="monotone"
                          dataKey={String(sec.accountId)}
                          name={sec.label}
                          stroke={color}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      );
                    })}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="box">
              <table className="table is-fullwidth is-size-7 is-hoverable mb-0">
                <thead>
                  <tr>
                    <th>{t('reports.securities.month')}</th>
                    {securities.map(sec => (
                      <th key={sec.accountId} className="has-text-right">{sec.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map(p => (
                    <tr key={p['date'] as string}>
                      <td>{p['display'] as string}</td>
                      {securities.map(sec => {
                        const cents = p[String(sec.accountId)];
                        return (
                          <td key={sec.accountId} className="has-text-right">
                            {typeof cents === 'number' && cents > 0
                              ? (cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2 })
                              : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
