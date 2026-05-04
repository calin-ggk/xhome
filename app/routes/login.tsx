import bcrypt from 'bcryptjs';
import { redirect, useActionData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { env } from '../config';
import { getSession, commitSession } from '../session.server';
import { logger } from '../lib/logger';
import type { Route } from './+types/login';

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get('Cookie'));
  if (session.get('authenticated')) return redirect('/');
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const username = String(form.get('username') ?? '');
  const password = String(form.get('password') ?? '');

  const valid =
    username === env.AUTH_USERNAME &&
    (await bcrypt.compare(password, env.AUTH_PASSWORD_HASH));

  if (!valid) {
    logger.warn({ event: 'auth.login', username, success: false });
    return { errorKey: 'login.invalidCredentials' };
  }

  logger.info({ event: 'auth.login', username, success: true });
  const session = await getSession(request.headers.get('Cookie'));
  session.set('authenticated', true);
  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  });
}

export default function LoginPage() {
  const data = useActionData<typeof action>();
  const { t } = useTranslation();

  return (
    <section className="hero is-fullheight">
      <div className="hero-body">
        <div className="container">
          <div className="columns is-centered">
            <div className="column is-4">
              <h1 className="title has-text-centered">{t('financeTracker')}</h1>
              <div className="box">
                <form method="post">
                  <div className="field">
                    <label className="label" htmlFor="username">{t('login.username')}</label>
                    <div className="control">
                      <input
                        id="username"
                        name="username"
                        className="input"
                        type="text"
                        autoComplete="username"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="password">{t('login.password')}</label>
                    <div className="control">
                      <input
                        id="password"
                        name="password"
                        className="input"
                        type="password"
                        autoComplete="current-password"
                      />
                    </div>
                  </div>
                  {data?.errorKey && (
                    <p className="help is-danger">{t(data.errorKey)}</p>
                  )}
                  <div className="field mt-4">
                    <button className="button is-primary is-fullwidth" type="submit">
                      {t('login.signIn')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
