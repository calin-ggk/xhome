import type { LoaderFunctionArgs } from 'react-router';
import { db } from '~/db/client';
import { requireApiKey } from '~/lib/api-auth';
import { getNetWorthHistoryData } from '~/services/reports.service';

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = requireApiKey(request);
  if (auth) return auth;
  return Response.json({ data: getNetWorthHistoryData(db) });
}
