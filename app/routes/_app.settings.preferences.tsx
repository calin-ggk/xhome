import "./_app.settings.preferences.css";
import { Link, useLoaderData, useActionData, useNavigation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import { getPreferences, updatePreferences } from '~/services/preferences.service';
import { REPORT_RANGE_OPTIONS, preferencesSchema } from '~/schemas/preferences.schema';
import type { Route } from './+types/_app.settings.preferences';

export async function loader(_: Route.LoaderArgs) {
  return getPreferences(db);
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = preferencesSchema.safeParse({ defaultReportRange: formData.get('defaultReportRange') });
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  }
  const result = updatePreferences(db, parsed.data);
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, errors: { general: [result.error] } };
}

export default function PreferencesPage() {
  const prefs      = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { t }      = useTranslation();

  const isSubmitting = navigation.state === 'submitting';
  const isSuccess    = actionData?.ok === true;

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="mb-4">
          <Link to="/settings" className="is-size-7 has-text-grey">{t('settings.backToSettings')}</Link>
        </div>
        <div className="preferences-page">
          <h2 className="title is-4">{t('preferences.title')}</h2>

          {isSuccess && (
            <div className="notification is-success is-light mb-4">
              {t('preferences.saved')}
            </div>
          )}

          <form method="post">
            <div className="field">
              <label className="label">{t('preferences.defaultReportRange')}</label>
              <div className="control">
                <div className="select">
                  <select
                    key={prefs.defaultReportRange}
                    name="defaultReportRange"
                    defaultValue={prefs.defaultReportRange}
                  >
                    {REPORT_RANGE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{t(`preferences.range_${opt}`)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="help">{t('preferences.defaultReportRangeHelp')}</p>
            </div>

            <div className="field">
              <div className="control">
                <button type="submit" className="button is-primary" disabled={isSubmitting}>
                  {t('preferences.save')}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
