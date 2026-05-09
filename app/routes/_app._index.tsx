import "./_app._index.css";
import { useLoaderData, useOutletContext } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { AppOutletContext } from './_app';
import { db } from '~/db/client';
import { getDashboardData } from '~/services/dashboard.service';
import { useFormat } from '~/hooks/useFormat';
import type { Route } from './+types/_app._index';

export async function loader(_: Route.LoaderArgs) {
  return getDashboardData(db);
}

export default function Dashboard() {
  const { netWorth, currentMonth, recentTransactions, cashFlow } = useLoaderData<typeof loader>();
  const { baseCurrencyCode } = useOutletContext<AppOutletContext>();
  const { t } = useTranslation();
  const { fmtAmount, fmtShortMonth, fmtDate, locale } = useFormat();

  const chartData = cashFlow.map(({ month, income, expenses }) => ({
    month: fmtShortMonth(month),
    income: +(income / 100).toFixed(2),
    expenses: +(expenses / 100).toFixed(2),
  }));

  return (
    <section className="section pt-0">
      <div className="container is-fluid">

        <div className="columns mb-2">
          <div className="column">
            <div className="dash-card">
              <p className="dash-card-label">{t('dashboard.netWorth')}</p>
              <p className="dash-card-value dash-card-value--teal">{fmtAmount(netWorth)} {baseCurrencyCode}</p>
            </div>
          </div>
          <div className="column">
            <div className="dash-card">
              <p className="dash-card-label">{t('dashboard.incomeThisMonth')}</p>
              <p className="dash-card-value dash-card-value--green">{fmtAmount(currentMonth.income)} {baseCurrencyCode}</p>
            </div>
          </div>
          <div className="column">
            <div className="dash-card">
              <p className="dash-card-label">{t('dashboard.expensesThisMonth')}</p>
              <p className="dash-card-value dash-card-value--orange">{fmtAmount(currentMonth.expenses)} {baseCurrencyCode}</p>
            </div>
          </div>
          <div className="column">
            <div className="dash-card">
              <p className="dash-card-label">{t('dashboard.netThisMonth')}</p>
              <p className={`dash-card-value ${currentMonth.net >= 0 ? 'dash-card-value--green' : 'dash-card-value--red'}`}>
                {fmtAmount(currentMonth.net)} {baseCurrencyCode}
              </p>
            </div>
          </div>
        </div>

        <div className="columns">
          <div className="column is-7">
            <div className="dash-card">
              <p className="dash-section-title">{t('dashboard.recentTransactions')}</p>
              {recentTransactions.length === 0 ? (
                <p className="has-text-grey is-size-7">{t('dashboard.noTransactions')}</p>
              ) : (
                <table className="table is-fullwidth is-size-7 is-hoverable">
                  <thead>
                    <tr>
                      <th>{t('dashboard.date')}</th>
                      <th>{t('dashboard.description')}</th>
                      <th className="has-text-right">{t('dashboard.amount', { currency: baseCurrencyCode })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map(tx => (
                      <tr key={tx.id}>
                        <td className="dash-tx-date">{fmtDate(tx.date)}</td>
                        <td>{tx.description ?? <span className="has-text-grey">—</span>}</td>
                        <td className="has-text-right">{fmtAmount(tx.totalBase)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="column is-5">
            <div className="dash-card">
              <p className="dash-section-title">{t('dashboard.cashFlow')}</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={50} />
                  <Tooltip
                    formatter={(value) =>
                      typeof value === 'number'
                        ? `${value.toLocaleString(locale, { minimumFractionDigits: 2 })} ${baseCurrencyCode}`
                        : ''
                    }
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="income" name={t('dashboard.income')} fill="#2AA5A5" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="expenses" name={t('dashboard.expenses')} fill="#F5821A" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
