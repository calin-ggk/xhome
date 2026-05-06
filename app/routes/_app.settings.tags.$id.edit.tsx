import './shared_tags-form.css';
import { Link, redirect, useActionData, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import { getTagById, updateTag } from '~/services/tag.service';
import { tagFormSchema } from '~/schemas/tag.schema';
import type { Route } from './+types/_app.settings.tags.$id.edit';

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw new Response('Not Found', { status: 404 });
  const tag = getTagById(db, id);
  if (!tag) throw new Response('Not Found', { status: 404 });
  return { tag };
}

export async function action({ params, request }: Route.ActionArgs) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return { errors: { name: ['tags.notFound'] } };

  const form = await request.formData();
  const raw  = { name: form.get('name') };

  const parsed = tagFormSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const result = updateTag(db, id, parsed.data);
  if (!result.ok) return { errors: { name: [result.error] } };

  return redirect('/settings/tags');
}

export default function EditTagPage() {
  const { tag } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation();

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="mb-4">
          <Link to="/settings/tags" className="is-size-7 has-text-grey">
            {t('tags.backToTags')}
          </Link>
        </div>
        <div className="tags-form-page">
          <h1 className="title is-5">{t('tags.editTag')}</h1>

          <form method="post">
            <div className="field">
              <label className="label" htmlFor="name">{t('tags.formName')}</label>
              <div className="control">
                <input
                  id="name"
                  name="name"
                  className="input"
                  type="text"
                  maxLength={50}
                  defaultValue={tag.name}
                />
              </div>
              {actionData?.errors?.name && (
                <p className="help is-danger">
                  {t(actionData.errors.name[0]!, { defaultValue: actionData.errors.name[0] })}
                </p>
              )}
            </div>

            <div className="field is-grouped mt-5">
              <div className="control">
                <button type="submit" className="button is-primary">{t('tags.save')}</button>
              </div>
              <div className="control">
                <Link to="/settings/tags" className="button is-light">{t('tags.cancel')}</Link>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
