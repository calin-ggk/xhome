import "./_app.reports.spending.css";
import { useState } from 'react';
import { useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { z } from 'zod';
import { db } from '~/db/client';
import { BASE_CURRENCY } from '~/constants';
import { getSpendingTreeData, type SpendingNode } from '~/services/reports.service';
import type { Route } from './+types/_app.reports.spending';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 7) + '-01';

  const fromRaw = url.searchParams.get('from') ?? '';
  const toRaw   = url.searchParams.get('to')   ?? '';

  const from = dateSchema.safeParse(fromRaw).success ? fromRaw : firstOfMonth;
  const to   = dateSchema.safeParse(toRaw).success   ? toRaw   : today;

  return getSpendingTreeData(db, from, to);
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SpendingNodeRow({ node, depth }: { node: SpendingNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children.length > 0;
  const clampedDepth = Math.min(depth, 4);

  return (
    <>
      <tr className={`spending-row spending-depth-${clampedDepth}`}>
        <td>
          {hasChildren ? (
            <button type="button" className="spending-toggle" onClick={() => setExpanded(e => !e)}>
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span className="spending-label">{node.label}</span>
            </button>
          ) : (
            <span className="spending-leaf">
              <span className="spending-spacer" />
              <span className="spending-label">{node.label}</span>
            </span>
          )}
        </td>
        <td className="has-text-right spending-amount">{fmt(node.amount)}</td>
      </tr>
      {expanded && node.children.map(child => (
        <SpendingNodeRow key={child.category} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default function SpendingPage() {
  const { startDate, endDate, roots, total } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <h1 className="title is-5 mb-3">{t('reports.spending.title')}</h1>

        <form method="get" className="spending-filter">
          <div className="field is-grouped">
            <div className="control">
              <label className="label is-small">{t('reports.spending.from')}</label>
              <input className="input is-small" type="date" name="from" defaultValue={startDate} />
            </div>
            <div className="control">
              <label className="label is-small">{t('reports.spending.to')}</label>
              <input className="input is-small" type="date" name="to" defaultValue={endDate} />
            </div>
            <div className="control spending-filter-apply">
              <button className="button is-small is-info" type="submit">
                {t('reports.spending.apply')}
              </button>
            </div>
          </div>
        </form>

        {roots.length === 0 ? (
          <p className="has-text-grey">{t('reports.spending.noData')}</p>
        ) : (
          <div className="box">
            <table className="table is-fullwidth is-size-7 is-hoverable mb-0">
              <thead>
                <tr>
                  <th>{t('reports.spending.category')}</th>
                  <th className="has-text-right">
                    {t('reports.spending.amount', { currency: BASE_CURRENCY })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {roots.map(node => (
                  <SpendingNodeRow key={node.category} node={node} depth={0} />
                ))}
              </tbody>
              <tfoot>
                <tr className="spending-total-row">
                  <td><strong>{t('reports.spending.total')}</strong></td>
                  <td className="has-text-right"><strong>{fmt(total)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
