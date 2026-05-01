import { createCookieSessionStorage } from 'react-router';
import { env } from './config';

const { getSession, commitSession, destroySession } = createCookieSessionStorage({
  cookie: {
    name: '__session',
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secrets: [env.SESSION_SECRET],
    secure: process.env.NODE_ENV === 'production',
  },
});

export { getSession, commitSession, destroySession };
