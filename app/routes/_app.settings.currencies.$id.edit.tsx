import './shared_currencies-form.css';
import { Link, redirect, useActionData, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import { getCurrencyById, updateCurrency } from '~/services/currency.service';
import { currencyFormSchema } from '~/schemas/currency.schema';
import type { Route } from './+types/_app.settings.currencies.$id.edit';

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw new Response('Not Found', { status: 404 });
  const currency = getCurrencyById(db, id);
  if (!currency) throw new Response('Not Found', { status: 404 });
  return { currency };
}

export async function action({ params, request }: Route.ActionArgs) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return { errors: { code: ['currencies.notFound'] } };

  const form = await request.formData();
  const raw = {
    code:          form.get('code'),
    name:          form.get('name'),
    symbol:        form.get('symbol'),
    decimalPlaces: form.get('decimalPlaces'),
  };

  const parsed = currencyFormSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const result = updateCurrency(db, id, parsed.data);
  if (!result.ok) return { errors: { code: [result.error] } };

  return redirect('/settings/currencies');
}

export default function EditCurrencyPage() {
  const { currency } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation();

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="mb-4">
          <Link to="/settings/currencies" className="is-size-7 has-text-grey">
            {t('currencies.backToCurrencies')}
          </Link>
        </div>
        <div className="currencies-form-page">
          <h1 className="title is-5">{t('currencies.editCurrency')}</h1>

          <form method="post">
            <div className="field">
              <label className="label" htmlFor="code">{t('currencies.formCode')}</label>
              <div className="control">
                <input
                  id="code"
                  name="code"
                  className="input"
                  type="text"
                  maxLength={10}
                  defaultValue={currency.code}
                />
              </div>
              <p className="help">{t('currencies.formCodeHelp')}</p>
              {actionData?.errors?.code && (
                <p className="help is-danger">
                  {t(actionData.errors.code[0]!, { defaultValue: actionData.errors.code[0] })}
                </p>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="name">{t('currencies.formName')}</label>
              <div className="control">
                <input id="name" name="name" className="input" type="text" defaultValue={currency.name} />
              </div>
              {actionData?.errors?.name && (
                <p className="help is-danger">
                  {t(actionData.errors.name[0]!, { defaultValue: actionData.errors.name[0] })}
                </p>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="symbol">{t('currencies.formSymbol')}</label>
              <div className="control">
                <input
                  id="symbol"
                  name="symbol"
                  className="input"
                  type="text"
                  maxLength={10}
                  defaultValue={currency.symbol}
                />
              </div>
              {actionData?.errors?.symbol && (
                <p className="help is-danger">
                  {t(actionData.errors.symbol[0]!, { defaultValue: actionData.errors.symbol[0] })}
                </p>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="decimalPlaces">{t('currencies.formDecimalPlaces')}</label>
              <div className="control">
                <input
                  id="decimalPlaces"
                  name="decimalPlaces"
                  className="input"
                  type="number"
                  min={0}
                  max={8}
                  defaultValue={currency.decimalPlaces}
                />
              </div>
              <p className="help">{t('currencies.formDecimalPlacesHelp')}</p>
              {actionData?.errors?.decimalPlaces && (
                <p className="help is-danger">
                  {t(String(actionData.errors.decimalPlaces[0]), { defaultValue: String(actionData.errors.decimalPlaces[0]) })}
                </p>
              )}
            </div>

            <div className="field is-grouped mt-5">
              <div className="control">
                <button type="submit" className="button is-primary">{t('currencies.save')}</button>
              </div>
              <div className="control">
                <Link to="/settings/currencies" className="button is-light">{t('currencies.cancel')}</Link>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
