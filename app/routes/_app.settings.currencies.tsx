import { useState } from 'react';
import { Link, redirect, useActionData, useLoaderData, useSubmit } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '~/components/ConfirmModal';
import { db } from '~/db/client';
import { getAllCurrencies, deleteCurrency, setBaseCurrency } from '~/services/currency.service';
import { deleteCurrencySchema, setBaseCurrencySchema } from '~/schemas/currency.schema';
import type { Route } from './+types/_app.settings.currencies';

export async function loader(_: Route.LoaderArgs) {
  return { currencies: getAllCurrencies(db) };
}

export async function action({ request }: Route.ActionArgs) {
  const form   = await request.formData();
  const intent = String(form.get('_intent') ?? '');

  if (intent === 'delete') {
    const parsed = deleteCurrencySchema.safeParse({ id: form.get('id') });
    if (!parsed.success) return { error: 'currencies.notFound' };
    const result = deleteCurrency(db, parsed.data.id);
    if (!result.ok) return { error: result.error };
    return redirect('/settings/currencies');
  }

  if (intent === 'set-base') {
    const parsed = setBaseCurrencySchema.safeParse({ id: form.get('id') });
    if (!parsed.success) return { error: 'currencies.notFound' };
    const result = setBaseCurrency(db, parsed.data.id);
    if (!result.ok) return { error: result.error };
    return redirect('/settings/currencies');
  }

  return { error: 'Unknown intent.' };
}

export default function CurrenciesPage() {
  const { currencies } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation();
  const submit = useSubmit();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; code: string } | null>(null);

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="is-flex is-justify-content-space-between is-align-items-center mb-4">
          <h1 className="title is-5 mb-0">{t('currencies.title')}</h1>
          <Link to="/settings/currencies/new" className="button is-primary is-small">
            {t('currencies.newCurrency')}
          </Link>
        </div>

        {actionData?.error && (
          <div className="notification is-danger is-light">
            {t(actionData.error, { defaultValue: actionData.error })}
          </div>
        )}

        {currencies.length === 0 ? (
          <p className="has-text-grey is-size-7">{t('currencies.empty')}</p>
        ) : (
          <table className="table is-fullwidth is-hoverable is-size-7">
            <thead>
              <tr>
                <th>{t('currencies.code')}</th>
                <th>{t('currencies.name')}</th>
                <th>{t('currencies.symbol')}</th>
                <th className="has-text-right">{t('currencies.decimalPlaces')}</th>
                <th>{t('currencies.isBase')}</th>
                <th>{t('currencies.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map(currency => (
                <tr key={currency.id}>
                  <td><strong>{currency.code}</strong></td>
                  <td>{currency.name}</td>
                  <td>{currency.symbol}</td>
                  <td className="has-text-right">{currency.decimalPlaces}</td>
                  <td>
                    {currency.isBase ? (
                      <span className="tag is-success is-small">{t('currencies.baseBadge')}</span>
                    ) : '—'}
                  </td>
                  <td>
                    <Link
                      to={`/settings/currencies/${currency.id}/edit`}
                      className="button is-small is-light mr-1"
                    >
                      {t('currencies.edit')}
                    </Link>
                    {!currency.isBase && (
                      <button
                        type="button"
                        className="button is-small is-info is-light mr-1"
                        onClick={() => submit({ _intent: 'set-base', id: String(currency.id) }, { method: 'post' })}
                      >
                        {t('currencies.setAsBase')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="button is-small is-danger is-light"
                      onClick={() => setDeleteTarget({ id: currency.id, code: currency.code })}
                    >
                      {t('currencies.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('currencies.delete')}
        message={t('currencies.confirmDelete', { code: deleteTarget?.code ?? '' })}
        confirmLabel={t('currencies.delete')}
        cancelLabel={t('currencies.cancel')}
        confirmVariant="is-danger"
        onConfirm={() => {
          if (deleteTarget) submit({ _intent: 'delete', id: String(deleteTarget.id) }, { method: 'post' });
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
