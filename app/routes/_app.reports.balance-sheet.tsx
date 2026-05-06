import "./_app.reports.balance-sheet.css";
import { useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { MonthPicker } from '~/components/MonthPicker';
import { z } from 'zod';
import { db } from '~/db/client';
import { BASE_CURRENCY } from '~/constants';
import { getBalanceSheet, type ReportSection } from '~/services/reports.service';
import type { Route } from './+types/_app.reports.balance-sheet';

const yearSchema  = z.coerce.number().int().min(2000).max(2100).optional();
const monthSchema = z.coerce.number().int().min(1).max(12).optional();

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const yearParsed  = yearSchema.safeParse(url.searchParams.get('year')  ?? undefined);
  const monthParsed = monthSchema.safeParse(url.searchParams.get('m')    ?? undefined);

  const selectedYear     = yearParsed.success  && yearParsed.data  ? yearParsed.data  : today.getFullYear();
  const selectedMonthNum = monthParsed.success && monthParsed.data ? monthParsed.data : today.getMonth() + 1;

  const ym = `${selectedYear}-${pad2(selectedMonthNum)}`;

  return {
    selectedYear,
    selectedMonthNum,
    ...getBalanceSheet(db, ym, todayStr),
  };
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SectionTable({
  section,
  totalLabel,
}: {
  section: ReportSection;
  totalLabel: string;
}) {
  const { t } = useTranslation();
  if (section.accounts.length === 0) {
    return <p className="has-text-grey is-size-7">{t('reports.balanceSheet.noData')}</p>;
  }
  return (
    <table className="table is-fullwidth is-size-7 is-hoverable mb-0">
      <thead>
        <tr>
          <th>{t('reports.balanceSheet.account')}</th>
          <th className="has-text-right">{t('reports.balanceSheet.amount', { currency: BASE_CURRENCY })}</th>
        </tr>
      </thead>
      <tbody>
        {section.accounts.map(a => (
          <tr key={a.id}>
            <td>{a.name} <span className="has-text-grey is-size-7">({a.category})</span></td>
            <td className="has-text-right">{fmt(a.balanceBase)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="bs-total-row">
          <td><strong>{totalLabel}</strong></td>
          <td className="has-text-right"><strong>{fmt(section.total)}</strong></td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function BalanceSheetPage() {
  const { selectedYear, selectedMonthNum, asOfDate, isSnapshot, assets, liabilities, equity, netWorth } =
    useLoaderData<typeof loader>();
  const { t } = useTranslation();

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="bs-page">
        <div className="bs-header">
          <h1 className="title is-5 mb-0">{t('reports.balanceSheet.title')}</h1>
          <MonthPicker selectedMonth={selectedMonthNum} selectedYear={selectedYear} />
        </div>

        <p className="bs-date-info">
          {t('reports.balanceSheet.asOf')}: <strong>{asOfDate}</strong>
          {isSnapshot && (
            <span className="tag is-info is-light is-small ml-2">
              {t('reports.balanceSheet.snapshotBadge')}
            </span>
          )}
        </p>

        <div className="box bs-section">
          <p className="bs-section-title">{t('reports.balanceSheet.assets')}</p>
          <SectionTable
            section={assets}
            totalLabel={t('reports.balanceSheet.totalAssets')}
          />
        </div>

        <div className="box bs-section">
          <p className="bs-section-title">{t('reports.balanceSheet.liabilities')}</p>
          <SectionTable
            section={liabilities}
            totalLabel={t('reports.balanceSheet.totalLiabilities')}
          />
        </div>

        {equity.accounts.length > 0 && (
          <div className="box bs-section">
            <p className="bs-section-title">{t('reports.balanceSheet.equity')}</p>
            <SectionTable
              section={equity}
              totalLabel={t('reports.balanceSheet.totalEquity')}
            />
          </div>
        )}

        <div className={`bs-net-worth-card${netWorth < 0 ? ' is-negative' : ''}`}>
          <span className="bs-net-worth-label">{t('reports.balanceSheet.netWorth')}</span>
          <span className="bs-net-worth-value">
            {fmt(netWorth)} {BASE_CURRENCY}
          </span>
        </div>
        </div>
      </div>
    </section>
  );
}
