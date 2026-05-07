import './shared_securities-form.css';
import { Link, redirect, useActionData, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import { getSecurityEditFormData, updateSecurity } from '~/services/security.service';
import { securityFormSchema, SECURITY_TYPES } from '~/schemas/security.schema';
import type { Route } from './+types/_app.settings.securities.$id.edit';

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw new Response('Not Found', { status: 404 });
  const data = getSecurityEditFormData(db, id);
  if (!data) throw new Response('Not Found', { status: 404 });
  return data;
}

export async function action({ params, request }: Route.ActionArgs) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return { errors: { ticker: ['securities.notFound'] } };

  const form = await request.formData();
  const raw = {
    ticker:        form.get('ticker'),
    name:          form.get('name'),
    currencyId:    form.get('currencyId'),
    type:          form.get('type'),
    quantityScale: form.get('quantityScale'),
  };

  const parsed = securityFormSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const result = updateSecurity(db, id, parsed.data);
  if (!result.ok) return { errors: { ticker: [result.error] } };

  return redirect('/settings/securities');
}

export default function EditSecurityPage() {
  const { security, currencies } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation();

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="mb-4">
          <Link to="/settings/securities" className="is-size-7 has-text-grey">
            {t('securities.backToSecurities')}
          </Link>
        </div>
        <div className="securities-form-page">
          <h1 className="title is-5">{t('securities.editSecurity')}</h1>

          <form method="post">
            <div className="field">
              <label className="label" htmlFor="ticker">{t('securities.formTicker')}</label>
              <div className="control">
                <input
                  id="ticker"
                  name="ticker"
                  className="input"
                  type="text"
                  maxLength={20}
                  defaultValue={security.ticker}
                />
              </div>
              <p className="help">{t('securities.formTickerHelp')}</p>
              {actionData?.errors?.ticker && (
                <p className="help is-danger">
                  {t(actionData.errors.ticker[0]!, { defaultValue: actionData.errors.ticker[0] })}
                </p>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="name">{t('securities.formName')}</label>
              <div className="control">
                <input
                  id="name"
                  name="name"
                  className="input"
                  type="text"
                  defaultValue={security.name}
                />
              </div>
              {actionData?.errors?.name && (
                <p className="help is-danger">{actionData.errors.name[0]}</p>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="currencyId">{t('securities.formCurrency')}</label>
              <div className="control">
                <div className="select is-fullwidth">
                  <select id="currencyId" name="currencyId" defaultValue={security.currencyId}>
                    {currencies.map(c => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {actionData?.errors?.currencyId && (
                <p className="help is-danger">{actionData.errors.currencyId[0]}</p>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="type">{t('securities.formType')}</label>
              <div className="control">
                <div className="select is-fullwidth">
                  <select id="type" name="type" defaultValue={security.type}>
                    {SECURITY_TYPES.map(type => (
                      <option key={type} value={type}>
                        {t(`securities.type${type.charAt(0).toUpperCase()}${type.slice(1)}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {actionData?.errors?.type && (
                <p className="help is-danger">{actionData.errors.type[0]}</p>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="quantityScale">{t('securities.formQuantityScale')}</label>
              <div className="control">
                <input
                  id="quantityScale"
                  name="quantityScale"
                  className="input"
                  type="number"
                  min={0}
                  max={10}
                  defaultValue={security.quantityScale}
                />
              </div>
              <p className="help">{t('securities.formQuantityScaleHelp')}</p>
              {actionData?.errors?.quantityScale && (
                <p className="help is-danger">
                  {t(String(actionData.errors.quantityScale[0]), { defaultValue: String(actionData.errors.quantityScale[0]) })}
                </p>
              )}
            </div>

            <div className="field is-grouped mt-5">
              <div className="control">
                <button type="submit" className="button is-primary">{t('securities.save')}</button>
              </div>
              <div className="control">
                <Link to="/settings/securities" className="button is-light">{t('securities.cancel')}</Link>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
