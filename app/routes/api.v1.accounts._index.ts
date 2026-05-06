import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { db } from '~/db/client';
import { requireApiKey } from '~/lib/api-auth';
import { accountFormSchema } from '~/schemas/account.schema';
import * as svc from '~/services/account.service';

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = requireApiKey(request);
  if (auth) return auth;
  const { groups } = svc.getAccountsPageData(db);
  const accounts = groups.flatMap(g => g.accounts);
  return Response.json({ data: accounts });
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

  const parsed = accountFormSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const result = svc.createAccount(db, parsed.data);
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ data: result.data }, { status: 201 });
}
