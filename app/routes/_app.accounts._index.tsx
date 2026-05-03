import "./_app.accounts._index.css";
import { useMemo, useState } from 'react';
import { Link, redirect, useActionData, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import { getAccountsPageData, deleteAccount } from '~/services/account.service';
import { deleteAccountSchema } from '~/schemas/account.schema';
import type { Route } from './+types/_app.accounts._index';

export async function loader(_: Route.LoaderArgs) {
  return getAccountsPageData(db);
}

export async function action({ request }: Route.ActionArgs) {
  const form   = await request.formData();
  const intent = String(form.get('_intent') ?? '');

  if (intent === 'delete') {
    const parsed = deleteAccountSchema.safeParse({ id: form.get('id') });
    if (!parsed.success) return { error: 'Invalid account id.' };
    const result = deleteAccount(db, parsed.data.id);
    if (!result.ok) return { error: result.error };
    return redirect('/accounts');
  }

  return { error: 'Unknown intent.' };
}

export default function AccountsIndex() {
  const { groups } = useLoaderData<typeof loader>();
  const actionData  = useActionData<typeof action>();
  const { t } = useTranslation();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [filter, setFilter] = useState('');

  const prefixes = useMemo(() => extractPrefixes(groups), [groups]);
  const visibleGroups = filter
    ? groups
        .map(g => ({ ...g, accounts: g.accounts.filter(a => a.category.startsWith(filter)) }))
        .filter(g => g.accounts.length > 0)
    : groups;

  return (
    <section className="section pt-0">
      <div className="container is-fluid">

        <div className="is-flex is-justify-content-space-between is-align-items-center mb-4">
          <div className="accounts-header-left">
            <h1 className="title is-5 mb-0">{t('accounts.title')}</h1>
            <div className="accounts-filter-row">
              <input
                className="input is-small accounts-filter-input"
                list="accounts-category-list"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder={t('accounts.filterPlaceholder')}
              />
              <datalist id="accounts-category-list">
                {prefixes.map(p => <option key={p} value={p} />)}
              </datalist>
              {filter && (
                <button type="button" className="delete is-small" onClick={() => setFilter('')} />
              )}
            </div>
          </div>
          <Link to="/accounts/new" className="button is-primary is-small">
            {t('accounts.newAccount')}
          </Link>
        </div>

        {actionData?.error && (
          <div className="notification is-danger is-light">
            {t(actionData.error, { defaultValue: actionData.error })}
          </div>
        )}

        {visibleGroups.length === 0 ? (
          <p className="has-text-grey is-size-7">{t('accounts.empty')}</p>
        ) : (
          visibleGroups.map(({ prefix, accounts }) => (
            <div key={prefix}>
              <p className="accounts-group-label">{t(`accounts.group${capitalize(prefix)}`, { defaultValue: prefix })}</p>
              <table className="table is-fullwidth is-hoverable is-size-7 mb-4">
                <thead>
                  <tr>
                    <th>{t('accounts.category')}</th>
                    <th>{t('accounts.name')}</th>
                    <th>{t('accounts.type')}</th>
                    <th>{t('accounts.subtype')}</th>
                    <th>{t('accounts.currency')}</th>
                    <th>{t('accounts.active')}</th>
                    <th>{t('accounts.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(account => (
                    <tr key={account.id} className={account.isActive ? '' : 'accounts-row-inactive'}>
                      <td>{formatCategory(account.category)}</td>
                      <td>{account.name}</td>
                      <td>{account.type}</td>
                      <td>{account.accountType}</td>
                      <td>{account.currencyCode}{account.securityTicker ? ` / ${account.securityTicker}` : ''}</td>
                      <td>{account.isActive ? '✓' : '—'}</td>
                      <td>
                        <Link to={`/accounts/${account.id}`} className="button is-small is-light mr-1">
                          {t('accounts.edit')}
                        </Link>
                        <button
                          type="button"
                          className="button is-small is-danger is-light"
                          onClick={() => setDeleteTarget({ id: account.id, name: account.name })}
                        >
                          {t('accounts.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}

      </div>

      {deleteTarget && (
        <div className="modal is-active">
          <div className="modal-background" onClick={() => setDeleteTarget(null)} />
          <div className="modal-card accounts-confirm-modal">
            <header className="modal-card-head">
              <p className="modal-card-title">{t('accounts.delete')}</p>
              <button type="button" className="delete" onClick={() => setDeleteTarget(null)} />
            </header>
            <section className="modal-card-body">
              <p>{t('accounts.confirmDelete', { name: deleteTarget.name })}</p>
              <form id="delete-account-form" method="post">
                <input type="hidden" name="_intent" value="delete" />
                <input type="hidden" name="id" value={deleteTarget.id} />
              </form>
            </section>
            <footer className="modal-card-foot">
              <button type="submit" form="delete-account-form" className="button is-danger">
                {t('accounts.delete')}
              </button>
              <button type="button" className="button" onClick={() => setDeleteTarget(null)}>
                {t('accounts.cancel')}
              </button>
            </footer>
          </div>
        </div>
      )}

    </section>
  );
}

function extractPrefixes(groups: { accounts: { category: string }[] }[]): string[] {
  const set = new Set<string>();
  for (const { accounts } of groups) {
    for (const { category } of accounts) {
      const parts = category.split('/');
      for (let i = 1; i <= parts.length; i++) {
        set.add(parts.slice(0, i).join('/'));
      }
    }
  }
  return Array.from(set).sort();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatCategory(category: string): React.ReactNode {
  const parts = category.split('/');
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="accounts-category-sep">/</span>}
          {part}
        </span>
      ))}
    </>
  );
}
