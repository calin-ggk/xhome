import './TransactionForm.css';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '~/components/ConfirmModal';
import type { AccountOption, ExchangeRateRow, TagOption, BaseCurrency } from '~/repositories/transaction.repository';
import type { TransactionDetail } from '~/repositories/transaction.repository';

// ── Types ─────────────────────────────────────────────────────────────────────

type EntryRow = {
  key: string;
  accountId: string;
  side: 'debit' | 'credit';
  amountStr: string;
  rateStr: string;
  baseAmountStr: string;
  memo: string;
  quantityStr: string;
  interestRatePct: string;
  maturityDate: string;
};

export type TransactionFormActionData = {
  errors?: Partial<Record<string, string[]>>;
  error?: string;
} | null | undefined;

interface Props {
  accounts: AccountOption[];
  exchangeRates: ExchangeRateRow[];
  tags: TagOption[];
  baseCurrency: BaseCurrency | null;
  initialValues?: {
    date: string;
    description: string | null;
    tagIds: number[];
    entries: TransactionDetail['entries'];
  };
  actionData?: TransactionFormActionData;
  backLink: string;
  submitLabel: string;
  title: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findRate(
  currencyId: number,
  date: string,
  rates: ExchangeRateRow[],
): number | null {
  const candidates = rates
    .filter(r => r.currencyId === currencyId && r.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date));
  const found = candidates[0];
  return found ? found.rate / Math.pow(10, found.decimalPlaces) : null;
}

function fmtCents(cents: number, decimalPlaces = 2): string {
  return (cents / Math.pow(10, decimalPlaces)).toFixed(decimalPlaces);
}

function entryToRow(
  entry: TransactionDetail['entries'][number],
  key: string,
): EntryRow {
  const isBase      = entry.isBaseCurrency === 1;
  const rateDecimal = isBase ? 1 : entry.amountBase / entry.amount;
  const dp          = entry.currencyDecimalPlaces;
  return {
    key,
    accountId:      String(entry.accountId),
    side:           entry.side as 'debit' | 'credit',
    amountStr:      fmtCents(entry.amount, dp),
    rateStr:        rateDecimal.toFixed(6).replace(/\.?0+$/, ''),
    baseAmountStr:  fmtCents(entry.amountBase),
    memo:           entry.memo ?? '',
    quantityStr:    entry.quantity != null ? (entry.quantity / 1e6).toString() : '',
    interestRatePct: entry.interestRate != null ? (entry.interestRate / 100).toString() : '',
    maturityDate:   entry.maturityDate ?? '',
  };
}

function blankRow(key: string, side: 'debit' | 'credit'): EntryRow {
  return {
    key,
    accountId: '',
    side,
    amountStr: '',
    rateStr: '1',
    baseAmountStr: '',
    memo: '',
    quantityStr: '',
    interestRatePct: '',
    maturityDate: '',
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TransactionForm({
  accounts,
  exchangeRates,
  tags,
  baseCurrency,
  initialValues,
  actionData,
  backLink,
  submitLabel,
  title,
}: Props) {
  const { t } = useTranslation();

  const accountMap = useMemo(
    () => new Map(accounts.map(a => [a.id, a])),
    [accounts],
  );

  const accountGroups = useMemo(() => {
    const map = new Map<string, AccountOption[]>();
    for (const acc of accounts) {
      const prefix = acc.category.split('/')[0] ?? acc.category;
      const arr = map.get(prefix) ?? [];
      arr.push(acc);
      map.set(prefix, arr);
    }
    return map;
  }, [accounts]);

  const [txDate, setTxDate]     = useState(initialValues?.date ?? '');
  const [description, setDesc]  = useState(initialValues?.description ?? '');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(
    () => new Set(initialValues?.tagIds ?? []),
  );
  const [entries, setEntries]   = useState<EntryRow[]>(() =>
    initialValues?.entries.length
      ? initialValues.entries.map((e, i) => entryToRow(e, `init-${i}`))
      : [blankRow('init-0', 'debit'), blankRow('init-1', 'credit')],
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clientError, setClientError] = useState('');

  const formRef      = useRef<HTMLFormElement>(null);
  const tagIdsRef    = useRef<HTMLInputElement>(null);
  const entriesRef   = useRef<HTMLInputElement>(null);
  const entrySeq     = useRef(1000);

  // ── Entry update helpers ───────────────────────────────────────────────────

  const patchEntry = (key: string, patch: Partial<EntryRow>) =>
    setEntries(prev => prev.map(e => e.key === key ? { ...e, ...patch } : e));

  const handleAccountChange = (key: string, accountIdStr: string) => {
    const accountId = parseInt(accountIdStr);
    const account   = accountMap.get(accountId);
    setEntries(prev => prev.map(e => {
      if (e.key !== key) return e;
      if (!account) return { ...e, accountId: accountIdStr };
      let rateStr = e.rateStr;
      if (account.isBaseCurrency) {
        rateStr = '1';
      } else {
        const found = findRate(account.currencyId, txDate, exchangeRates);
        if (found !== null) rateStr = found.toFixed(6).replace(/\.?0+$/, '');
      }
      const base = (parseFloat(e.amountStr) || 0) * (parseFloat(rateStr) || 1);
      return { ...e, accountId: accountIdStr, rateStr, baseAmountStr: base.toFixed(2) };
    }));
  };

  const handleAmountChange = (key: string, amountStr: string) => {
    setEntries(prev => prev.map(e => {
      if (e.key !== key) return e;
      const base = (parseFloat(amountStr) || 0) * (parseFloat(e.rateStr) || 1);
      return { ...e, amountStr, baseAmountStr: base.toFixed(2) };
    }));
  };

  const handleRateChange = (key: string, rateStr: string) => {
    setEntries(prev => prev.map(e => {
      if (e.key !== key) return e;
      const base = (parseFloat(e.amountStr) || 0) * (parseFloat(rateStr) || 1);
      return { ...e, rateStr, baseAmountStr: base.toFixed(2) };
    }));
  };

  const handleBaseAmountChange = (key: string, baseAmountStr: string) => {
    setEntries(prev => prev.map(e => {
      if (e.key !== key) return e;
      const amount = parseFloat(e.amountStr) || 0;
      const base   = parseFloat(baseAmountStr) || 0;
      const rateStr = amount > 0 ? (base / amount).toFixed(6).replace(/\.?0+$/, '') : e.rateStr;
      return { ...e, baseAmountStr, rateStr };
    }));
  };

  const handleDateChange = (date: string) => {
    setTxDate(date);
    setEntries(prev => prev.map(e => {
      if (!e.accountId) return e;
      const account = accountMap.get(parseInt(e.accountId));
      if (!account || account.isBaseCurrency) return e;
      const found = findRate(account.currencyId, date, exchangeRates);
      if (found === null) return e;
      const rateStr = found.toFixed(6).replace(/\.?0+$/, '');
      const base    = (parseFloat(e.amountStr) || 0) * found;
      return { ...e, rateStr, baseAmountStr: base.toFixed(2) };
    }));
  };

  const addEntry = () => {
    entrySeq.current++;
    setEntries(prev => [...prev, blankRow(`dyn-${entrySeq.current}`, 'debit')]);
  };

  const removeEntry = (key: string) =>
    setEntries(prev => prev.length > 2 ? prev.filter(e => e.key !== key) : prev);

  // ── Balance ────────────────────────────────────────────────────────────────

  const { debitBase, creditBase } = useMemo(() => {
    let debitBase = 0, creditBase = 0;
    for (const e of entries) {
      if (!e.accountId || !e.amountStr) continue;
      const cents = Math.round(parseFloat(e.amountStr) * 100);
      const rate  = parseFloat(e.rateStr) || 1;
      if (!isFinite(cents) || !isFinite(rate)) continue;
      const base = Math.round(cents * rate);
      if (e.side === 'debit') debitBase += base;
      else creditBase += base;
    }
    return { debitBase, creditBase };
  }, [entries]);

  const isBalanced = debitBase > 0 && debitBase === creditBase;

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientError('');

    const incomplete = entries.some(en => {
      if (!en.accountId || !en.amountStr) return true;
      const acc = accountMap.get(parseInt(en.accountId));
      return acc && !acc.isBaseCurrency && !en.rateStr;
    });
    if (incomplete) {
      setClientError(t('transactions.incompleteEntries'));
      return;
    }
    if (!isBalanced) {
      setClientError(t('transactions.notBalancedSubmit', {
        diff: fmtCents(Math.abs(debitBase - creditBase)),
        code: baseCurrency?.code ?? '',
      }));
      return;
    }

    tagIdsRef.current!.value  = Array.from(selectedTagIds).join(',');
    const serialized = entries.map(({ key: _k, baseAmountStr: _b, ...rest }) => rest);
    entriesRef.current!.value = JSON.stringify(serialized);

    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    formRef.current?.submit();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const baseDp = baseCurrency?.decimalPlaces ?? 2;

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="mb-4">
          <Link to={backLink} className="is-size-7 has-text-grey">
            {t('transactions.backToList')}
          </Link>
        </div>

        <div className="tx-form-page">
          <h1 className="title is-5">{title}</h1>

          {(actionData?.error || clientError) && (
            <div className="notification is-danger is-light mb-4">
              {clientError
                ? clientError
                : t(actionData!.error!, { defaultValue: actionData!.error })}
            </div>
          )}

          <form ref={formRef} method="post" onSubmit={handleSubmit}>
            {/* Hidden serialized fields */}
            <input ref={tagIdsRef}  type="hidden" name="tagIds" />
            <input ref={entriesRef} type="hidden" name="entriesJson" />

            {/* Header row */}
            <div className="columns">
              <div className="column is-narrow">
                <div className="field">
                  <label className="label" htmlFor="date">{t('transactions.date')}</label>
                  <div className="control">
                    <input
                      id="date"
                      name="date"
                      type="date"
                      className="input"
                      value={txDate}
                      onChange={e => handleDateChange(e.target.value)}
                      required
                    />
                  </div>
                  {actionData?.errors?.date && (
                    <p className="help is-danger">{actionData.errors.date[0]}</p>
                  )}
                </div>
              </div>
              <div className="column">
                <div className="field">
                  <label className="label" htmlFor="description">{t('transactions.description')}</label>
                  <div className="control">
                    <input
                      id="description"
                      name="description"
                      type="text"
                      className="input"
                      value={description}
                      onChange={e => setDesc(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="field">
                <label className="label">{t('transactions.tags')}</label>
                <div className="tx-tags-group">
                  {tags.map(tag => (
                    <label key={tag.id} className="tx-tag-label">
                      <input
                        type="checkbox"
                        checked={selectedTagIds.has(tag.id)}
                        onChange={e => {
                          const next = new Set(selectedTagIds);
                          e.target.checked ? next.add(tag.id) : next.delete(tag.id);
                          setSelectedTagIds(next);
                        }}
                      />
                      {tag.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Entry editor */}
            <div className="field">
              <label className="label">{t('transactions.entries')}</label>
              {actionData?.errors?.entries && (
                <p className="help is-danger mb-2">
                  {t(actionData.errors.entries[0] ?? '', { defaultValue: actionData.errors.entries[0] })}
                </p>
              )}
              <div className="tx-entries-wrapper">
                <table className="table is-bordered tx-entries-table">
                  <thead>
                    <tr>
                      <th className="tx-col-account">{t('transactions.account')}</th>
                      <th className="tx-col-side">{t('transactions.side')}</th>
                      <th className="tx-col-amount">{t('transactions.amount')}</th>
                      <th className="tx-col-rate">{t('transactions.rate')}</th>
                      <th className="tx-col-base">{t('transactions.base', { code: baseCurrency?.code ?? '' })}</th>
                      <th className="tx-col-memo">{t('transactions.memo')}</th>
                      <th className="tx-col-qty">{t('transactions.qty')}</th>
                      <th className="tx-col-int">{t('transactions.intPct')}</th>
                      <th className="tx-col-mat">{t('transactions.matDate')}</th>
                      <th className="tx-col-remove"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => {
                      const account = entry.accountId ? accountMap.get(parseInt(entry.accountId)) : undefined;
                      const isBase  = account?.isBaseCurrency === 1;
                      return (
                        <tr key={entry.key}>
                          <td className="tx-col-account">
                            <div className="select is-small" style={{ width: '100%' }}>
                              <select
                                style={{ width: '100%' }}
                                value={entry.accountId}
                                onChange={e => handleAccountChange(entry.key, e.target.value)}
                              >
                                <option value="">—</option>
                                {Array.from(accountGroups.entries()).map(([prefix, accs]) => (
                                  <optgroup key={prefix} label={prefix.charAt(0).toUpperCase() + prefix.slice(1)}>
                                    {accs.map(acc => (
                                      <option key={acc.id} value={acc.id}>
                                        {acc.category} ({acc.currencyCode})
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="tx-col-side">
                            <div className="tx-side-buttons buttons has-addons mb-0">
                              <button
                                type="button"
                                className={`button is-small${entry.side === 'debit' ? ' is-link is-selected' : ''}`}
                                onClick={() => patchEntry(entry.key, { side: 'debit' })}
                              >D</button>
                              <button
                                type="button"
                                className={`button is-small${entry.side === 'credit' ? ' is-success is-selected' : ''}`}
                                onClick={() => patchEntry(entry.key, { side: 'credit' })}
                              >C</button>
                            </div>
                          </td>
                          <td className="tx-col-amount">
                            <input
                              className="input is-small"
                              type="number"
                              min="0"
                              step="0.01"
                              value={entry.amountStr}
                              onChange={e => handleAmountChange(entry.key, e.target.value)}
                              placeholder="0.00"
                            />
                          </td>
                          <td className="tx-col-rate">
                            <input
                              className="input is-small"
                              type="number"
                              min="0"
                              step="any"
                              value={isBase ? '1' : entry.rateStr}
                              onChange={e => handleRateChange(entry.key, e.target.value)}
                              disabled={isBase}
                              placeholder={isBase ? '1' : ''}
                            />
                          </td>
                          <td className="tx-col-base">
                            <input
                              className="input is-small"
                              type="number"
                              min="0"
                              step="0.01"
                              value={isBase ? entry.amountStr : entry.baseAmountStr}
                              onChange={e => isBase
                                ? handleAmountChange(entry.key, e.target.value)
                                : handleBaseAmountChange(entry.key, e.target.value)}
                              placeholder={`0.${'0'.repeat(baseDp)}`}
                            />
                          </td>
                          <td className="tx-col-memo">
                            <input
                              className="input is-small"
                              type="text"
                              value={entry.memo}
                              onChange={e => patchEntry(entry.key, { memo: e.target.value })}
                              maxLength={500}
                            />
                          </td>
                          <td className="tx-col-qty">
                            <input
                              className="input is-small"
                              type="number"
                              min="0"
                              step="any"
                              value={entry.quantityStr}
                              onChange={e => patchEntry(entry.key, { quantityStr: e.target.value })}
                              placeholder={account?.accountType === 'security' ? '0' : ''}
                              disabled={account?.accountType !== 'security'}
                            />
                          </td>
                          <td className="tx-col-int">
                            <input
                              className="input is-small"
                              type="number"
                              min="0"
                              step="0.01"
                              value={entry.interestRatePct}
                              onChange={e => patchEntry(entry.key, { interestRatePct: e.target.value })}
                              placeholder={account?.accountType === 'deposit' ? '%' : ''}
                              disabled={account?.accountType !== 'deposit'}
                            />
                          </td>
                          <td className="tx-col-mat">
                            <input
                              className="input is-small"
                              type="date"
                              value={entry.maturityDate}
                              onChange={e => patchEntry(entry.key, { maturityDate: e.target.value })}
                              disabled={account?.accountType !== 'deposit'}
                            />
                          </td>
                          <td className="tx-col-remove">
                            <button
                              type="button"
                              className="delete"
                              disabled={entries.length <= 2}
                              onClick={() => removeEntry(entry.key)}
                              aria-label={t('transactions.removeEntry')}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Balance bar */}
              <div className="tx-balance-bar">
                <button type="button" className="button is-small is-light" onClick={addEntry}>
                  + {t('transactions.addEntry')}
                </button>
                <span className={`tag ${isBalanced ? 'is-success' : 'is-warning'} is-light`}>
                  {isBalanced
                    ? t('transactions.balanced')
                    : debitBase === 0 && creditBase === 0
                      ? t('transactions.noEntries')
                      : t('transactions.imbalance', {
                          diff: fmtCents(Math.abs(debitBase - creditBase), baseDp),
                          code: baseCurrency?.code ?? '',
                        })}
                </span>
              </div>
            </div>

            {/* Submit */}
            <div className="field is-grouped mt-5">
              <div className="control">
                <button type="submit" className="button is-primary">{submitLabel}</button>
              </div>
              <div className="control">
                <Link to={backLink} className="button is-light">{t('transactions.cancel')}</Link>
              </div>
            </div>
          </form>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        title={title}
        message={t('transactions.confirmSave')}
        confirmLabel={submitLabel}
        cancelLabel={t('transactions.cancel')}
        confirmVariant="is-primary"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}
