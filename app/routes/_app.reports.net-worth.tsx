import "./_app.reports.net-worth.css";
import { useLoaderData, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { db } from '~/db/client';
import { BASE_CURRENCY } from '~/constants';
import { getNetWorthByCurrencyData, type ManualLiveRate, type ManualLivePrice } from '~/services/reports.service';
import { getPreferences, computeDateRange, type ReportRange } from '~/services/preferences.service';
import { REPORT_RANGE_OPTIONS } from '~/schemas/preferences.schema';
import { RangePicker } from '~/components/RangePicker';
import { useFormat } from '~/hooks/useFormat';
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

  const manualRates: ManualLiveRate[] = [];
  const manualPrices: ManualLivePrice[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    const rm = key.match(/^rate_(\d+)$/);
    if (rm) {
      const rateDecimal = parseFloat(value);
      if (isFinite(rateDecimal) && rateDecimal > 0) manualRates.push({ currencyId: parseInt(rm[1]!, 10), rateDecimal });
    }
    const pm = key.match(/^price_(\d+)$/);
    if (pm) {
      const priceDecimal = parseFloat(value);
      if (isFinite(priceDecimal) && priceDecimal > 0) manualPrices.push({ securityId: parseInt(pm[1]!, 10), priceDecimal });
    }
  }

  return { ...(await getNetWorthByCurrencyData(db, fromMonth, toMonth, today, manualRates, manualPrices)), range };
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
  const { currencies, points, liveStatus, range } = useLoaderData<typeof loader>();
  const { t }    = useTranslation();
  const navigate = useNavigate();
  const { fmtAmount, fmtMonth, locale } = useFormat();

  const latest = points[points.length - 1];

  // Absolute chart: values in base currency (cents → units)
  const absData = points.map(p => {
    const out: Record<string, string | number> = { month: fmtMonth(p.month) };
    for (const code of currencies) out[code] = +((p[code] as number) / 100).toFixed(2);
    out.total = +(p.total / 100).toFixed(2);
    return out;
  });

  // % chart: each series normalised to its first data point
  const firstPt = points[0];
  const pctData = points.map(p => {
    const out: Record<string, string | number> = { month: fmtMonth(p.month) };
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
      ? `${value.toLocaleString(locale, { minimumFractionDigits: 2 })} ${BASE_CURRENCY}`
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

          {liveStatus.state === 'missing' && (
            <div className="notification is-warning mt-4 mb-4">
              <p className="mb-3">{t('reports.live.fetchFailed')}</p>
              <form method="get">
                <input type="hidden" name="range" value={range} />
                {liveStatus.missingRates.map(r => (
                  <div key={r.currencyId} className="field is-horizontal mb-2">
                    <div className="field-label is-small" style={{ flexBasis: '12rem', flexGrow: 0 }}>
                      <label className="label">{t('reports.live.rateLabel', { code: r.currencyCode, base: BASE_CURRENCY })}</label>
                    </div>
                    <div className="field-body">
                      <input className="input is-small" style={{ maxWidth: '10rem' }} type="number" step="0.0001" min="0.0001" name={`rate_${r.currencyId}`} required />
                    </div>
                  </div>
                ))}
                {liveStatus.missingPrices.map(p => (
                  <div key={p.securityId} className="field is-horizontal mb-2">
                    <div className="field-label is-small" style={{ flexBasis: '12rem', flexGrow: 0 }}>
                      <label className="label">{t('reports.live.priceLabel', { ticker: p.ticker })}</label>
                    </div>
                    <div className="field-body">
                      <input className="input is-small" style={{ maxWidth: '10rem' }} type="number" step="0.01" min="0.01" name={`price_${p.securityId}`} required />
                    </div>
                  </div>
                ))}
                <button type="submit" className="button is-small is-primary mt-2">{t('reports.live.apply')}</button>
              </form>
            </div>
          )}

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
                    {fmtAmount(latest.total)} {BASE_CURRENCY}
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
