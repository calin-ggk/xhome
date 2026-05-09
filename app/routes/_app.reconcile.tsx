import './_app.reconcile.css';
import { useState, useCallback, useMemo } from 'react';
import { NavLink, useLoaderData, useActionData, useNavigation, redirect, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { db } from '~/db/client';
import { getReconciliationPageData, saveReconciliation } from '~/services/reconciliation.service';
import type { AccountOption, UserEntry } from '~/services/reconciliation.service';
import { useFormat } from '~/hooks/useFormat';
import type { Route } from './+types/_app.reconcile';

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get('account');
  const id = accountId ? parseInt(accountId, 10) : undefined;
  return getReconciliationPageData(db, isFinite(id ?? NaN) ? id : undefined);
}

const EntrySchema = z.object({
  accountId: z.coerce.number().int().positive(),
  side:      z.enum(['debit', 'credit']),
  amount:    z.string(),
});

const ActionSchema = z.object({
  accountId:   z.coerce.number().int().positive(),
  realBalance: z.string(),
  intent:      z.enum(['save', 'mark']),
});

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

  const parsed = ActionSchema.safeParse({
    accountId:   formData.get('accountId'),
    realBalance: formData.get('realBalance') ?? '0',
    intent:      formData.get('intent'),
  });
  if (!parsed.success) return { error: 'reconcile.invalidSubmission' };

  const { accountId, realBalance, intent } = parsed.data;

  // Parse user entries
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

    // For "mark" intent, user entries are irrelevant
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
    // Use book balance as real balance so diff = 0
    const data = getReconciliationPageData(db, accountId, today);
    realBalanceCents = data.selected?.bookBalance ?? 0;
  } else {
    const d = parseFloat(realBalance);
    if (!isFinite(d)) return { error: 'reconcile.invalidAmount' };
    realBalanceCents = Math.round(d * 100);
  }

  const result = await saveReconciliation(db, { accountId, realBalanceCents, userEntries, today });
  if (!result.ok) return { error: result.error };

  return redirect(`/reconcile?account=${accountId}&saved=1`);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReconcilePage() {
  const { accounts, pendingCount, selected, today } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { fmtAmount } = useFormat();

  const isSubmitting = navigation.state === 'submitting';
  const isSaved      = searchParams.get('saved') === '1';

  const [realBalanceInput, setRealBalanceInput] = useState('');
  const [userEntries, setUserEntries] = useState<Array<{ accountId: string; side: 'debit' | 'credit'; amount: string }>>([]);

  const account = selected?.account ?? null;
  const bookBalance = selected?.bookBalance ?? 0;

  const realBalanceCents = useMemo(() => {
    const d = parseFloat(realBalanceInput);
    return isFinite(d) ? Math.round(d * 100) : null;
  }, [realBalanceInput]);

  const diff = realBalanceCents !== null ? realBalanceCents - bookBalance : null;

  // Compute fixed entry
  const fixedSide = useMemo((): 'debit' | 'credit' | null => {
    if (!account || diff === null || diff === 0) return null;
    if (account.type === 'debit') return diff > 0 ? 'debit' : 'credit';
    return diff > 0 ? 'credit' : 'debit';
  }, [account, diff]);

  // Compute running auto amount
  const autoAmount = useMemo(() => {
    if (diff === null || diff === 0 || fixedSide === null) return null;
    const fixedSigned = fixedSide === 'debit' ? Math.abs(diff) : -Math.abs(diff);
    const userSigned = userEntries.reduce((sum, e) => {
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

  const formatBalance = (cents: number, dp: number) =>
    fmtAmount(cents / Math.pow(10, dp), dp);

  const dp = account?.decimalPlaces ?? 2;

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="reconcile-page">
          <h2 className="title is-4 mb-4">{t('reconcile.title')}</h2>

          {isSaved && (
            <div className="notification is-success is-light mb-4">
              {t('reconcile.saved')}
            </div>
          )}

          {actionData && 'error' in actionData && (
            <div className="notification is-danger is-light mb-4">
              {t(actionData.error)}
            </div>
          )}

          <div className="reconcile-layout">

            {/* Account panel */}
            <div className="reconcile-account-panel">
              <p className="heading mb-2">
                {pendingCount > 0
                  ? t('reconcile.pendingCount', { count: pendingCount })
                  : t('reconcile.allDone')}
              </p>
              <div className="reconcile-account-list">
                {accounts.map(a => (
                  <NavLink
                    key={a.id}
                    to={`/reconcile?account=${a.id}`}
                    className={({ isActive: _ }) =>
                      `reconcile-account-item${account?.id === a.id ? ' is-selected' : ''}${a.reconciled ? ' is-done' : ''}`
                    }
                    onClick={() => { setRealBalanceInput(''); setUserEntries([]); }}
                    preventScrollReset
                  >
                    <span className="reconcile-account-category" title={a.category}>
                      {a.category}
                    </span>
                    {a.reconciled && (
                      <span className="tag is-success is-light is-small ml-2">
                        {t('reconcile.reconciledBadge')}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>

            {/* Reconciliation form */}
            <div className="reconcile-form-panel">
              {!account ? (
                <p className="has-text-grey">{t('reconcile.selectAccount')}</p>
              ) : (
                <>
                  {/* Balance summary */}
                  <div className="reconcile-balance-grid mb-4">
                    <div>
                      <div className="reconcile-balance-label">{t('reconcile.bookBalance')}</div>
                      <div className="reconcile-balance-value">
                        {formatBalance(bookBalance, dp)} {account.currencyCode}
                      </div>
                    </div>
                    <div>
                      <div className="reconcile-balance-label">{t('reconcile.realBalance')}</div>
                      <input
                        className="input"
                        type="number"
                        step={`${Math.pow(10, -dp).toFixed(dp)}`}
                        placeholder={`0.${'0'.repeat(dp)}`}
                        value={realBalanceInput}
                        onChange={e => setRealBalanceInput(e.target.value)}
                      />
                      <p className="help">{t('reconcile.realBalanceHelp')}</p>
                    </div>
                    <div>
                      <div className="reconcile-balance-label">{t('reconcile.diff')}</div>
                      <div className={`reconcile-balance-value ${diff === null ? '' : diff > 0 ? 'reconcile-diff-positive' : diff < 0 ? 'reconcile-diff-negative' : ''}`}>
                        {diff === null ? '—' : diff === 0
                          ? t('reconcile.noDiff')
                          : `${diff > 0 ? '+' : ''}${formatBalance(diff, dp)} ${account.currencyCode}`
                        }
                      </div>
                    </div>
                  </div>

                  {/* diff == 0: mark as reconciled */}
                  {diff === 0 && (
                    <form method="post">
                      <input type="hidden" name="accountId" value={account.id} />
                      <input type="hidden" name="realBalance" value={realBalanceInput} />
                      <input type="hidden" name="intent" value="mark" />
                      <button type="submit" className="button is-success" disabled={isSubmitting}>
                        {isSubmitting ? t('reconcile.saving') : t('reconcile.markReconciled')}
                      </button>
                    </form>
                  )}

                  {/* diff != 0: transaction builder */}
                  {diff !== null && diff !== 0 && fixedSide !== null && (
                    <form method="post">
                      <input type="hidden" name="accountId" value={account.id} />
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
                              {formatBalance(Math.abs(diff), dp)} {account.currencyCode}
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
                                <input
                                  className="input is-small"
                                  type="number"
                                  name={`entry_${idx}_amount`}
                                  step={`${Math.pow(10, -dp).toFixed(dp)}`}
                                  min="0"
                                  value={e.amount}
                                  onChange={ev => updateUserEntry(idx, 'amount', ev.target.value)}
                                  style={{ textAlign: 'right' }}
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
                                {formatBalance(autoAmountAbs, dp)} {account.currencyCode}
                              </td>
                              <td></td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                      <div className="field is-grouped">
                        <div className="control">
                          <button
                            type="button"
                            className="button is-light is-small"
                            onClick={addUserEntry}
                          >
                            + {t('reconcile.addEntry')}
                          </button>
                        </div>
                        <div className="control ml-auto">
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
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
