import './_app.settings.tags.css';
import { useState } from 'react';
import { Link, redirect, useActionData, useLoaderData, useSubmit } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '~/components/ConfirmModal';
import { db } from '~/db/client';
import { getAllTags, deleteTag } from '~/services/tag.service';
import { deleteTagSchema } from '~/schemas/tag.schema';
import type { Route } from './+types/_app.settings.tags';

export async function loader(_: Route.LoaderArgs) {
  return { tags: getAllTags(db) };
}

export async function action({ request }: Route.ActionArgs) {
  const form   = await request.formData();
  const intent = String(form.get('_intent') ?? '');

  if (intent === 'delete') {
    const parsed = deleteTagSchema.safeParse({ id: form.get('id') });
    if (!parsed.success) return { error: 'tags.notFound' };
    const result = deleteTag(db, parsed.data.id);
    if (!result.ok) return { error: result.error };
    return redirect('/settings/tags');
  }

  return { error: 'Unknown intent.' };
}

export default function TagsPage() {
  const { tags } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation();
  const submit = useSubmit();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="mb-4">
          <Link to="/settings" className="is-size-7 has-text-grey">{t('settings.backToSettings')}</Link>
        </div>
        <div className="is-flex is-justify-content-space-between is-align-items-center mb-4">
          <h1 className="title is-5 mb-0">{t('tags.title')}</h1>
          <Link to="/settings/tags/new" className="button is-primary is-small">
            {t('tags.newTag')}
          </Link>
        </div>

        {actionData?.error && (
          <div className="notification is-danger is-light">
            {t(actionData.error, { defaultValue: actionData.error })}
          </div>
        )}

        {tags.length === 0 ? (
          <p className="has-text-grey is-size-7">{t('tags.empty')}</p>
        ) : (
          <div className="tags-table-container">
          <table className="table is-fullwidth is-hoverable is-size-7">
            <thead>
              <tr>
                <th>{t('tags.name')}</th>
                <th>{t('tags.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tags.map(tag => (
                <tr key={tag.id}>
                  <td>{tag.name}</td>
                  <td>
                    <Link
                      to={`/settings/tags/${tag.id}/edit`}
                      className="button is-small is-light mr-1"
                    >
                      {t('tags.edit')}
                    </Link>
                    <button
                      type="button"
                      className="button is-small is-danger is-light"
                      onClick={() => setDeleteTarget({ id: tag.id, name: tag.name })}
                    >
                      {t('tags.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('tags.delete')}
        message={t('tags.confirmDelete', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('tags.delete')}
        cancelLabel={t('tags.cancel')}
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
