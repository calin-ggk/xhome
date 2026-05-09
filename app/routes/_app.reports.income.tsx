import "./_app.reports.income.css";
import { useState } from 'react';
import { useLoaderData, useSearchParams, useNavigate, useOutletContext } from 'react-router';
import { useTranslation } from 'react-i18next';
// eslint-disable-next-line @typescript-eslint/no-deprecated
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '~/db/client';
import type { AppOutletContext } from './_app';
import { getIncomeStatement, type ReportSection, type SpendingNode } from '~/services/reports.service';
import { getPreferences, computeDateRange, type ReportRange } from '~/services/preferences.service';
import { REPORT_RANGE_OPTIONS } from '~/schemas/preferences.schema';
import { RangePicker } from '~/components/RangePicker';
import { useFormat } from '~/hooks/useFormat';
import type { Route } from './+types/_app.reports.income';

export async function loader({ request }: Route.LoaderArgs) {
  const url      = new URL(request.url);
  const today    = new Date().toISOString().slice(0, 10);
  const rawRange = url.searchParams.get('range') ?? '';
  const range: ReportRange = (REPORT_RANGE_OPTIONS as readonly string[]).includes(rawRange)
    ? rawRange as ReportRange
    : getPreferences(db).defaultReportRange as ReportRange;
  const { from, to } = computeDateRange(range, today);
  return { ...getIncomeStatement(db, from, to), range };
}

// ── Table view ───────────────────────────────────────────────────────────────

function SectionTable({ section, totalLabel }: { section: ReportSection; totalLabel: string }) {
  const { t } = useTranslation();
  const { fmtAmount } = useFormat();
  const { baseCurrencyCode } = useOutletContext<AppOutletContext>();
  if (section.accounts.length === 0) {
    return <p className="has-text-grey is-size-7">{t('reports.income.noData')}</p>;
  }
  return (
    <table className="table is-fullwidth is-size-7 is-hoverable mb-0">
      <thead>
        <tr>
          <th>{t('reports.income.account')}</th>
          <th className="has-text-right">{t('reports.income.amount', { currency: baseCurrencyCode })}</th>
        </tr>
      </thead>
      <tbody>
        {section.accounts.map(a => (
          <tr key={a.id}>
            <td>{a.name} <span className="has-text-grey is-size-7">({a.category})</span></td>
            <td className="has-text-right">{fmtAmount(a.balanceBase)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="is-total-row">
          <td><strong>{totalLabel}</strong></td>
          <td className="has-text-right"><strong>{fmtAmount(section.total)}</strong></td>
        </tr>
      </tfoot>
    </table>
  );
}

function TableView({ income, expenses }: { income: ReportSection; expenses: ReportSection }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="box is-section">
        <p className="is-section-title">{t('reports.income.income')}</p>
        <SectionTable section={income} totalLabel={t('reports.income.totalIncome')} />
      </div>
      <div className="box is-section">
        <p className="is-section-title">{t('reports.income.expenses')}</p>
        <SectionTable section={expenses} totalLabel={t('reports.income.totalExpenses')} />
      </div>
    </>
  );
}

// ── Chart view ───────────────────────────────────────────────────────────────

const CHART_FILLS = [
  '#0D6B6B', '#2AA5A5', '#F5821A', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f59e0b', '#84cc16', '#6366f1',
];

type PieSlice = {
  name:     string;
  value:    number;
  fill:     string;
  dotClass: string;
  nodes?:   SpendingNode[];
};

type DrillItem =
  | { kind: 'top' }
  | { kind: 'drilled'; label: string; nodes: SpendingNode[] };

function nodesToSlices(nodes: SpendingNode[]): PieSlice[] {
  return nodes.map((n, i) => {
    const slice: PieSlice = {
      name:     n.label,
      value:    n.amount,
      fill:     CHART_FILLS[i % CHART_FILLS.length]!,
      dotClass: `is-dot-${i % CHART_FILLS.length}`,
    };
    if (n.children.length > 0) slice.nodes = n.children;
    return slice;
  });
}

function ChartView({
  income, expenses, incomeTree, expensesTree,
}: {
  income: ReportSection;
  expenses: ReportSection;
  incomeTree: SpendingNode[];
  expensesTree: SpendingNode[];
}) {
  const { t } = useTranslation();
  const { fmtAmount } = useFormat();
  const { baseCurrencyCode } = useOutletContext<AppOutletContext>();
  const [drillStack, setDrillStack] = useState<DrillItem[]>([{ kind: 'top' }]);
  const current = drillStack[drillStack.length - 1]!;

  const topSlices = (): PieSlice[] => {
    const income_s: PieSlice  = { name: t('reports.income.income'),   value: income.total,   fill: '#22c55e', dotClass: 'is-dot-income'   };
    const expense_s: PieSlice = { name: t('reports.income.expenses'), value: expenses.total, fill: '#ef4444', dotClass: 'is-dot-expenses' };
    if (incomeTree.length   > 0) income_s.nodes  = incomeTree;
    if (expensesTree.length > 0) expense_s.nodes = expensesTree;
    return [income_s, expense_s];
  };

  const slices: PieSlice[] = current.kind === 'top' ? topSlices() : nodesToSlices(current.nodes);

  function drillInto(index: number) {
    const slice = slices[index];
    if (!slice?.nodes) return;
    setDrillStack(s => [...s, { kind: 'drilled', label: slice.name, nodes: slice.nodes! }]);
  }

  if (income.total === 0 && expenses.total === 0) {
    return <p className="has-text-grey is-section">{t('reports.income.noData')}</p>;
  }

  return (
    <div className="is-chart-view">
      <div className="is-chart-breadcrumb">
        {drillStack.length > 1 && (
          <>
            <button
              type="button"
              className="is-chart-back"
              onClick={() => setDrillStack(s => s.slice(0, -1))}
            >
              {t('reports.income.drillBack')}
            </button>
            <span className="is-chart-path">
              {drillStack.slice(1).map(d => d.kind === 'drilled' ? d.label : '').join(' › ')}
            </span>
          </>
        )}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={120}
            paddingAngle={2}
            onClick={(_: unknown, index: number) => drillInto(index)}
          >
            {slices.map((s, i) => (
              // eslint-disable-next-line @typescript-eslint/no-deprecated
              <Cell
                key={i}
                fill={s.fill}
                className={s.nodes ? 'is-chart-drillable' : 'is-chart-leaf'}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: unknown) =>
              typeof value === 'number' ? [`${fmtAmount(value)} ${baseCurrencyCode}`, ''] : ''
            }
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="is-chart-legend">
        {slices.map((s, i) =>
          s.nodes ? (
            <button
              key={i}
              type="button"
              className="is-legend-item is-legend-drillable"
              onClick={() => drillInto(i)}
            >
              <span className={`is-legend-dot ${s.dotClass}`} />
              <span className="is-legend-name">{s.name}</span>
              <span className="is-legend-value">{fmtAmount(s.value)}</span>
              <span className="is-legend-arrow">›</span>
            </button>
          ) : (
            <div key={i} className="is-legend-item">
              <span className={`is-legend-dot ${s.dotClass}`} />
              <span className="is-legend-name">{s.name}</span>
              <span className="is-legend-value">{fmtAmount(s.value)}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IncomeStatementPage() {
  const { income, expenses, netIncome, incomeTree, expensesTree, range } =
    useLoaderData<typeof loader>();
  const { baseCurrencyCode } = useOutletContext<AppOutletContext>();
  const { t }      = useTranslation();
  const navigate   = useNavigate();
  const { fmtAmount } = useFormat();
  const [searchParams] = useSearchParams();
  const view  = searchParams.get('view') === 'chart' ? 'chart' : 'table';
  const isLoss = netIncome < 0;

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="is-page">

          <div className="is-header">
            <h1 className="title is-5 mb-0">{t('reports.income.title')}</h1>
            <div className="is-header-controls">
              <RangePicker
                value={range as ReportRange}
                onChange={r => navigate(`?range=${r}&view=${view}`)}
              />
              <div className="is-view-toggle">
                <button
                  type="button"
                  className={`is-view-btn${view === 'table' ? ' is-active' : ''}`}
                  onClick={() => navigate(`?range=${range}&view=table`)}
                >
                  {t('reports.income.viewTable')}
                </button>
                <button
                  type="button"
                  className={`is-view-btn${view === 'chart' ? ' is-active' : ''}`}
                  onClick={() => navigate(`?range=${range}&view=chart`)}
                >
                  {t('reports.income.viewChart')}
                </button>
              </div>
            </div>
          </div>

          {view === 'table' ? (
            <TableView income={income} expenses={expenses} />
          ) : (
            <ChartView
              income={income}
              expenses={expenses}
              incomeTree={incomeTree}
              expensesTree={expensesTree}
            />
          )}

          <div className={`is-net-card${isLoss ? ' is-loss' : ''}`}>
            <span className="is-net-label">
              {isLoss ? t('reports.income.netLoss') : t('reports.income.netIncome')}
            </span>
            <span className="is-net-value">
              {fmtAmount(Math.abs(netIncome))} {baseCurrencyCode}
            </span>
          </div>

        </div>
      </div>
    </section>
  );
}
