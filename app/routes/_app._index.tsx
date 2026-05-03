import "./_app._index.css";
import { useLoaderData } from 'react-router';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { BASE_CURRENCY } from '~/constants';
import { db } from '~/db/client';
import { getDashboardData } from '~/services/dashboard.service';
import type { Route } from './+types/_app._index';

export async function loader(_: Route.LoaderArgs) {
  return getDashboardData(db);
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en', { month: 'short' });
}

export default function Dashboard() {
  const { netWorth, currentMonth, recentTransactions, cashFlow } = useLoaderData<typeof loader>();

  const chartData = cashFlow.map(({ month, income, expenses }) => ({
    month: shortMonth(month),
    income: +(income / 100).toFixed(2),
    expenses: +(expenses / 100).toFixed(2),
  }));

  return (
    <section className="section pt-0">
      <div className="container is-fluid">

        <div className="columns mb-2">
          <div className="column">
            <div className="dash-card">
              <p className="dash-card-label">Net Worth</p>
              <p className="dash-card-value dash-card-value--teal">{fmt(netWorth)} {BASE_CURRENCY}</p>
            </div>
          </div>
          <div className="column">
            <div className="dash-card">
              <p className="dash-card-label">Income (this month)</p>
              <p className="dash-card-value dash-card-value--green">{fmt(currentMonth.income)} {BASE_CURRENCY}</p>
            </div>
          </div>
          <div className="column">
            <div className="dash-card">
              <p className="dash-card-label">Expenses (this month)</p>
              <p className="dash-card-value dash-card-value--orange">{fmt(currentMonth.expenses)} {BASE_CURRENCY}</p>
            </div>
          </div>
          <div className="column">
            <div className="dash-card">
              <p className="dash-card-label">Net (this month)</p>
              <p className={`dash-card-value ${currentMonth.net >= 0 ? 'dash-card-value--green' : 'dash-card-value--red'}`}>
                {fmt(currentMonth.net)} {BASE_CURRENCY}
              </p>
            </div>
          </div>
        </div>

        <div className="columns">
          <div className="column is-7">
            <div className="dash-card">
              <p className="dash-section-title">Recent Transactions</p>
              {recentTransactions.length === 0 ? (
                <p className="has-text-grey is-size-7">No transactions yet.</p>
              ) : (
                <table className="table is-fullwidth is-size-7 is-hoverable">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="has-text-right">Amount ({BASE_CURRENCY})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map(tx => (
                      <tr key={tx.id}>
                        <td className="dash-tx-date">{tx.date}</td>
                        <td>{tx.description ?? <span className="has-text-grey">—</span>}</td>
                        <td className="has-text-right">{fmt(tx.totalBase)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="column is-5">
            <div className="dash-card">
              <p className="dash-section-title">Cash Flow (6 months)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={50} />
                  <Tooltip
                    formatter={(value) =>
                      typeof value === 'number'
                        ? `${value.toLocaleString('ro-RO', { minimumFractionDigits: 2 })} ${BASE_CURRENCY}`
                        : ''
                    }
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="income" name="Income" fill="#2AA5A5" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#F5821A" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
