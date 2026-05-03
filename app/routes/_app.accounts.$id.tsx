import "./shared_accounts-form.css";
import { useRef, useState } from 'react';
import { Link, redirect, useActionData, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '~/components/ConfirmModal';
import { db } from '~/db/client';
import { getEditAccountFormData, updateAccount } from '~/services/account.service';
import { accountFormSchema, ACCOUNT_TYPES, ACCOUNT_SUBTYPES } from '~/schemas/account.schema';
import type { Route } from './+types/_app.accounts.$id';

export async function loader({ params }: Route.LoaderArgs) {
  const id   = Number(params.id);
  const data = getEditAccountFormData(db, id);
  if (!data) throw new Response('Not Found', { status: 404 });
  return data;
}

export async function action({ request, params }: Route.ActionArgs) {
  const id   = Number(params.id);
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

  const result = updateAccount(db, id, parsed.data);
  if (!result.ok) return { errors: { category: [result.error] } };

  return redirect('/accounts');
}

export default function EditAccountPage() {
  const { account, currencies, securities } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation();
  const [accountType, setAccountType] = useState(account.accountType);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="mb-4">
          <Link to="/accounts" className="is-size-7 has-text-grey">{t('accounts.backToAccounts')}</Link>
        </div>
        <div className="account-form-page">
        <h1 className="title is-5">{t('accounts.editAccount')}</h1>

        <form ref={formRef} method="post" onSubmit={e => { e.preventDefault(); setConfirmOpen(true); }}>
          <div className="field">
            <label className="label" htmlFor="name">{t('accounts.formName')}</label>
            <div className="control">
              <input
                id="name"
                name="name"
                className="input"
                type="text"
                defaultValue={account.name}
              />
            </div>
            {actionData?.errors?.name && (
              <p className="help is-danger">{actionData.errors.name[0]}</p>
            )}
          </div>

          <div className="field">
            <label className="label" htmlFor="type">{t('accounts.formType')}</label>
            <div className="control">
              <div className="select">
                <select id="type" name="type" defaultValue={account.type}>
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
                <select id="currencyId" name="currencyId" defaultValue={account.currencyId}>
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
                defaultValue={account.category}
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
                <select
                  id="securityId"
                  name="securityId"
                  defaultValue={account.securityId ?? ''}
                >
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
            <label className="label">{t('accounts.formIsActive')}</label>
            <div className="control">
              <input type="checkbox" name="isActive" value="1" defaultChecked={account.isActive === 1} />
            </div>
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
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        title={t('accounts.editAccount')}
        message={t('accounts.confirmSave')}
        confirmLabel={t('accounts.save')}
        cancelLabel={t('accounts.cancel')}
        confirmVariant="is-primary"
        onConfirm={() => { setConfirmOpen(false); formRef.current?.submit(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
