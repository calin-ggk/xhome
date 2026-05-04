import "./_app.settings.snapshots.css";
import { useActionData, useLoaderData, useNavigation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { db } from '~/db/client';
import {
  getSnapshotStatus,
  generateMissingSnapshots,
} from '~/services/snapshot.service';
import type { MissingRate, ManualRate } from '~/services/snapshot.service';
import type { Route } from './+types/_app.settings.snapshots';

export async function loader(_: Route.LoaderArgs) {
  return getSnapshotStatus(db);
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

  const manualRates: ManualRate[] = [];
  for (const [key, value] of formData.entries()) {
    const match = (key as string).match(/^rate_(\d+)_(.+)$/);
    if (match) {
      const rateDecimal = parseFloat(value as string);
      if (isFinite(rateDecimal) && rateDecimal > 0) {
        manualRates.push({
          currencyId:   parseInt(match[1]!, 10),
          snapshotDate: match[2]!,
          rateDecimal,
        });
      }
    }
  }

  const result = await generateMissingSnapshots(db, manualRates);

  if (!result.ok && 'missingRates' in result) {
    return { status: 'needs_rates' as const, missingRates: result.missingRates };
  }
  if (!result.ok) {
    return { status: 'error' as const, error: result.error };
  }
  return {
    status:          'success' as const,
    monthsGenerated: result.monthsGenerated,
    snapshotsCreated: result.snapshotsCreated,
  };
}

export default function SnapshotsPage() {
  const { missingMonths, snapshotCount } = useLoaderData<typeof loader>();
  const actionData  = useActionData<typeof action>();
  const navigation  = useNavigation();
  const { t }       = useTranslation();

  const isSubmitting = navigation.state === 'submitting';
  const needsRates   = actionData?.status === 'needs_rates';
  const isSuccess    = actionData?.status === 'success';
  const isError      = actionData?.status === 'error';

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
                    <li key={sd}>{formatSnapshotMonth(sd)}</li>
                  ))}
                </ul>
              </div>

              {needsRates && actionData && (
                <div className="notification is-warning">
                  <p className="mb-3">{t('snapshots.ratesFetchFailed')}</p>
                  <form method="post">
                    <table className="table is-narrow mb-3">
                      <thead>
                        <tr>
                          <th>{t('snapshots.currency')}</th>
                          <th>{t('snapshots.snapshotMonth')}</th>
                          <th>{t('snapshots.rate')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(actionData.missingRates as MissingRate[]).map(r => (
                          <tr key={`${r.currencyId}-${r.snapshotDate}`}>
                            <td>{r.currencyCode}</td>
                            <td>{formatSnapshotMonth(r.snapshotDate)}</td>
                            <td>
                              <input
                                className="input is-small snapshot-rate-input"
                                type="number"
                                step="0.0001"
                                min="0.0001"
                                name={`rate_${r.currencyId}_${r.snapshotDate}`}
                                required
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      type="submit"
                      className="button is-primary"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? t('snapshots.generating') : t('snapshots.generateWithRates')}
                    </button>
                  </form>
                </div>
              )}

              {!needsRates && (
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

function formatSnapshotMonth(snapshotDate: string): string {
  // snapshotDate = YYYY-MM-01 (first of next month); displayed month is one month before
  const [yearStr, monthStr] = snapshotDate.split('-');
  const d = new Date(Date.UTC(parseInt(yearStr!, 10), parseInt(monthStr!, 10) - 2, 1));
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
