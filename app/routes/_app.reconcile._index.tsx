import { Link, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import { getReconciliationPageData } from '~/services/reconciliation.service';
import type { Route } from './+types/_app.reconcile._index';

export async function loader(_: Route.LoaderArgs) {
  return getReconciliationPageData(db);
}

export default function ReconcileIndexPage() {
  const { accounts, pendingCount } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="is-flex is-align-items-center mb-4">
          <h1 className="title is-5 mb-0 mr-3">{t('reconcile.title')}</h1>
          {pendingCount > 0
            ? <span className="tag is-warning is-light">{t('reconcile.pendingCount', { count: pendingCount })}</span>
            : <span className="tag is-success is-light">{t('reconcile.allDone')}</span>
          }
        </div>

        {accounts.length === 0 ? (
          <p className="has-text-grey is-size-7">{t('reconcile.noAccounts')}</p>
        ) : (
          <table className="table is-fullwidth is-hoverable is-size-7">
            <thead>
              <tr>
                <th>{t('reconcile.name')}</th>
                <th>{t('reconcile.category')}</th>
                <th>{t('reconcile.currency')}</th>
                <th>{t('reconcile.status')}</th>
                <th className="has-text-right">{t('reconcile.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.category}</td>
                  <td>{a.currencyCode}</td>
                  <td>
                    {a.reconciled
                      ? <span className="tag is-success is-light is-small">{t('reconcile.reconciledBadge')}</span>
                      : <span className="tag is-warning is-light is-small">{t('reconcile.pending')}</span>
                    }
                  </td>
                  <td className="has-text-right">
                    <Link to={`/reconcile/${a.id}`} className="button is-small is-primary is-light">
                      {t('reconcile.reconcileAction')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
