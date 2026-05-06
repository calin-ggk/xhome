import type { LoaderFunctionArgs } from 'react-router';
import { db } from '~/db/client';
import { requireApiKey } from '~/lib/api-auth';
import { getNetWorthByCurrencyData } from '~/services/reports.service';

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = requireApiKey(request);
  if (auth) return auth;

  const sp   = new URL(request.url).searchParams;
  const from = sp.get('from') ?? null;
  const to   = sp.get('to')   ?? null;

  if (from && !/^\d{4}-\d{2}$/.test(from)) {
    return Response.json({ error: 'from must be YYYY-MM' }, { status: 400 });
  }
  if (to && !/^\d{4}-\d{2}$/.test(to)) {
    return Response.json({ error: 'to must be YYYY-MM' }, { status: 400 });
  }

  return Response.json({ data: getNetWorthByCurrencyData(db, from, to) });
}
