import "./_app.reports.income.css";
import { useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { db } from '~/db/client';
import { BASE_CURRENCY } from '~/constants';
import { getIncomeStatement, type ReportSection } from '~/services/reports.service';
import type { Route } from './+types/_app.reports.income';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = `${today.slice(0, 4)}-01-01`;

  const fromParsed = dateSchema.safeParse(url.searchParams.get('from') ?? undefined);
  const toParsed   = dateSchema.safeParse(url.searchParams.get('to')   ?? undefined);

  const startDate = fromParsed.success && fromParsed.data ? fromParsed.data : defaultFrom;
  const endDate   = toParsed.success   && toParsed.data   ? toParsed.data   : today;

  return getIncomeStatement(db, startDate, endDate);
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
    return <p className="has-text-grey is-size-7">{t('reports.income.noData')}</p>;
  }
  return (
    <table className="table is-fullwidth is-size-7 is-hoverable mb-0">
      <thead>
        <tr>
          <th>{t('reports.income.account')}</th>
          <th className="has-text-right">{t('reports.income.amount', { currency: BASE_CURRENCY })}</th>
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
        <tr className="is-total-row">
          <td><strong>{totalLabel}</strong></td>
          <td className="has-text-right"><strong>{fmt(section.total)}</strong></td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function IncomeStatementPage() {
  const { startDate, endDate, income, expenses, netIncome } = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const isLoss = netIncome < 0;

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <h1 className="title is-5 mb-3">{t('reports.income.title')}</h1>

        <form method="get" className="is-filter">
          <div className="field is-grouped">
            <div className="control">
              <label className="label is-small">{t('reports.income.from')}</label>
              <input
                className="input is-small"
                type="date"
                name="from"
                defaultValue={startDate}
              />
            </div>
            <div className="control">
              <label className="label is-small">{t('reports.income.to')}</label>
              <input
                className="input is-small"
                type="date"
                name="to"
                defaultValue={endDate}
              />
            </div>
            <div className="control is-filter-apply">
              <button className="button is-small is-info" type="submit">
                {t('reports.income.apply')}
              </button>
            </div>
          </div>
        </form>

        <div className="box is-section">
          <p className="is-section-title">{t('reports.income.income')}</p>
          <SectionTable
            section={income}
            totalLabel={t('reports.income.totalIncome')}
          />
        </div>

        <div className="box is-section">
          <p className="is-section-title">{t('reports.income.expenses')}</p>
          <SectionTable
            section={expenses}
            totalLabel={t('reports.income.totalExpenses')}
          />
        </div>

        <div className={`is-net-card${isLoss ? ' is-loss' : ''}`}>
          <span className="is-net-label">
            {isLoss ? t('reports.income.netLoss') : t('reports.income.netIncome')}
          </span>
          <span className="is-net-value">
            {fmt(Math.abs(netIncome))} {BASE_CURRENCY}
          </span>
        </div>
      </div>
    </section>
  );
}
