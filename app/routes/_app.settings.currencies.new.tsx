import './shared_currencies-form.css';
import { Link, redirect, useActionData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import { createCurrency } from '~/services/currency.service';
import { currencyFormSchema } from '~/schemas/currency.schema';
import type { Route } from './+types/_app.settings.currencies.new';

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const raw = {
    code:          form.get('code'),
    name:          form.get('name'),
    symbol:        form.get('symbol'),
    decimalPlaces: form.get('decimalPlaces'),
  };

  const parsed = currencyFormSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const result = createCurrency(db, parsed.data);
  if (!result.ok) return { errors: { code: [result.error] } };

  return redirect('/settings/currencies');
}

export default function NewCurrencyPage() {
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
          <h1 className="title is-5">{t('currencies.newCurrency')}</h1>

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
                  autoFocus
                  placeholder="USD"
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
                <input id="name" name="name" className="input" type="text" />
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
                <input id="symbol" name="symbol" className="input" type="text" maxLength={10} />
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
                  defaultValue={2}
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
