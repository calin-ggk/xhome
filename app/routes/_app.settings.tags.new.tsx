import './shared_tags-form.css';
import { Link, redirect, useActionData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import { createTag } from '~/services/tag.service';
import { tagFormSchema } from '~/schemas/tag.schema';
import type { Route } from './+types/_app.settings.tags.new';

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const raw  = { name: form.get('name') };

  const parsed = tagFormSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const result = createTag(db, parsed.data);
  if (!result.ok) return { errors: { name: [result.error] } };

  return redirect('/settings/tags');
}

export default function NewTagPage() {
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
          <h1 className="title is-5">{t('tags.newTag')}</h1>

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
                  autoFocus
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
