import './_app.reconcile.$id.css';
import { useState, useCallback, useMemo } from 'react';
import { Link, useLoaderData, useActionData, useNavigation, redirect } from 'react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { db } from '~/db/client';
import { getReconciliationPageData, saveReconciliation } from '~/services/reconciliation.service';
import type { UserEntry } from '~/services/reconciliation.service';
import { AmountInput } from '~/components/AmountInput';
import { useFormat } from '~/hooks/useFormat';
import type { Route } from './+types/_app.reconcile.$id';

export async function loader({ params }: Route.LoaderArgs) {
  const id   = Number(params.id);
  const data = getReconciliationPageData(db, isFinite(id) ? id : undefined);
  if (!data.selected) throw new Response('Not Found', { status: 404 });
  return data;
}

const EntrySchema = z.object({
  accountId: z.coerce.number().int().positive(),
  side:      z.enum(['debit', 'credit']),
  amount:    z.string(),
});

const ActionSchema = z.object({
  realBalance: z.string(),
  intent:      z.enum(['save', 'mark']),
});

export async function action({ request, params }: Route.ActionArgs) {
  const accountId = Number(params.id);
  if (!isFinite(accountId)) return { error: 'reconcile.invalidSubmission' };

  const formData = await request.formData();

  const parsed = ActionSchema.safeParse({
    realBalance: formData.get('realBalance') ?? '0',
    intent:      formData.get('intent'),
  });
  if (!parsed.success) return { error: 'reconcile.invalidSubmission' };

  const { realBalance, intent } = parsed.data;

  const userEntries: UserEntry[] = [];
  let i = 0;
  while (formData.has(`entry_${i}_accountId`)) {
    const ep = EntrySchema.safeParse({
      accountId: formData.get(`entry_${i}_accountId`),
      side:      formData.get(`entry_${i}_side`),
      amount:    formData.get(`entry_${i}_amount`),
    });
    if (!ep.success) return { error: 'reconcile.invalidSubmission' };

    const amountDecimal = parseFloat(ep.data.amount);
    if (!isFinite(amountDecimal) || amountDecimal < 0) return { error: 'reconcile.invalidAmount' };

    if (intent === 'save' && amountDecimal > 0) {
      userEntries.push({
        accountId: ep.data.accountId,
        side:      ep.data.side,
        amount:    Math.round(amountDecimal * 100),
      });
    }
    i++;
  }

  const today = new Date().toISOString().slice(0, 10);
  let realBalanceCents: number;

  if (intent === 'mark') {
    const data = getReconciliationPageData(db, accountId, today);
    realBalanceCents = data.selected?.bookBalance ?? 0;
  } else {
    const d = parseFloat(realBalance);
    if (!isFinite(d)) return { error: 'reconcile.invalidAmount' };
    realBalanceCents = Math.round(d * 100);
  }

  const result = await saveReconciliation(db, { accountId, realBalanceCents, userEntries, today });
  if (!result.ok) return { error: result.error };

  return redirect('/reconcile');
}

export default function ReconcileDetailPage() {
  const { accounts, selected } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { fmtAmount } = useFormat();

  const isSubmitting = navigation.state === 'submitting';

  const [realBalanceInput, setRealBalanceInput] = useState('');
  const [userEntries, setUserEntries] = useState<Array<{ accountId: string; side: 'debit' | 'credit'; amount: string }>>([]);

  const account     = selected.account;
  const bookBalance = selected.bookBalance;

  const realBalanceCents = useMemo(() => {
    const d = parseFloat(realBalanceInput);
    return isFinite(d) ? Math.round(d * 100) : null;
  }, [realBalanceInput]);

  const diff = realBalanceCents !== null ? realBalanceCents - bookBalance : null;

  const fixedSide = useMemo((): 'debit' | 'credit' | null => {
    if (diff === null || diff === 0) return null;
    if (account.type === 'debit') return diff > 0 ? 'debit' : 'credit';
    return diff > 0 ? 'credit' : 'debit';
  }, [account, diff]);

  const autoAmount = useMemo(() => {
    if (diff === null || diff === 0 || fixedSide === null) return null;
    const fixedSigned = fixedSide === 'debit' ? Math.abs(diff) : -Math.abs(diff);
    const userSigned  = userEntries.reduce((sum, e) => {
      const cents = Math.round(parseFloat(e.amount || '0') * 100);
      return sum + (e.side === 'debit' ? cents : -cents);
    }, 0);
    return -(fixedSigned + userSigned);
  }, [diff, fixedSide, userEntries]);

  const autoSide: 'debit' | 'credit' | null = autoAmount === null ? null : autoAmount >= 0 ? 'debit' : 'credit';
  const autoAmountAbs = autoAmount !== null ? Math.abs(autoAmount) : 0;
  const autoLabel = autoSide === 'credit' ? 'Reconciliation Surplus' : 'Reconciliation Deficit';

  const addUserEntry = useCallback(() => {
    setUserEntries(prev => [...prev, { accountId: '', side: 'debit', amount: '' }]);
  }, []);

  const removeUserEntry = useCallback((idx: number) => {
    setUserEntries(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateUserEntry = useCallback(<K extends keyof typeof userEntries[number]>(
    idx: number,
    field: K,
    value: typeof userEntries[number][K],
  ) => {
    setUserEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }, []);

  const dp = account.decimalPlaces ?? 2;

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="mb-4">
          <Link to="/reconcile" className="is-size-7 has-text-grey">{t('reconcile.backToReconcile')}</Link>
        </div>

        <div className="reconcile-form-page">
          <h2 className="title is-4 mb-4">{account.category}</h2>

          {actionData && 'error' in actionData && (
            <div className="notification is-danger is-light mb-4">
              {t(actionData.error)}
            </div>
          )}

          {/* Balance summary */}
          <div className="reconcile-balance-grid mb-4">
            <div>
              <div className="reconcile-balance-label">{t('reconcile.bookBalance')}</div>
              <div className="reconcile-balance-value">
                {fmtAmount(bookBalance, dp)} {account.currencyCode}
              </div>
            </div>
            <div>
              <div className="reconcile-balance-label">{t('reconcile.realBalance')}</div>
              <AmountInput
                className="input"
                decimals={dp}
                value={realBalanceInput}
                onChange={setRealBalanceInput}
              />
              <p className="help">{t('reconcile.realBalanceHelp')}</p>
            </div>
            <div>
              <div className="reconcile-balance-label">{t('reconcile.diff')}</div>
              <div className={`reconcile-balance-value ${diff === null ? '' : diff > 0 ? 'reconcile-diff-positive' : diff < 0 ? 'reconcile-diff-negative' : ''}`}>
                {diff === null ? '—' : diff === 0
                  ? t('reconcile.noDiff')
                  : `${diff > 0 ? '+' : ''}${fmtAmount(diff, dp)} ${account.currencyCode}`
                }
              </div>
            </div>
          </div>

          {/* diff == 0: mark as reconciled */}
          {diff === 0 && (
            <form method="post">
              <input type="hidden" name="realBalance" value={realBalanceInput} />
              <input type="hidden" name="intent" value="mark" />
              <div className="field is-grouped is-justify-content-center">
                <div className="control">
                  <Link to="/reconcile" className="button is-light">{t('reconcile.cancel')}</Link>
                </div>
                <div className="control">
                  <button type="submit" className="button is-success" disabled={isSubmitting}>
                    {isSubmitting ? t('reconcile.saving') : t('reconcile.markReconciled')}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* diff != 0: transaction builder */}
          {diff !== null && diff !== 0 && fixedSide !== null && (
            <form method="post">
              <input type="hidden" name="realBalance" value={realBalanceInput} />
              <input type="hidden" name="intent" value="save" />

              <p className="label mb-2">{t('reconcile.transactionTitle')}</p>
              <table className="table is-fullwidth is-bordered is-narrow">
                <thead>
                  <tr>
                    <th>{t('reconcile.account')}</th>
                    <th style={{ width: '80px' }}>{t('reconcile.side')}</th>
                    <th style={{ width: '160px' }} className="reconcile-entry-amount">{t('reconcile.amount')}</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Fixed entry */}
                  <tr className="reconcile-fixed-row">
                    <td>
                      <small className="has-text-grey">{t('reconcile.fixedEntry')}</small>
                      <br />{account.category}
                    </td>
                    <td>
                      <span className={`reconcile-side-badge is-${fixedSide}`}>
                        {fixedSide === 'debit' ? 'D' : 'C'}
                      </span>
                    </td>
                    <td className="reconcile-entry-amount">
                      {fmtAmount(Math.abs(diff), dp)} {account.currencyCode}
                    </td>
                    <td></td>
                  </tr>

                  {/* User entries */}
                  {userEntries.map((e, idx) => (
                    <tr key={idx}>
                      <td>
                        <div className="select is-small is-fullwidth">
                          <select
                            name={`entry_${idx}_accountId`}
                            value={e.accountId}
                            onChange={ev => updateUserEntry(idx, 'accountId', ev.target.value)}
                            required
                          >
                            <option value="">{t('reconcile.account')}…</option>
                            {accounts.map(a => (
                              <option key={a.id} value={a.id}>{a.category}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td>
                        <div className="select is-small">
                          <select
                            name={`entry_${idx}_side`}
                            value={e.side}
                            onChange={ev => updateUserEntry(idx, 'side', ev.target.value as 'debit' | 'credit')}
                          >
                            <option value="debit">D</option>
                            <option value="credit">C</option>
                          </select>
                        </div>
                      </td>
                      <td>
                        <AmountInput
                          className="input is-small"
                          decimals={dp}
                          name={`entry_${idx}_amount`}
                          value={e.amount}
                          onChange={v => updateUserEntry(idx, 'amount', v)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="delete is-small"
                          title={t('reconcile.removeEntry')}
                          onClick={() => removeUserEntry(idx)}
                        />
                      </td>
                    </tr>
                  ))}

                  {/* Auto entry */}
                  {autoAmount !== null && (
                    <tr className="reconcile-auto-row">
                      <td>
                        <small className="has-text-grey">{t('reconcile.autoEntry')}</small>
                        <br />{autoLabel}
                      </td>
                      <td>
                        {autoSide && (
                          <span className={`reconcile-side-badge is-${autoSide}`}>
                            {autoSide === 'debit' ? 'D' : 'C'}
                          </span>
                        )}
                      </td>
                      <td className="reconcile-entry-amount">
                        {fmtAmount(autoAmountAbs, dp)} {account.currencyCode}
                      </td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="mb-3">
                <button
                  type="button"
                  className="button is-light is-small"
                  onClick={addUserEntry}
                >
                  + {t('reconcile.addEntry')}
                </button>
              </div>

              <div className="field is-grouped is-justify-content-center">
                <div className="control">
                  <Link to="/reconcile" className="button is-light">{t('reconcile.cancel')}</Link>
                </div>
                <div className="control">
                  <button
                    type="submit"
                    className="button is-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? t('reconcile.saving') : t('reconcile.save')}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
