process.env['DATABASE_URL']        = './var/test.db';
process.env['AUTH_USERNAME']       = 'admin';
process.env['AUTH_PASSWORD_HASH']  = '$2b$12$test-hash-placeholder-not-used';
process.env['SESSION_SECRET']      = 'test-secret-must-be-at-least-32-characters!';
