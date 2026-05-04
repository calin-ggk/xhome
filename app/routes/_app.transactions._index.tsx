import "./_app.transactions._index.css";
import { useState } from 'react';
import { Link, redirect, useActionData, useLoaderData, useSearchParams, useSubmit } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '~/components/ConfirmModal';
import { db } from '~/db/client';
import { getTransactionsPageData, deleteTransaction } from '~/services/transaction.service';
import { deleteTransactionSchema } from '~/schemas/transaction.schema';
import type { Route } from './+types/_app.transactions._index';

function periodDateFrom(period: string): string | undefined {
  if (period === '1m') {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }
  if (period === '3m') {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  }
  return undefined;
}

export async function loader({ request }: Route.LoaderArgs) {
  const sp     = new URL(request.url).searchParams;
  const q      = sp.get('q')      || undefined;
  const period = sp.get('period') || '';
  const tagRaw = sp.get('tagId');
  const today  = new Date().toISOString().slice(0, 10);
  const dateFrom = periodDateFrom(period);

  return getTransactionsPageData(
    db,
    {
      ...(q        ? { q }                              : {}),
      ...(dateFrom ? { dateFrom, dateTo: today }        : {}),
      ...(tagRaw   ? { tagId: Number(tagRaw) }          : {}),
    },
    Math.max(1, parseInt(sp.get('page') ?? '1')),
  );
}

export async function action({ request }: Route.ActionArgs) {
  const form   = await request.formData();
  const intent = String(form.get('_intent') ?? '');

  if (intent === 'delete') {
    const parsed = deleteTransactionSchema.safeParse({ id: form.get('id') });
    if (!parsed.success) return { error: 'transactions.invalidId' };
    deleteTransaction(db, parsed.data.id);
    return redirect('/transactions');
  }

  return { error: 'Unknown intent.' };
}

function paginationPages(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | null)[] = [];
  let prev = 0;
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - current) <= 1) {
      if (prev && p - prev > 1) pages.push(null);
      pages.push(p);
      prev = p;
    }
  }
  return pages;
}

export default function TransactionsIndex() {
  const { rows, total, page, pageSize, pageCount, filterTags, baseCurrency } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation();
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; description: string | null } | null>(null);

  const [qInput, setQInput] = useState(searchParams.get('q') ?? '');

  const dp   = baseCurrency?.decimalPlaces ?? 2;
  const code = baseCurrency?.code ?? '';

  const hasFilters = ['q', 'period', 'tagId'].some(k => searchParams.has(k));

  const setFilter = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      value ? next.set(key, value) : next.delete(key);
      next.delete('page');
      return next;
    });
  };

  const applyQ = () => setFilter('q', qInput);

  const clearFilters = () => {
    setSearchParams({});
    setQInput('');
  };

  const goToPage = (p: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('page', String(p));
      return next;
    });
  };

  return (
    <section className="section pt-0">
      <div className="container is-fluid">

        {/* Header */}
        <div className="is-flex is-justify-content-space-between is-align-items-center mb-4">
          <div className="tx-list-header-left">
            <h1 className="title is-5 mb-0">{t('transactions.title')}</h1>
            <div className="tx-filter-row">
              <input
                type="text"
                className="input is-small tx-filter-q"
                value={qInput}
                onChange={e => setQInput(e.target.value)}
                onBlur={applyQ}
                onKeyDown={e => e.key === 'Enter' && applyQ()}
                placeholder={t('transactions.filterDesc')}
              />
              <div className="select is-small">
                <select
                  value={searchParams.get('period') ?? ''}
                  onChange={e => setFilter('period', e.target.value)}
                >
                  <option value="">{t('transactions.periodAll')}</option>
                  <option value="1m">{t('transactions.period1m')}</option>
                  <option value="3m">{t('transactions.period3m')}</option>
                </select>
              </div>
              {filterTags.length > 0 && (
                <div className="select is-small">
                  <select
                    value={searchParams.get('tagId') ?? ''}
                    onChange={e => setFilter('tagId', e.target.value)}
                  >
                    <option value="">{t('transactions.allTags')}</option>
                    {filterTags.map(tag => (
                      <option key={tag.id} value={tag.id}>{tag.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {hasFilters && (
                <button type="button" className="delete is-small" onClick={clearFilters} />
              )}
            </div>
          </div>
          <Link to="/transactions/new" className="button is-primary is-small">
            {t('transactions.newTransaction')}
          </Link>
        </div>

        {actionData?.error && (
          <div className="notification is-danger is-light">
            {t(actionData.error, { defaultValue: actionData.error })}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="has-text-grey is-size-7">
            {hasFilters ? t('transactions.emptyFiltered') : t('transactions.empty')}
          </p>
        ) : (
          <>
            <table className="table is-fullwidth is-hoverable is-size-7">
              <thead>
                <tr>
                  <th>{t('transactions.date')}</th>
                  <th>{t('transactions.description')}</th>
                  <th className="has-text-right">{t('transactions.entriesCount')}</th>
                  <th className="has-text-right">{t('transactions.totalBase', { code })}</th>
                  <th>{t('transactions.tags')}</th>
                  <th>{t('transactions.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(tx => (
                  <tr key={tx.id}>
                    <td>{tx.date}</td>
                    <td>{tx.description ?? <span className="has-text-grey">—</span>}</td>
                    <td className="has-text-right tx-list-amount">{tx.entryCount}</td>
                    <td className="has-text-right tx-list-amount">
                      {(tx.debitBase / Math.pow(10, dp)).toFixed(dp)} {code}
                    </td>
                    <td>
                      <div className="tx-list-tags">
                        {tx.tags.map(tag => (
                          <span key={tag} className="tag is-light is-small">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Link to={`/transactions/${tx.id}`} className="button is-small is-light mr-1">
                        {t('transactions.edit')}
                      </Link>
                      <button
                        type="button"
                        className="button is-small is-danger is-light"
                        onClick={() => setDeleteTarget({ id: tx.id, description: tx.description })}
                      >
                        {t('transactions.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="tx-pagination-row">
              {pageCount > 1 && (
                <nav className="pagination is-small" aria-label="pagination">
                  <button
                    className="pagination-previous"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                  >
                    {t('transactions.prevPage')}
                  </button>
                  <button
                    className="pagination-next"
                    disabled={page >= pageCount}
                    onClick={() => goToPage(page + 1)}
                  >
                    {t('transactions.nextPage')}
                  </button>
                  <ul className="pagination-list">
                    {paginationPages(page, pageCount).map((p, i) =>
                      p === null
                        ? <li key={`ell-${i}`}><span className="pagination-ellipsis">&hellip;</span></li>
                        : <li key={p}>
                            <button
                              className={`pagination-link${p === page ? ' is-current' : ''}`}
                              aria-label={`Page ${p}`}
                              onClick={() => goToPage(p)}
                            >{p}</button>
                          </li>
                    )}
                  </ul>
                </nav>
              )}
              <p className="is-size-7 has-text-grey tx-pagination-info">
                {t('transactions.paginationInfo', {
                  from:  (page - 1) * pageSize + 1,
                  to:    Math.min(page * pageSize, total),
                  total,
                })}
              </p>
            </div>
          </>
        )}

      </div>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('transactions.delete')}
        message={t('transactions.confirmDelete', {
          description: deleteTarget?.description ?? t('transactions.noDescription'),
        })}
        confirmLabel={t('transactions.delete')}
        cancelLabel={t('transactions.cancel')}
        confirmVariant="is-danger"
        onConfirm={() => {
          if (deleteTarget) {
            submit(
              { _intent: 'delete', id: String(deleteTarget.id) },
              { method: 'post' },
            );
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
