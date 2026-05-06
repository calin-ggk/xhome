import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { db } from '~/db/client';
import { requireApiKey } from '~/lib/api-auth';
import { accountFormSchema } from '~/schemas/account.schema';
import * as svc from '~/services/account.service';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = requireApiKey(request);
  if (auth) return auth;

  const id = Number(params['id']);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  const data = svc.getEditAccountFormData(db, id);
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ data: data.account });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = requireApiKey(request);
  if (auth) return auth;

  const id = Number(params['id']);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  if (request.method === 'DELETE') {
    const result = svc.deleteAccount(db, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
    return Response.json({ data: null }, { status: 200 });
  }

  if (request.method === 'PUT') {
    let body: unknown;
    try { body = await request.json(); } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = accountFormSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
    }
    const result = svc.updateAccount(db, id, parsed.data);
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
    return Response.json({ data: result.data });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
