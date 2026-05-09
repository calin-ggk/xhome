import "./_app.snapshots.css";
import { useActionData, useLoaderData, useNavigation } from 'react-router';
import { AmountInput } from '~/components/AmountInput';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import {
  getSnapshotStatus,
  generateMissingSnapshots,
} from '~/services/snapshot.service';
import type { MissingRate, MissingSecurityPrice, ManualRate, ManualSecurityPrice } from '~/services/snapshot.service';
import { useFormat } from '~/hooks/useFormat';
import type { Route } from './+types/_app.snapshots';

export async function loader(_: Route.LoaderArgs) {
  return getSnapshotStatus(db);
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

  const manualRates: ManualRate[] = [];
  const manualPrices: ManualSecurityPrice[] = [];

  for (const [key, value] of formData.entries()) {
    const rateMatch = (key as string).match(/^rate_(\d+)_(.+)$/);
    if (rateMatch) {
      const rateDecimal = parseFloat(value as string);
      if (isFinite(rateDecimal) && rateDecimal > 0) {
        manualRates.push({
          currencyId:   parseInt(rateMatch[1]!, 10),
          snapshotDate: rateMatch[2]!,
          rateDecimal,
        });
      }
    }

    const priceMatch = (key as string).match(/^price_(\d+)_(.+)$/);
    if (priceMatch) {
      const priceDecimal = parseFloat(value as string);
      if (isFinite(priceDecimal) && priceDecimal > 0) {
        manualPrices.push({
          securityId:   parseInt(priceMatch[1]!, 10),
          snapshotDate: priceMatch[2]!,
          priceDecimal,
        });
      }
    }
  }

  const result = await generateMissingSnapshots(db, manualRates, manualPrices);

  if (!result.ok && 'missingRates' in result) {
    return {
      status:        'needs_manual' as const,
      missingRates:  result.missingRates,
      missingPrices: result.missingPrices,
    };
  }
  if (!result.ok) {
    return { status: 'error' as const, error: result.error };
  }
  return {
    status:           'success' as const,
    monthsGenerated:  result.monthsGenerated,
    snapshotsCreated: result.snapshotsCreated,
  };
}

export default function SnapshotsPage() {
  const { missingMonths, snapshotCount } = useLoaderData<typeof loader>();
  const actionData  = useActionData<typeof action>();
  const navigation  = useNavigation();
  const { t }       = useTranslation();
  const { fmtMonthLong } = useFormat();

  const isSubmitting   = navigation.state === 'submitting';
  const needsManual    = actionData?.status === 'needs_manual';
  const isSuccess      = actionData?.status === 'success';
  const isError        = actionData?.status === 'error';

  const missingRates  = needsManual ? (actionData.missingRates  as MissingRate[])         : [];
  const missingPrices = needsManual ? (actionData.missingPrices as MissingSecurityPrice[]) : [];

  return (
    <section className="section pt-0">
      <div className="container is-fluid">
        <div className="snapshots-page">
          <h2 className="title is-4">{t('snapshots.title')}</h2>

          <div className="snapshot-stats mb-5">
            <p>{t('snapshots.snapshotCount', { count: snapshotCount })}</p>
            <p>{t('snapshots.missingCount', { count: missingMonths.length })}</p>
          </div>

          {isSuccess && actionData && (
            <div className="notification is-success">
              {t('snapshots.generateSuccess', { months: actionData.monthsGenerated })}
            </div>
          )}

          {isError && actionData && (
            <div className="notification is-danger">
              {t('snapshots.generateFailed')}
            </div>
          )}

          {missingMonths.length === 0 ? (
            <div className="notification is-success is-light">
              {t('snapshots.allCurrent')}
            </div>
          ) : (
            <>
              <div className="mb-4">
                <p className="snapshot-section-label">{t('snapshots.missingMonths')}</p>
                <ul className="snapshot-month-list">
                  {missingMonths.map(sd => (
                    <li key={sd}>{fmtMonthLong(snapshotToMonthKey(sd))}</li>
                  ))}
                </ul>
              </div>

              {needsManual && (
                <div className="notification is-warning">
                  <form method="post">
                    {missingRates.length > 0 && (
                      <>
                        <p className="mb-3">{t('snapshots.ratesFetchFailed')}</p>
                        <table className="table is-narrow mb-4">
                          <thead>
                            <tr>
                              <th>{t('snapshots.currency')}</th>
                              <th>{t('snapshots.snapshotMonth')}</th>
                              <th>{t('snapshots.rate')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {missingRates.map(r => (
                              <tr key={`${r.currencyId}-${r.snapshotDate}`}>
                                <td>{r.currencyCode}</td>
                                <td>{fmtMonthLong(snapshotToMonthKey(r.snapshotDate))}</td>
                                <td>
                                  <AmountInput
                                    className="input is-small snapshot-rate-input"
                                    decimals={4}
                                    name={`rate_${r.currencyId}_${r.snapshotDate}`}
                                    required
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {missingPrices.length > 0 && (
                      <>
                        <p className="mb-3">{t('snapshots.pricesFetchFailed')}</p>
                        <table className="table is-narrow mb-4">
                          <thead>
                            <tr>
                              <th>{t('snapshots.security')}</th>
                              <th>{t('snapshots.snapshotMonth')}</th>
                              <th>{t('snapshots.price')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {missingPrices.map(p => (
                              <tr key={`${p.securityId}-${p.snapshotDate}`}>
                                <td>{p.ticker}</td>
                                <td>{fmtMonthLong(snapshotToMonthKey(p.snapshotDate))}</td>
                                <td>
                                  <AmountInput
                                    className="input is-small snapshot-rate-input"
                                    decimals={2}
                                    name={`price_${p.securityId}_${p.snapshotDate}`}
                                    required
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    <button
                      type="submit"
                      className="button is-primary"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? t('snapshots.generating') : t('snapshots.generateWithManual')}
                    </button>
                  </form>
                </div>
              )}

              {!needsManual && (
                <form method="post">
                  <button
                    type="submit"
                    className="button is-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? t('snapshots.generating') : t('snapshots.generate')}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// snapshotDate = YYYY-MM-01 (first of next month); displayed month is one month before
function snapshotToMonthKey(snapshotDate: string): string {
  const [y, m] = snapshotDate.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
