import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { db } from '~/db/client';
import { requireApiKey } from '~/lib/api-auth';
import { transactionFormSchema } from '~/schemas/transaction.schema';
import * as svc from '~/services/transaction.service';

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = requireApiKey(request);
  if (auth) return auth;

  const sp      = new URL(request.url).searchParams;
  const page    = Math.max(1, Number(sp.get('page') ?? 1));
  const filters: svc.TransactionFilters = {};
  const q       = sp.get('q');        if (q)        filters.q        = q;
  const dateFrom = sp.get('dateFrom'); if (dateFrom) filters.dateFrom = dateFrom;
  const dateTo   = sp.get('dateTo');   if (dateTo)   filters.dateTo   = dateTo;
  const tagIdStr = sp.get('tagId');    if (tagIdStr) filters.tagId    = Number(tagIdStr);

  const result = svc.getTransactionsPageData(db, filters, page);
  return Response.json({ data: result });
}

export async function action({ request }: ActionFunctionArgs) {
  const auth = requireApiKey(request);
  if (auth) return auth;

  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = transactionFormSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const result = svc.createTransaction(db, parsed.data);
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ data: result.data }, { status: 201 });
}
