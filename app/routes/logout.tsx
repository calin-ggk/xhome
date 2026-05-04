import { redirect } from 'react-router';
import { getSession, destroySession } from '../session.server';
import { logger } from '../lib/logger';
import type { Route } from './+types/logout';

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'));
  logger.info({ event: 'auth.logout' });
  return redirect('/login', {
    headers: { 'Set-Cookie': await destroySession(session) },
  });
}
