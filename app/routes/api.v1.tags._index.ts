import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { db } from '~/db/client';
import { requireApiKey } from '~/lib/api-auth';
import { tagFormSchema } from '~/schemas/tag.schema';
import * as svc from '~/services/tag.service';

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = requireApiKey(request);
  if (auth) return auth;
  return Response.json({ data: svc.getAllTags(db) });
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

  const parsed = tagFormSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const result = svc.createTag(db, parsed.data);
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ data: null }, { status: 201 });
}
