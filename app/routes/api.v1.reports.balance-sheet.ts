import type { LoaderFunctionArgs } from 'react-router';
import { db } from '~/db/client';
import { requireApiKey } from '~/lib/api-auth';
import { getBalanceSheet } from '~/services/reports.service';

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = requireApiKey(request);
  if (auth) return auth;

  const sp    = new URL(request.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const month = sp.get('month') ?? today.slice(0, 7);

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  return Response.json({ data: getBalanceSheet(db, month, today) });
}
