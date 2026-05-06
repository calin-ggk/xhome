import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { db } from '~/db/client';
import { requireApiKey } from '~/lib/api-auth';
import { tagFormSchema } from '~/schemas/tag.schema';
import * as svc from '~/services/tag.service';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = requireApiKey(request);
  if (auth) return auth;

  const id = Number(params['id']);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  const tag = svc.getTagById(db, id);
  if (!tag) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ data: tag });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = requireApiKey(request);
  if (auth) return auth;

  const id = Number(params['id']);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  if (request.method === 'DELETE') {
    const result = svc.deleteTag(db, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
    return Response.json({ data: null });
  }

  if (request.method === 'PUT') {
    let body: unknown;
    try { body = await request.json(); } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = tagFormSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
    }
    const result = svc.updateTag(db, id, parsed.data);
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
    return Response.json({ data: null });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
