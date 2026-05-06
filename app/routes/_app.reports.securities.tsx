import "./_app.reports.securities.css";
import { useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { db } from '~/db/client';
import { BASE_CURRENCY } from '~/constants';
import { getSecuritiesHistoryData } from '~/services/reports.service';
import { getPreferences, computeDateRange, type ReportRange } from '~/services/preferences.service';
import { REPORT_RANGE_OPTIONS } from '~/schemas/preferences.schema';
import { RangePicker } from '~/components/RangePicker';
import type { Route } from './+types/_app.reports.securities';

const CHART_COLORS = [
  '#2AA5A5', '#F5821A', '#6B7FD7', '#E84545',
  '#45B7D1', '#FFC107', '#8B5CF6', '#27AE60',
] as const;

export async function loader({ request }: Route.LoaderArgs) {
  const url      = new URL(request.url);
  const today    = new Date().toISOString().slice(0, 10);
  const rawRange = url.searchParams.get('range') ?? '';
  const range: ReportRange = (REPORT_RANGE_OPTIONS as readonly string[]).includes(rawRange)
    ? rawRange as ReportRange
    : getPreferences(db).defaultReportRange as ReportRange;
  const { from, to } = computeDateRange(range, today);
  const fromMonth = from ? from.slice(0, 7) : null;
  const toMonth   = to   ? to.slice(0, 7)   : null;
  return { ...getSecuritiesHistoryData(db, fromMonth, toMonth), range };
}

function yTickFmt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

function pctTickFmt(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
}

export default function SecuritiesHistoryPage() {
  const { securities, points, pctPoints, range } = useLoaderData<typeof loader>();
  const { t }    = useTranslation();
  const navigate = useNavigate();

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
        <div className="sec-page">

          <div className="sec-header">
            <h1 className="title is-5 mb-0">{t('reports.securities.title')}</h1>
            <RangePicker
              value={range as ReportRange}
              onChange={r => navigate(`?range=${r}`)}
            />
          </div>

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
              <p className="is-size-7 has-text-grey mb-3">
                {t('reports.securities.chartPct')}
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={pctPoints} margin={{ top: 8, right: 16, bottom: 4, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="display" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={pctTickFmt} />
                  <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
                  <Tooltip
                    formatter={(value, name) =>
                      typeof value === 'number'
                        ? [`${value > 0 ? '+' : ''}${value.toFixed(2)}%`, name as string]
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
          </>
          )}

        </div>
      </div>
    </section>
  );
}
