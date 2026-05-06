import { env } from '~/config';

export function requireApiKey(request: Request): Response | null {
  if (!env.API_KEY) {
    return Response.json({ error: 'API not configured — set API_KEY env var' }, { status: 503 });
  }
  const key = request.headers.get('X-API-Key');
  if (!key || key !== env.API_KEY) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
