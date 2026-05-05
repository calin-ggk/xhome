import "./_app.reports.net-worth.css";
import { useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { db } from '~/db/client';
import { BASE_CURRENCY } from '~/constants';
import { getNetWorthHistoryData } from '~/services/reports.service';
import type { Route } from './+types/_app.reports.net-worth';

export async function loader(_: Route.LoaderArgs) {
  return { points: getNetWorthHistoryData(db) };
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function yTickFmt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

export default function NetWorthHistoryPage() {
  const { points } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  const latest = points[points.length - 1];
  const chartData = points.map(p => ({
    month: p.display,
    value: +(p.netWorthBase / 100).toFixed(2),
  }));

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <h1 className="title is-5 mb-3">{t('reports.netWorth.title')}</h1>

        {points.length === 0 ? (
          <p className="has-text-grey">{t('reports.netWorth.noData')}</p>
        ) : (
          <>
            {latest && (
              <div className={`nw-summary-box box mb-4${latest.netWorthBase < 0 ? ' nw-summary-box--negative' : ''}`}>
                <span className="nw-summary-label">{t('reports.netWorth.latest')}</span>
                <span className="nw-summary-value">
                  {fmt(latest.netWorthBase)} {BASE_CURRENCY}
                </span>
              </div>
            )}

            <div className="box mb-4">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={yTickFmt} />
                  <Tooltip
                    formatter={(value) =>
                      typeof value === 'number'
                        ? `${value.toLocaleString('ro-RO', { minimumFractionDigits: 2 })} ${BASE_CURRENCY}`
                        : ''
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={t('reports.netWorth.title')}
                    stroke="#2AA5A5"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="box">
              <table className="table is-fullwidth is-size-7 is-hoverable mb-0">
                <thead>
                  <tr>
                    <th>{t('reports.netWorth.month')}</th>
                    <th className="has-text-right">
                      {t('reports.netWorth.amount', { currency: BASE_CURRENCY })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map(p => (
                    <tr key={p.month}>
                      <td>{p.display}</td>
                      <td className={`has-text-right${p.netWorthBase < 0 ? ' has-text-danger' : ''}`}>
                        {fmt(p.netWorthBase)}
                      </td>
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
