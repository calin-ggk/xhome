import bcrypt from 'bcryptjs';
import { redirect, useActionData } from 'react-router';
import { env } from '../config';
import { getSession, commitSession } from '../session.server';
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

  if (!valid) return { error: 'Invalid username or password.' };

  const session = await getSession(request.headers.get('Cookie'));
  session.set('authenticated', true);
  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  });
}

export default function LoginPage() {
  const data = useActionData<typeof action>();

  return (
    <section className="hero is-fullheight">
      <div className="hero-body">
        <div className="container">
          <div className="columns is-centered">
            <div className="column is-4">
              <h1 className="title has-text-centered">Finance Tracker</h1>
              <div className="box">
                <form method="post">
                  <div className="field">
                    <label className="label" htmlFor="username">Username</label>
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
                    <label className="label" htmlFor="password">Password</label>
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
                  {data?.error && (
                    <p className="help is-danger">{data.error}</p>
                  )}
                  <div className="field mt-4">
                    <button className="button is-primary is-fullwidth" type="submit">
                      Sign in
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
