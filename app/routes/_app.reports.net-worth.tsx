import "./_app.reports.net-worth.css";
import { useLoaderData, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { db } from '~/db/client';
import { BASE_CURRENCY } from '~/constants';
import { getNetWorthByCurrencyData } from '~/services/reports.service';
import { getPreferences, computeDateRange, type ReportRange } from '~/services/preferences.service';
import { REPORT_RANGE_OPTIONS } from '~/schemas/preferences.schema';
import { RangePicker } from '~/components/RangePicker';
import type { Route } from './+types/_app.reports.net-worth';

const LINE_COLORS = [
  '#2AA5A5', '#3b82f6', '#f59e0b', '#22c55e',
  '#8b5cf6', '#ec4899', '#f97316', '#14b8a6',
  '#6366f1', '#84cc16', '#0ea5e9', '#e11d48',
];

function colorFor(index: number): string {
  return LINE_COLORS[index % LINE_COLORS.length]!;
}

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

  return { ...getNetWorthByCurrencyData(db, fromMonth, toMonth), range };
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

function pctTickFmt(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
}

export default function NetWorthHistoryPage() {
  const { currencies, points, range } = useLoaderData<typeof loader>();
  const { t }    = useTranslation();
  const navigate = useNavigate();

  const latest = points[points.length - 1];

  // Absolute chart: values in base currency (cents → units)
  const absData = points.map(p => {
    const out: Record<string, string | number> = { month: p.display };
    for (const code of currencies) out[code] = +((p[code] as number) / 100).toFixed(2);
    out.total = +(p.total / 100).toFixed(2);
    return out;
  });

  // % chart: each series normalised to its first data point
  const firstPt = points[0];
  const pctData = points.map(p => {
    const out: Record<string, string | number> = { month: p.display };
    for (const code of currencies) {
      const first = firstPt ? (firstPt[code] as number) : 0;
      const cur   = p[code] as number;
      out[code] = first !== 0 ? +((cur - first) / Math.abs(first) * 100).toFixed(2) : 0;
    }
    const firstTotal = firstPt?.total ?? 0;
    out.total = firstTotal !== 0
      ? +((p.total - firstTotal) / Math.abs(firstTotal) * 100).toFixed(2)
      : 0;
    return out;
  });

  const lines = ['total', ...currencies];

  const tooltipFmtAbs = (value: unknown) =>
    typeof value === 'number'
      ? `${value.toLocaleString('ro-RO', { minimumFractionDigits: 2 })} ${BASE_CURRENCY}`
      : '';

  const tooltipFmtPct = (value: unknown) =>
    typeof value === 'number' ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '';

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="nw-page">

          <div className="nw-header">
            <h1 className="title is-5 mb-0">{t('reports.netWorth.title')}</h1>
            <RangePicker
              value={range as ReportRange}
              onChange={r => navigate(`?range=${r}`)}
            />
          </div>

          {points.length === 0 ? (
            <p className="has-text-grey">{t('reports.netWorth.noData')}</p>
          ) : (
            <>
              <div className="box mb-4">
                <p className="nw-chart-label">{t('reports.netWorth.chartAbsolute', { currency: BASE_CURRENCY })}</p>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={absData} margin={{ top: 8, right: 16, bottom: 4, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={yTickFmt} />
                    <Tooltip formatter={tooltipFmtAbs} />
                    {lines.map((code, i) => (
                      <Line
                        key={code}
                        type="monotone"
                        dataKey={code}
                        name={code === 'total' ? t('reports.netWorth.total') : code}
                        stroke={colorFor(i)}
                        strokeWidth={code === 'total' ? 2.5 : 1.5}
                        {...(code !== 'total' ? { strokeDasharray: '4 2' } : {})}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="box mb-4">
                <p className="nw-chart-label">{t('reports.netWorth.chartPct')}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={pctData} margin={{ top: 8, right: 16, bottom: 4, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={pctTickFmt} />
                    <Tooltip formatter={tooltipFmtPct} />
                    {lines.map((code, i) => (
                      <Line
                        key={code}
                        type="monotone"
                        dataKey={code}
                        name={code === 'total' ? t('reports.netWorth.total') : code}
                        stroke={colorFor(i)}
                        strokeWidth={code === 'total' ? 2.5 : 1.5}
                        {...(code !== 'total' ? { strokeDasharray: '4 2' } : {})}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {latest && (
                <div className={`nw-summary-box${latest.total < 0 ? ' nw-summary-box--negative' : ''}`}>
                  <span className="nw-summary-label">{t('reports.netWorth.latest')}</span>
                  <span className="nw-summary-value">
                    {fmt(latest.total)} {BASE_CURRENCY}
                  </span>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </section>
  );
}
