import { useState } from 'react';
import { Link, redirect, useActionData, useLoaderData, useSubmit } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '~/components/ConfirmModal';
import { db } from '~/db/client';
import { getAllSecurities, deleteSecurity } from '~/services/security.service';
import { deleteSecuritySchema } from '~/schemas/security.schema';
import type { Route } from './+types/_app.settings.securities';

export async function loader(_: Route.LoaderArgs) {
  return { securities: getAllSecurities(db) };
}

export async function action({ request }: Route.ActionArgs) {
  const form   = await request.formData();
  const intent = String(form.get('_intent') ?? '');

  if (intent === 'delete') {
    const parsed = deleteSecuritySchema.safeParse({ id: form.get('id') });
    if (!parsed.success) return { error: 'securities.notFound' };
    const result = deleteSecurity(db, parsed.data.id);
    if (!result.ok) return { error: result.error };
    return redirect('/settings/securities');
  }

  return { error: 'Unknown intent.' };
}

export default function SecuritiesPage() {
  const { securities } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation();
  const submit = useSubmit();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; ticker: string } | null>(null);

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="mb-4">
          <Link to="/settings" className="is-size-7 has-text-grey">{t('settings.backToSettings')}</Link>
        </div>
        <div className="is-flex is-justify-content-space-between is-align-items-center mb-4">
          <h1 className="title is-5 mb-0">{t('securities.title')}</h1>
          <Link to="/settings/securities/new" className="button is-primary is-small">
            {t('securities.newSecurity')}
          </Link>
        </div>

        {actionData?.error && (
          <div className="notification is-danger is-light">
            {t(actionData.error, { defaultValue: actionData.error })}
          </div>
        )}

        {securities.length === 0 ? (
          <p className="has-text-grey is-size-7">{t('securities.empty')}</p>
        ) : (
          <table className="table is-fullwidth is-hoverable is-size-7">
            <thead>
              <tr>
                <th>{t('securities.ticker')}</th>
                <th>{t('securities.name')}</th>
                <th>{t('securities.currency')}</th>
                <th>{t('securities.type')}</th>
                <th className="has-text-right">{t('securities.quantityScale')}</th>
                <th className="has-text-right">{t('securities.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {securities.map(security => (
                <tr key={security.id}>
                  <td><strong>{security.ticker}</strong></td>
                  <td>{security.name}</td>
                  <td>{security.currencyCode}</td>
                  <td>
                    <span className="tag is-light is-small">
                      {t(`securities.type${security.type.charAt(0).toUpperCase()}${security.type.slice(1)}`)}
                    </span>
                  </td>
                  <td className="has-text-right">{security.quantityScale}</td>
                  <td className="has-text-right">
                    <Link
                      to={`/settings/securities/${security.id}/edit`}
                      className="button is-small is-light mr-1"
                    >
                      {t('securities.edit')}
                    </Link>
                    <button
                      type="button"
                      className="button is-small is-danger is-light"
                      onClick={() => setDeleteTarget({ id: security.id, ticker: security.ticker })}
                    >
                      {t('securities.delete')}
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
        title={t('securities.delete')}
        message={t('securities.confirmDelete', { ticker: deleteTarget?.ticker ?? '' })}
        confirmLabel={t('securities.delete')}
        cancelLabel={t('securities.cancel')}
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
