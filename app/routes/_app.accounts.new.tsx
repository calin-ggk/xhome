import "./shared_accounts-form.css";
import { useState } from 'react';
import { Link, redirect, useActionData, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import { getNewAccountFormData, createAccount } from '~/services/account.service';
import { accountFormSchema, ACCOUNT_TYPES, ACCOUNT_SUBTYPES } from '~/schemas/account.schema';
import type { Route } from './+types/_app.accounts.new';

export async function loader(_: Route.LoaderArgs) {
  return getNewAccountFormData(db);
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const raw  = {
    name:        form.get('name'),
    type:        form.get('type'),
    accountType: form.get('accountType'),
    currencyId:  form.get('currencyId'),
    category:    form.get('category'),
    isActive:    form.has('isActive') ? '1' : '0',
    securityId:  form.get('securityId') || null,
  };

  const parsed = accountFormSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const result = createAccount(db, parsed.data);
  if (!result.ok) return { errors: { category: [result.error] } };

  return redirect('/accounts');
}

export default function NewAccountPage() {
  const { currencies, securities } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation();
  const [accountType, setAccountType] = useState('simple');

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="mb-4">
          <Link to="/accounts" className="is-size-7 has-text-grey">{t('accounts.backToAccounts')}</Link>
        </div>
        <h1 className="title is-5">{t('accounts.newAccount')}</h1>

        <form method="post" className="account-form-page">
          <div className="field">
            <label className="label" htmlFor="name">{t('accounts.formName')}</label>
            <div className="control">
              <input id="name" name="name" className="input" type="text" autoFocus />
            </div>
            {actionData?.errors?.name && (
              <p className="help is-danger">{actionData.errors.name[0]}</p>
            )}
          </div>

          <div className="field">
            <label className="label" htmlFor="type">{t('accounts.formType')}</label>
            <div className="control">
              <div className="select">
                <select id="type" name="type">
                  {ACCOUNT_TYPES.map(v => (
                    <option key={v} value={v}>{t(`accounts.type${capitalize(v)}`)}</option>
                  ))}
                </select>
              </div>
            </div>
            {actionData?.errors?.type && (
              <p className="help is-danger">{actionData.errors.type[0]}</p>
            )}
          </div>

          <div className="field">
            <label className="label" htmlFor="accountType">{t('accounts.formAccountType')}</label>
            <div className="control">
              <div className="select">
                <select
                  id="accountType"
                  name="accountType"
                  value={accountType}
                  onChange={e => setAccountType(e.target.value)}
                >
                  {ACCOUNT_SUBTYPES.map(v => (
                    <option key={v} value={v}>{t(`accounts.subtype${capitalize(v)}`)}</option>
                  ))}
                </select>
              </div>
            </div>
            {actionData?.errors?.accountType && (
              <p className="help is-danger">{actionData.errors.accountType[0]}</p>
            )}
          </div>

          <div className="field">
            <label className="label" htmlFor="currencyId">{t('accounts.formCurrency')}</label>
            <div className="control">
              <div className="select">
                <select id="currencyId" name="currencyId">
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
            <label className="label" htmlFor="category">{t('accounts.formCategory')}</label>
            <div className="control">
              <input
                id="category"
                name="category"
                className="input"
                type="text"
                placeholder="asset/bank/revolut"
              />
            </div>
            <p className="help">{t('accounts.formCategoryHelp')}</p>
            {actionData?.errors?.category && (
              <p className="help is-danger">{t(actionData.errors.category[0]!, { defaultValue: actionData.errors.category[0] })}</p>
            )}
          </div>

          <div className={`field account-security-field${accountType === 'security' ? '' : ' is-hidden'}`}>
            <label className="label" htmlFor="securityId">{t('accounts.formSecurity')}</label>
            <div className="control">
              <div className="select">
                <select id="securityId" name="securityId">
                  <option value="">{t('accounts.formNoSecurity')}</option>
                  {securities.map(s => (
                    <option key={s.id} value={s.id}>{s.ticker} — {s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {actionData?.errors?.securityId && (
              <p className="help is-danger">{actionData.errors.securityId[0]}</p>
            )}
          </div>

          <div className="field">
            <label className="checkbox">
              <input type="checkbox" name="isActive" value="1" defaultChecked />
              {' '}{t('accounts.formIsActive')}
            </label>
          </div>

          <div className="field is-grouped mt-5">
            <div className="control">
              <button type="submit" className="button is-primary">{t('accounts.save')}</button>
            </div>
            <div className="control">
              <Link to="/accounts" className="button is-light">{t('accounts.cancel')}</Link>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
